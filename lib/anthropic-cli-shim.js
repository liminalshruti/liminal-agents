/**
 * `claude -p` shim that mimics the @anthropic-ai/sdk messages.create surface.
 *
 * Used as a fallback when no Anthropic API key is available but the user
 * has authenticated Claude Code via `claude setup-token`. The OAuth token
 * is stored in macOS Keychain by Claude Code itself; we don't see it.
 *
 * Trade-offs vs. the direct SDK:
 *   - 5–10s per call (subprocess spawn + Claude Code bootstrap)
 *   - max_tokens, temperature, top_p are not enforced (CLI doesn't expose them)
 *   - usage tokens not returned
 *   - parallel calls = parallel processes (memory-heavy at scale)
 *
 * The shim still works for the substrate's three usage patterns:
 *   - bounded-agent free-form text (orchestrator, close)
 *   - JSON-only synthesis (close, thread-detect) — existing extractJson()
 *     regex tolerates any markdown wrapping the CLI emits
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_BINARY = "claude";
const DEFAULT_TIMEOUT_MS = 120_000;

export function claudeCliAvailable(binary = DEFAULT_BINARY) {
  if (binary.includes("/")) return existsSync(binary);
  // `claude` is on PATH for the user; we trust which-style resolution at exec
  // time. Optimistically return true; spawn() will surface ENOENT if missing.
  return true;
}

export class ClaudeCliClient {
  constructor({
    binary = DEFAULT_BINARY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.binary = binary;
    this.timeoutMs = timeoutMs;
    // Single-flight queue. Each `claude -p` call boots a full Claude Code
    // runtime with every configured MCP server, easily 1–2 GB RAM apiece.
    // Concurrent calls cause OOM on real machines, so we serialize.
    this._chain = Promise.resolve();
    this.messages = {
      create: this._create.bind(this),
    };
  }

  async _create({ model, system, messages }) {
    const userPrompt = extractUserPrompt(messages);
    const fullPrompt = system
      ? `<system>\n${system}\n</system>\n\n${userPrompt}`
      : userPrompt;

    const args = ["-p", fullPrompt];
    if (model) args.push("--model", model);

    const text = await this._enqueue(() => this._spawn(args));
    return {
      content: [{ type: "text", text }],
      model: model || "unknown",
      stop_reason: "end_turn",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }

  _enqueue(task) {
    const next = this._chain.then(task, task);
    // Don't propagate failures into the next queued task; each call is
    // independent. The original promise still rejects to its caller.
    this._chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  _spawn(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binary, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        reject(new Error(`claude CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new Error(
              `claude CLI exit ${code}: ${stderr.slice(0, 500).trim()}`,
            ),
          );
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}

function extractUserPrompt(messages) {
  const last = messages?.[messages.length - 1];
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .filter((b) => b.type === "text" || typeof b.text === "string")
      .map((b) => b.text || "")
      .join("\n");
  }
  return "";
}
