/**
 * Placeholder for sources not yet implemented: granola, calendar,
 * knowledgeC, imessage, obsidian. The daemon calls ingest() for any
 * enabled stub source so the log reflects that the wiring is real
 * even when the reader is not yet written.
 */

export async function ingest({ source, log }) {
  log?.info?.({ source }, "stub_source_noop");
  return { ingested: 0, status: "stub" };
}
