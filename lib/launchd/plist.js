function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderPlist({
  label = "io.liminal.substrate",
  nodePath,
  scriptPath,
  logPath,
  env = {},
} = {}) {
  if (!nodePath || !scriptPath || !logPath) {
    throw new Error("renderPlist: nodePath, scriptPath, logPath are required");
  }
  const envEntries = Object.entries(env);
  const envBlock =
    envEntries.length === 0
      ? ""
      : `
  <key>EnvironmentVariables</key>
  <dict>
${envEntries.map(([k, v]) => `    <key>${esc(k)}</key><string>${esc(v)}</string>`).join("\n")}
  </dict>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(scriptPath)}</string>
  </array>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${esc(logPath)}</string>
  <key>StandardErrorPath</key><string>${esc(logPath)}</string>${envBlock}
</dict>
</plist>
`;
}
