// Tests for the tool-use harness + fetch_url SSRF guards + per-agent
// tool scoping (the architectural claim that tools are scoped per-agent).

import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchUrl, FETCH_URL_TOOL, TOOLS } from "../lib/tools/fetch_url.js";
import { AGENTS, runAgent } from "../lib/agents/index.js";

// ─── fetchUrl SSRF + validation guards ───────────────────────────────────

test("fetchUrl: rejects non-http(s) protocols", async () => {
  assert.deepEqual(
    await fetchUrl("file:///etc/passwd"),
    { ok: false, error: "protocol not allowed: file:" },
  );
  assert.deepEqual(
    await fetchUrl("ftp://example.com"),
    { ok: false, error: "protocol not allowed: ftp:" },
  );
});

test("fetchUrl: rejects invalid URLs", async () => {
  const r = await fetchUrl("not a url");
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid URL/);
});

test("fetchUrl: rejects RFC1918 private IPv4 addresses", async () => {
  const cases = [
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://127.0.0.1/",
    "http://169.254.169.254/", // AWS/GCP metadata service
  ];
  for (const url of cases) {
    const r = await fetchUrl(url);
    assert.equal(r.ok, false, `should reject ${url}`);
    assert.match(r.error, /private IP/);
  }
});

test("fetchUrl: rejects IPv6 loopback and ULA", async () => {
  const r1 = await fetchUrl("http://[::1]/");
  assert.equal(r1.ok, false);
  assert.match(r1.error, /private IP/);

  const r2 = await fetchUrl("http://[fc00::1]/");
  assert.equal(r2.ok, false);
});

test("fetchUrl: rejects localhost and .local hostnames", async () => {
  const cases = ["http://localhost/", "http://foo.local/", "http://bar.internal/"];
  for (const url of cases) {
    const r = await fetchUrl(url);
    assert.equal(r.ok, false, `should reject ${url}`);
    assert.match(r.error, /(internal hostname|private IP)/);
  }
});

test("FETCH_URL_TOOL schema is well-formed for Anthropic API", () => {
  assert.equal(FETCH_URL_TOOL.name, "fetch_url");
  assert.ok(FETCH_URL_TOOL.description);
  assert.equal(FETCH_URL_TOOL.input_schema.type, "object");
  assert.deepEqual(FETCH_URL_TOOL.input_schema.required, ["url"]);
});

test("TOOLS registry exposes fetch_url with run() function", () => {
  assert.ok(TOOLS.fetch_url);
  assert.equal(TOOLS.fetch_url.schema, FETCH_URL_TOOL);
  assert.equal(typeof TOOLS.fetch_url.run, "function");
});

// ─── Per-agent tool scoping ──────────────────────────────────────────────

test("Analyst and Researcher have fetch_url; other 10 agents do not", () => {
  const withTools = AGENTS.filter((a) => Array.isArray(a.tools) && a.tools.length > 0);
  const keys = withTools.map((a) => a.key).sort();
  assert.deepEqual(keys, ["analyst", "researcher"]);

  for (const a of withTools) {
    assert.ok(a.tools.includes("fetch_url"), `${a.key} should have fetch_url`);
  }

  // Verify the other 10 have no tools.
  const withoutTools = AGENTS.filter(
    (a) => !Array.isArray(a.tools) || a.tools.length === 0,
  );
  assert.equal(withoutTools.length, 10, "10 agents without tools");
});

// ─── Tool-use loop (mock client) ─────────────────────────────────────────

test("runAgent: agent without tools never receives `tools` parameter", async () => {
  let capturedRequest = null;
  const client = {
    messages: {
      create: async (req) => {
        capturedRequest = req;
        return {
          content: [{ type: "text", text: "in-lane response" }],
          stop_reason: "end_turn",
        };
      },
    },
  };
  const sdr = AGENTS.find((a) => a.key === "sdr");
  await runAgent(client, sdr, "test", "", "test-model");
  assert.equal(capturedRequest.tools, undefined, "SDR has no tools — should not pass tools field");
});

test("runAgent: agent WITH tools receives `tools` parameter with schema", async () => {
  let capturedRequest = null;
  const client = {
    messages: {
      create: async (req) => {
        capturedRequest = req;
        return {
          content: [{ type: "text", text: "no fetch needed" }],
          stop_reason: "end_turn",
        };
      },
    },
  };
  const analyst = AGENTS.find((a) => a.key === "analyst");
  await runAgent(client, analyst, "test", "", "test-model");
  assert.ok(Array.isArray(capturedRequest.tools));
  assert.equal(capturedRequest.tools.length, 1);
  assert.equal(capturedRequest.tools[0].name, "fetch_url");
});

test("runAgent: tool-use loop executes tool and feeds result back", async () => {
  let callCount = 0;
  const client = {
    messages: {
      create: async (req) => {
        callCount++;
        if (callCount === 1) {
          // First call: agent emits a tool_use block.
          return {
            content: [
              {
                type: "tool_use",
                id: "tu_1",
                name: "fetch_url",
                input: { url: "http://localhost/" }, // will be SSRF-rejected
              },
            ],
            stop_reason: "tool_use",
          };
        }
        // Second call: agent has the tool_result, emits final text.
        const lastUser = req.messages[req.messages.length - 1];
        assert.equal(lastUser.role, "user");
        assert.ok(Array.isArray(lastUser.content));
        const toolResult = lastUser.content[0];
        assert.equal(toolResult.type, "tool_result");
        assert.equal(toolResult.is_error, true); // SSRF reject = is_error
        return {
          content: [
            { type: "text", text: "fetch was rejected, but I tried." },
          ],
          stop_reason: "end_turn",
        };
      },
    },
  };
  const analyst = AGENTS.find((a) => a.key === "analyst");
  const result = await runAgent(client, analyst, "test", "", "test-model");
  assert.equal(callCount, 2, "should call API twice (tool use + final)");
  assert.equal(result.tool_turns, 1);
  assert.equal(result.interpretation, "fetch was rejected, but I tried.");
});

test("runAgent: tool-use loop bounded by MAX_TOOL_TURNS=3", async () => {
  let callCount = 0;
  const client = {
    messages: {
      create: async () => {
        callCount++;
        if (callCount > 5) {
          return {
            content: [{ type: "text", text: "giving up after timeout" }],
            stop_reason: "end_turn",
          };
        }
        // Agent always wants another tool call.
        return {
          content: [
            { type: "tool_use", id: `tu_${callCount}`, name: "fetch_url", input: { url: "http://localhost/" } },
          ],
          stop_reason: "tool_use",
        };
      },
    },
  };
  const analyst = AGENTS.find((a) => a.key === "analyst");
  // After 3 tool turns the loop must exit even if the agent wants more.
  // Result: agent emits no text on the 4th call (still tool_use), and the
  // loop breaks because toolTurns >= MAX_TOOL_TURNS. Final response has
  // no text block → runAgent throws.
  await assert.rejects(
    () => runAgent(client, analyst, "test", "", "test-model"),
    /no text in API response/,
  );
  // Should have called exactly MAX_TOOL_TURNS + 1 times (3 tool calls + 1 final attempt).
  assert.equal(callCount, 4);
});
