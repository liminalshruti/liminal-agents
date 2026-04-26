#!/usr/bin/env node
/**
 * liminal-tui — Ink-based terminal UI for the demo recording.
 *
 * Renders the three-agent flow visually: Analyst, SDR, Auditor each in their
 * own pane. The agent in lane shows ACTIVE → COMPLETE with full output.
 * The agent out of lane shows REFUSED with a yellow callout above the text.
 *
 * Usage:
 *   node bin/liminal-tui.js "<task description>"
 *
 * Built without JSX (uses React.createElement shorthand) so it runs without
 * a build step. Designed for the AI Agent Economy hackathon demo (Apr 25).
 */

import React, { useEffect, useState, useRef } from "react";
import { render, Box, Text } from "ink";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RUN_SCRIPT = path.join(here, "..", "skills", "agency", "run.js");

const h = React.createElement;

// Brand constants — single source of truth so the sigil + tagline match the
// SPEC voice register without scattered string literals.
const TAGLINE = "Liminal Agents — bounded refusal, agency-priced work";
const SIGIL = "◇  ◆  ◇";
const FOOTER_LINE = "refusal is the feature. the record is the moat.";

// Tightened lane copy — "the X lane" pattern. Repetition makes the
// bounded-domain claim audible. Reads cleaner under the agent name.
const AGENTS = [
  { name: "Analyst", lane: "the diligence lane", color: "cyan" },
  { name: "SDR", lane: "the outreach lane", color: "yellow" },
  { name: "Auditor", lane: "the judgment lane", color: "magenta" },
];

// Stagger interval for the post-completion state transitions.
// Refusals fire first to create the "wait — it refused?" beat on camera.
const STAGGER_MS = 600;

// Cap output rendering so a runaway response doesn't blow up the screen
// recording's framing. 60 lines is enough for a real teardown; beyond that
// we render an indicator. Vault still stores the full text.
const MAX_OUTPUT_LINES = 60;

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
  const startedAt = useRef(Date.now());

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

        // Stagger state transitions so the refusal beat lands first.
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

  const stillActive = AGENTS
    .filter((a) => status[a.name] === STATUS_ACTIVE)
    .map((a) => a.name);

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(Header, { task, mode, vaultId, startedAt: startedAt.current, done }),
    h(
      Box,
      { marginTop: 1, justifyContent: "center" },
      h(Text, { color: "gray", dimColor: true }, "·   ·   ·"),
    ),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...AGENTS.map((a) =>
        h(AgentPane, {
          key: a.name,
          agent: a,
          status: status[a.name],
          output: outputs[a.name] || "",
        }),
      ),
    ),
    done ? h(Footer, { vaultId, errMsg }) : h(WorkingIndicator, { stillActive, startedAt: startedAt.current }),
  );
}

function Header({ task, mode, vaultId, startedAt, done }) {
  return h(
    Box,
    { flexDirection: "column", borderStyle: "round", borderColor: "gray", paddingX: 1 },
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { color: "white", bold: true }, TAGLINE),
      h(Text, { color: "gray", dimColor: true }, SIGIL),
    ),
    h(Text, { color: "gray", dimColor: true }, `task: ${task}`),
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { color: "gray", dimColor: true },
        `mode: ${mode || "…"}   vault: ${vaultId ? vaultId.slice(0, 8) : "…"}`),
      h(Elapsed, { startedAt, frozen: done }),
    ),
  );
}

function Elapsed({ startedAt, frozen }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (frozen) return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [frozen]);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  return h(Text, { color: "gray", dimColor: true }, `${seconds}s`);
}

function AgentPane({ agent, status, output }) {
  const statusColor =
    status === STATUS_COMPLETE ? "green" :
      status === STATUS_REFUSED ? "yellow" :
        status === STATUS_ACTIVE ? "blue" :
          status === STATUS_ERROR ? "red" : "gray";

  // Truncate long outputs so the screen recording stays readable. Vault
  // stores the full text — this only affects the visible pane.
  const lines = output.split("\n");
  const truncated = lines.length > MAX_OUTPUT_LINES;
  const displayed = truncated ? lines.slice(0, MAX_OUTPUT_LINES).join("\n") : output;
  const moreCount = truncated ? lines.length - MAX_OUTPUT_LINES : 0;

  return h(
    Box,
    {
      flexDirection: "column",
      // REFUSED gets a double border so the refusal beat is unmistakable
      // in a single screenshot. Refusal is the demo punchline.
      borderStyle: status === STATUS_REFUSED ? "double" : "single",
      borderColor: agent.color,
      paddingX: 1,
      marginTop: 1,
    },
    h(
      Box,
      { justifyContent: "space-between" },
      h(
        Box,
        null,
        h(Text, { color: agent.color, bold: true }, agent.name.toUpperCase()),
        // "in lane" badge for the agent that completes — emphasizes the
        // bounded-refusal point: this is where the work belongs.
        status === STATUS_COMPLETE
          ? h(Text, { color: "green", dimColor: true }, "  ✓ in lane")
          : null,
      ),
      h(Text, { color: statusColor, bold: true }, status),
    ),
    h(Text, { color: "gray", dimColor: true }, agent.lane),
    // 1-line REFUSED callout above the refusal text. Boxed in yellow so
    // a single freeze-frame on the refusal carries the entire claim.
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
      ? h(
          Box,
          { marginTop: 1, flexDirection: "column" },
          h(Text,
            { color: status === STATUS_REFUSED ? "yellow" : "white", wrap: "wrap" },
            displayed),
          truncated
            ? h(Text, { color: "gray", dimColor: true },
                `(+ ${moreCount} more lines — full text in vault)`)
            : null,
        )
      : null,
  );
}

function WorkingIndicator({ stillActive, startedAt }) {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80);
    return () => clearInterval(t);
  }, []);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const names = stillActive.length > 0
    ? `working: ${stillActive.join(", ")}`
    : "deliberating…";
  return h(
    Box,
    { marginTop: 1, justifyContent: "space-between" },
    h(Text, { color: "blue" }, `${frames[frame]} ${names}`),
    h(Text, { color: "gray", dimColor: true }, `${seconds}s`),
  );
}

function Footer({ vaultId, errMsg }) {
  if (errMsg) {
    return h(Box, { marginTop: 1 },
      h(Text, { color: "red" }, `error: ${errMsg}`));
  }
  return h(Box, { marginTop: 1, flexDirection: "column" },
    h(Text, { color: "gray" },
      `vault: deliberation ${vaultId} stored. /history shows the record.`),
    h(Text, { color: "gray", dimColor: true }, FOOTER_LINE),
  );
}

const task = process.argv.slice(2).join(" ").trim();
if (!task) {
  console.error('Usage: liminal-tui "<task description>"');
  console.error('Example: liminal-tui "teardown of granola.ai"');
  process.exit(1);
}

render(h(App, { task }));
