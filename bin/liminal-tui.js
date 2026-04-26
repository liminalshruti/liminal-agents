#!/usr/bin/env node
/**
 * liminal-tui — Ink-based terminal UI for the demo recording.
 *
 * Renders the three-agent flow visually: Analyst, SDR, Auditor each in their
 * own pane. The agent in lane shows ACTIVE → COMPLETE with full output.
 * The agent out of lane shows REFUSED with the refusal text in distinct color.
 *
 * Usage:
 *   node bin/liminal-tui.js "<task description>"
 *
 * Built without JSX (uses React.createElement shorthand) so it runs without
 * a build step. Designed for the AI Agent Economy hackathon demo (Apr 25).
 */

import React, { useEffect, useState } from "react";
import { render, Box, Text } from "ink";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUN_SCRIPT = path.join(here, "..", "skills", "agency", "run.js");

const h = React.createElement;

const AGENTS = [
  { name: "Analyst", lane: "diligence · teardowns · research", color: "cyan" },
  { name: "SDR", lane: "outreach · cold email · move", color: "yellow" },
  { name: "Auditor", lane: "judges readiness · names gaps", color: "magenta" },
];

const STATUS_IDLE = "IDLE";
const STATUS_ACTIVE = "ACTIVE";
const STATUS_COMPLETE = "COMPLETE";
const STATUS_REFUSED = "REFUSED";
const STATUS_ERROR = "ERROR";

function App({ task }) {
  const [status, setStatus] = useState({
    Analyst: STATUS_IDLE,
    SDR: STATUS_IDLE,
    Auditor: STATUS_IDLE,
  });
  const [outputs, setOutputs] = useState({});
  const [vaultId, setVaultId] = useState(null);
  const [mode, setMode] = useState(null);
  const [done, setDone] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  useEffect(() => {
    setStatus({ Analyst: STATUS_ACTIVE, SDR: STATUS_ACTIVE, Auditor: STATUS_ACTIVE });

    const proc = spawn(process.execPath, [RUN_SCRIPT, task], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code !== 0) {
        setErrMsg(`agency runner exited ${code}: ${stderr.slice(0, 400).trim()}`);
        setDone(true);
        return;
      }
      try {
        const j = JSON.parse(stdout);
        const next = {};
        const outs = {};
        for (const a of AGENTS) {
          const slot = j[a.name.toLowerCase()];
          if (slot?.refused) next[a.name] = STATUS_REFUSED;
          else if (slot?.interpretation) next[a.name] = STATUS_COMPLETE;
          else next[a.name] = STATUS_ERROR;
          outs[a.name] = slot?.interpretation || "";
        }
        setStatus(next);
        setOutputs(outs);
        setVaultId(j.vault_id);
        setMode(j.anthropic_mode);
        setDone(true);
      } catch (e) {
        setErrMsg(`parse error: ${e.message}\nraw: ${stdout.slice(0, 400)}`);
        setDone(true);
      }
    });
  }, [task]);

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(Header, { task, mode, vaultId }),
    h(Box, { flexDirection: "column", marginTop: 1 },
      ...AGENTS.map((a) =>
        h(AgentPane, {
          key: a.name,
          agent: a,
          status: status[a.name],
          output: outputs[a.name] || "",
        }),
      ),
    ),
    done ? h(Footer, { vaultId, errMsg }) : h(Spinner),
  );
}

function Header({ task, mode, vaultId }) {
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "gray", paddingX: 1 },
    h(Text, { color: "white", bold: true }, "Liminal Agents — agency-priced work, bounded refusal"),
    h(Text, { color: "gray", dimColor: true }, `task: ${task}`),
    h(Text, { color: "gray", dimColor: true },
      `mode: ${mode || "…"}   vault: ${vaultId ? vaultId.slice(0, 8) : "…"}`),
  );
}

function AgentPane({ agent, status, output }) {
  const statusColor =
    status === STATUS_COMPLETE ? "green" :
      status === STATUS_REFUSED ? "yellow" :
        status === STATUS_ACTIVE ? "blue" :
          status === STATUS_ERROR ? "red" : "gray";

  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: agent.color,
      paddingX: 1,
      marginTop: 1,
    },
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { color: agent.color, bold: true }, agent.name.toUpperCase()),
      h(Text, { color: statusColor, bold: true }, status),
    ),
    h(Text, { color: "gray", dimColor: true }, agent.lane),
    output
      ? h(Box, { marginTop: 1 },
        h(Text,
          { color: status === STATUS_REFUSED ? "yellow" : "white", wrap: "wrap" },
          output))
      : null,
  );
}

function Spinner() {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  return h(Box, { marginTop: 1 },
    h(Text, { color: "blue" }, `${frames[frame]} agents working…`));
}

function Footer({ vaultId, errMsg }) {
  if (errMsg) {
    return h(Box, { marginTop: 1 },
      h(Text, { color: "red" }, `error: ${errMsg}`));
  }
  return h(Box, { marginTop: 1, flexDirection: "column" },
    h(Text, { color: "gray" }, `vault: deliberation ${vaultId} stored. /history shows the record.`),
    h(Text, { color: "gray", dimColor: true }, "the record is the moat."),
  );
}

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('Usage: liminal-tui "<task description>"');
  console.error('Example: liminal-tui "teardown of cofeld.com"');
  process.exit(1);
}

render(h(App, { task }));
