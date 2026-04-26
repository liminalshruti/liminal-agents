import Anthropic from "@anthropic-ai/sdk";
import { resolveAnthropicKey } from "./auth.js";
import { ClaudeCliClient, claudeCliAvailable } from "./anthropic-cli-shim.js";

export const CLIENT_MODE_API = "api";
export const CLIENT_MODE_CLI = "cli";

export function makeClient({ requireApi = false } = {}) {
  const key = resolveAnthropicKey();
  if (key && key.startsWith("sk-ant-api")) {
    return { client: new Anthropic({ apiKey: key }), mode: CLIENT_MODE_API };
  }
  if (requireApi) return { client: null, mode: null };
  if (claudeCliAvailable()) {
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
        "",
        "Or set a Console API key (faster):",
        "  export ANTHROPIC_API_KEY=sk-ant-api03-...",
      ].join("\n"),
    );
    process.exit(1);
  }
  return { client, mode };
}
