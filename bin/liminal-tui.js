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

// Item #5: tightened lane copy — "the X lane" pattern. Repetition makes the
// bounded-domain claim audible. Reads cleaner under the agent name.
const AGENTS = [
  { name: "Analyst", lane: "the diligence lane", color: "cyan" },
  { name: "SDR", lane: "the outreach lane", color: "yellow" },
  { name: "Auditor", lane: "the judgment lane", color: "magenta" },
];

// Stagger interval for the post-completion state transitions. Item #1.
// Refusals fire first to create the "wait — it refused?" beat on camera.
const STAGGER_MS = 600;

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

        // Item #1: stagger state transitions so the refusal beat lands first.
        // Refusals are the demo punchline — they should hit before the
        // completed agents fill in. Fires every 600ms.
        const refusedFirst = AGENTS.filter((a) => next[a.name] === STATUS_REFUSED);
        const completedAfter = AGENTS.filter((a) => next[a.name] !== STATUS_REFUSED);
        const sequence = [...refusedFirst, ...completedAfter];

        sequence.forEach((a, i) => {
          setTimeout(() => {
            setStatus((s) => ({ ...s, [a.name]: next[a.name] }));
            setOutputs((o) => ({ ...o, [a.name]: outs[a.name] }));
          }, i * STAGGER_MS);
        });
        setTimeout(() => {
          setVaultId(j.vault_id);
          setMode(j.anthropic_mode);
          setDone(true);
        }, sequence.length * STAGGER_MS);
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
    // Item #4: subtle vertical rhythm separator. Brand-coherent (matches the
    // sigil's restraint) — the eye gets a "now the work starts" cue.
    h(
      Box,
      { marginTop: 1, justifyContent: "center" },
      h(Text, { color: "gray", dimColor: true }, "·   ·   ·"),
    ),
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
  // Sacred-geometry inspired sigil — three-fold (one agent per stroke)
  // Renders as a calm visual anchor without religious or metaphysical framing.
  const sigil = "◇  ◆  ◇";
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "gray", paddingX: 1 },
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { color: "white", bold: true }, "Liminal Agents — bounded refusal, agency-priced work"),
      h(Text, { color: "gray", dimColor: true }, sigil),
    ),
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
      // Item #2: REFUSED gets a double border so the refusal beat is
      // unmistakable in a single screenshot. Refusal is the demo punchline;
      // it earns visual emphasis.
      borderStyle: status === STATUS_REFUSED ? "double" : "single",
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
    // Item #2: 1-line REFUSED callout above the refusal text. Boxed in yellow
    // so a single freeze-frame on the refusal carries the entire claim.
    status === STATUS_REFUSED && output
      ? h(
          Box,
          {
            marginTop: 1,
            paddingX: 1,
            borderStyle: "single",
            borderColor: "yellow",
          },
          h(Text, { color: "yellow", bold: true }, "↩  REFUSED — out of lane"),
        )
      : null,
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
    // Item #3: replace soft "the record is the moat" with the sharper Apr 25
    // demo-script line. Two strongest claims in one freeze-frame.
    h(Text, { color: "gray", dimColor: true }, "refusal is the feature. the record is the moat."),
  );
}

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('Usage: liminal-tui "<task description>"');
  console.error('Example: liminal-tui "teardown of cofeld.com"');
  process.exit(1);
}

render(h(App, { task }));
