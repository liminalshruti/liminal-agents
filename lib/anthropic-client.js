/**
 * Anthropic client factory.
 *
 * Returns either:
 *   - the real @anthropic-ai/sdk client (preferred; lower latency, full control)
 *   - the claude-CLI shim (when only OAuth is available)
 *   - null (no auth path; caller decides whether to error)
 *
 * Resolution order matches lib/auth.js, plus one OAuth-specific branch:
 *   1. Console API key (sk-ant-api03-...) → SDK
 *   2. Any other key value present (incl. sk-ant-oat01-) → CLI shim, since the
 *      direct API rejects OAuth tokens but `claude` CLI accepts them
 *   3. No key set, but `claude` binary exists → CLI shim (Keychain-stored auth)
 *   4. Nothing → null
 */

import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey } from "./auth.js";
import { ClaudeCliClient, claudeCliAvailable } from "./anthropic-cli-shim.js";

export const CLIENT_MODE_API = "api";
export const CLIENT_MODE_CLI = "cli";

export function makeClient({ requireApi = false, log = null } = {}) {
  const key = resolveAnthropicKey();
  if (key && key.startsWith("sk-ant-api")) {
    return { client: new Anthropic({ apiKey: key }), mode: CLIENT_MODE_API };
  }
  if (requireApi) {
    return { client: null, mode: null };
  }
  if (claudeCliAvailable()) {
    if (key) {
      log?.info?.(
        { reason: "non_api_key" },
        "anthropic_client_falling_back_to_cli",
      );
    }
    return { client: new ClaudeCliClient(), mode: CLIENT_MODE_CLI };
  }
  return { client: null, mode: null };
}

export function makeClientOrExit({ requireApi = false } = {}) {
  const { client, mode } = makeClient({ requireApi });
  if (!client) {
    console.error(
      [
        "ERROR: no Anthropic credential or `claude` CLI found.",
        "",
        "Recommended (uses your Claude subscription):",
        "  claude setup-token",
        "  # then re-run; the daemon will use `claude -p` for inference",
        "",
        "Or set a Console API key (faster, full control):",
        "  export ANTHROPIC_API_KEY=sk-ant-api03-...",
      ].join("\n"),
    );
    process.exit(1);
  }
  return { client, mode };
}
