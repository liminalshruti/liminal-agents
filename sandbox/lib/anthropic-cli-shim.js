import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DEFAULT_BINARY = "claude";
const DEFAULT_TIMEOUT_MS = 180_000;

export function claudeCliAvailable(binary = DEFAULT_BINARY) {
  if (binary.includes("/")) return existsSync(binary);
  return true;
}

export class ClaudeCliClient {
  constructor({ binary = DEFAULT_BINARY, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.binary = binary;
    this.timeoutMs = timeoutMs;
    this._chain = Promise.resolve();
    this.messages = { create: this._create.bind(this) };
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
    this._chain = next.then(() => undefined, () => undefined);
    return next;
  }

  _spawn(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binary, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
        reject(new Error(`claude CLI timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      proc.stdout.on("data", (d) => (stdout += d));
      proc.stderr.on("data", (d) => (stderr += d));
      proc.on("error", (err) => { clearTimeout(timer); reject(err); });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`claude CLI exit ${code}: ${stderr.slice(0, 500).trim()}`));
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
