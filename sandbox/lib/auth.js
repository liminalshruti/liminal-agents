const KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_PLUGIN_OPTION_ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
];

export function resolveAnthropicKey() {
  for (const name of KEY_VARS) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}
