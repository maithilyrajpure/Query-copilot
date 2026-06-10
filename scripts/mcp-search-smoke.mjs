// Standalone LIVE smoke test for the MCP search path.
//
// WHY a script and not a jest test: the kbn jest environment patches global
// fetch / web-streams, which makes the @modelcontextprotocol/sdk streamable-HTTP
// initialize handshake hang — `connect()` never completes (60s timeout) under
// jest, while the identical call is ~60ms in plain Node. So the LIVE smoke test
// lives here and runs under plain Node. The deterministic two-block PARSING
// logic is unit-tested with mocks in
// server/services/mcp/mcp.client.service.test.ts; THIS script validates the real
// end-to-end chain (plugin parsing contract → MCP container → Elasticsearch).
//
// Run:   node scripts/mcp-search-smoke.mjs
// Exit:  0 = all checks passed (or container down → skipped); 1 = a check failed / error.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SERVER_URL = 'http://localhost:8080/mcp';
const PING_URL = 'http://localhost:8080/ping';
const INDEX_PATTERN = 'fosstlsoc-logs-*';
/** Per-step bound so a half-up container fails fast with a clear error, never hangs. */
const STEP_TIMEOUT_MS = 15000;

/** Reject if `p` doesn't settle within `ms`. */
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Parse the MCP `search` tool's two-block response EXACTLY as
 * McpClientService.search does: total from the "Total results: N" summary block,
 * docs from the JSON-array block (empty when that block is absent — the
 * zero-results single-block case).
 */
function parseSearch(result) {
  if (result.isError) {
    throw new Error('search returned isError:true');
  }
  const blocks = (result.content ?? []).filter(
    (c) => c.type === 'text' && typeof c.text === 'string'
  );
  const match = blocks[0]?.text.match(/Total results:\s*(\d+)/i);
  const total = match ? Number.parseInt(match[1], 10) : 0;
  let docs = [];
  const docsText = blocks[1]?.text;
  if (docsText !== undefined) {
    const parsed = JSON.parse(docsText);
    docs = Array.isArray(parsed) ? parsed : [];
  }
  return { total, docs };
}

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
}

/** True when the container answers /ping within a short window. */
async function pingUp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  timer.unref();
  try {
    const res = await fetch(PING_URL, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Run a `search` tool call and return its parsed { total, docs }. */
async function search(client, queryBody, label) {
  const result = await withTimeout(
    client.callTool(
      { name: 'search', arguments: { index: INDEX_PATTERN, query_body: queryBody } },
      undefined,
      { timeout: STEP_TIMEOUT_MS }
    ),
    STEP_TIMEOUT_MS,
    label
  );
  return parseSearch(result);
}

async function main() {
  if (!(await pingUp())) {
    console.log(
      `SKIP  MCP container not reachable at ${PING_URL} — start it (see docs/mcp-integration.md §7).`
    );
    process.exit(0);
  }

  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));
  const client = new Client(
    { name: 'queryCopilot-search-smoke', version: '1.0.0' },
    { capabilities: {} }
  );
  await withTimeout(client.connect(transport), STEP_TIMEOUT_MS, 'connect');

  try {
    // A) populated: a match-all parses to a positive count and a non-empty doc array.
    const a = await search(client, { query: { match_all: {} }, size: 100 }, 'search (populated)');
    console.log(`      populated: total=${a.total}, docs=${a.docs.length}`);
    check('populated match-all -> total > 0', a.total > 0);
    check('populated match-all -> non-empty docs', a.docs.length > 0);

    // B) empty single-block: a no-match query parses cleanly to total 0 + empty docs.
    const b = await search(
      client,
      { query: { term: { 'this_field_does_not_exist_zzz.keyword': 'no-such-value-zzz' } }, size: 1 },
      'search (empty)'
    );
    console.log(`      empty: total=${b.total}, docs=${b.docs.length}`);
    check('no-match -> total === 0', b.total === 0);
    check('no-match -> empty docs (no throw)', b.docs.length === 0);
  } finally {
    await client.close().catch(() => undefined);
  }

  console.log(failures === 0 ? '\nOK — all smoke checks passed.' : `\nFAILED — ${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSMOKE ERROR:', err && err.message ? err.message : err);
  process.exit(1);
});
