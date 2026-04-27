// Retrieval over snapshots and corrections via SQLite FTS5.
//
// Closes one of the architectural weaknesses identified in the post-OSS4AI
// teardown: the vault was append-only with no query path. Without
// retrieval, corrections lived nowhere useful — they were data the system
// had but couldn't surface.
//
// Design choices:
//
// - BM25, not embeddings. SQLite FTS5 uses BM25 scoring built-in, with
//   no new dependency. Embedding-based retrieval is ~10x more code and
//   adds an embedding model dep. Worth it later when we have evidence
//   that keyword retrieval misses semantic matches the user cared about.
//
// - Retrieval is a USER-FACING TOOL, not an automatic step in runReading.
//   This preserves the bounded-multi-agent claim (agents still don't see
//   prior corrections automatically) while giving the user a way to
//   surface relevant prior work. If a user wants to feed corrections to
//   the next reading, they can do so explicitly via /api/snapshot.
//
// - Porter tokenizer + unicode61: stemming ("escalates" → "escalat" →
//   matches "escalation"), case-insensitive, unicode-safe. Defaults from
//   FTS5 docs.

import { openDb } from "./db.js";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Sanitize FTS5 query syntax. FTS5 has special chars (", -, *, AND, OR,
// NEAR) that are operators. For unconstrained user input we want to treat
// the query as plain prose — wrap each token in double quotes to make
// every token a literal phrase. This sacrifices boolean queries for
// safety; users who want operators can pass `raw: true`.
function sanitizeQuery(text) {
  if (typeof text !== "string") return "";
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .map((t) => `"${t}"`);
  if (!tokens.length) return "";
  return tokens.join(" OR ");
}

export function retrieveSnapshots(query, { limit = DEFAULT_LIMIT, raw = false, includeArchived = false } = {}) {
  if (!query || typeof query !== "string" || !query.trim()) return [];
  const ftsQuery = raw ? query : sanitizeQuery(query);
  if (!ftsQuery) return [];

  const cappedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const db = openDb();
  const archivedClause = includeArchived ? "" : " AND s.archived = 0";

  try {
    return db
      .prepare(
        `SELECT s.id, s.timestamp, s.kind, s.text, s.label, s.archived,
                bm25(snapshots_fts) AS score
         FROM snapshots_fts
         JOIN snapshots s ON s.rowid = snapshots_fts.rowid
         WHERE snapshots_fts MATCH ?${archivedClause}
         ORDER BY score
         LIMIT ?`,
      )
      .all(ftsQuery, cappedLimit);
  } catch (e) {
    console.warn(`[retrieveSnapshots] FTS query failed: ${e.message}`);
    return [];
  }
}

export function retrieveCorrections(query, { limit = DEFAULT_LIMIT, raw = false, agentKey = null, tag = null } = {}) {
  if (!query || typeof query !== "string" || !query.trim()) return [];
  const ftsQuery = raw ? query : sanitizeQuery(query);
  if (!ftsQuery) return [];

  const cappedLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const db = openDb();

  const filters = [];
  const params = [ftsQuery];
  if (agentKey) {
    filters.push(" AND c.agent = ?");
    params.push(agentKey);
  }
  if (tag) {
    filters.push(" AND c.tag = ?");
    params.push(tag);
  }
  params.push(cappedLimit);

  try {
    return db
      .prepare(
        `SELECT c.id, c.reading_id, c.agent, c.tag, c.note, c.timestamp,
                bm25(corrections_fts) AS score
         FROM corrections_fts
         JOIN corrections c ON c.rowid = corrections_fts.rowid
         WHERE corrections_fts MATCH ?${filters.join("")}
         ORDER BY score
         LIMIT ?`,
      )
      .all(...params);
  } catch (e) {
    console.warn(`[retrieveCorrections] FTS query failed: ${e.message}`);
    return [];
  }
}

// Combined retrieval — returns both snapshots and corrections for a query,
// useful for the orchestrator's potential future use (currently exposed
// only via the HTTP layer).
export function retrieveAll(query, opts = {}) {
  return {
    snapshots: retrieveSnapshots(query, opts),
    corrections: retrieveCorrections(query, opts),
  };
}
