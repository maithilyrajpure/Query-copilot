# Query Copilot

A Kibana plugin that turns natural-language questions into **KQL** and **ES|QL**
queries, runs them against Elasticsearch, and returns normalized results — built
for security analysts working over ECS-formatted log data.

You describe what you're looking for ("show me all failed login attempts in the
last 24h"); the copilot generates the query, grounds it in your real index
schema, validates it, executes it, and shows the results — without you having to
remember field names or query syntax.

---

## Features

- **Natural language → KQL & ES|QL.** The model picks the right language for the
  request (KQL for filtering, ES|QL for aggregation) and emits a structured
  result carrying the chosen `language`.
- **Schema grounding.** Generation is anchored in the target index's real ECS
  field names *and* sampled field values, so queries reference fields that
  actually exist and values that actually occur — not plausible-looking guesses.
- **Validation + auto-correction.** Generated KQL is syntax-checked
  (`@kbn/es-query`) and ES|QL is parsed (`@kbn/esql-ast`); invalid KQL is fed
  back to the model for a bounded correction loop.
- **Multi-provider LLM routing.** Pluggable providers — Groq, Google Gemini,
  Anthropic, OpenAI, and local Ollama — with ordered fallback when a provider is
  unavailable.
- **Per-user API keys.** Analysts add their own provider keys from the UI; keys
  are stored server-side as Encrypted Saved Objects and never returned to the
  browser.
- **Token-usage estimates.** Per-provider token/cost estimates surfaced before a
  request runs.
- **Data-view dropdown.** Pick the target index from the space's Kibana data
  views, or type a custom pattern.
- **Query execution.** KQL runs via `_search` (`buildEsQuery`); ES|QL runs via
  the native `_query` endpoint, always with the caller's own ES identity
  (`asCurrentUser`) so Elasticsearch RBAC is honored.
- **Redis response caching** with a configurable TTL.
- **Optional MCP integration** for mapping lookups and search via an
  Elasticsearch MCP server (off by default).

---

## Architecture

```
public/   React UI — chat panel, KQL/ES|QL editor, output grid, settings
server/   Routes, query pipeline, LLM provider router, execution, caching
common/   Shared types and constants (single source of truth for both sides)
```

The query pipeline: **build prompt** (system prompt + ECS reference + few-shots
+ schema context) → **generate** (provider router) → **validate** (KQL/ES|QL) →
**correct** (bounded retry, KQL) → **execute** → **normalize**.

---

## HTTP API

All routes are under `/api/query_copilot` and require authentication.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/generate` | Natural language → KQL/ES|QL |
| `POST` | `/execute` | Run a query, return normalized rows |
| `POST` | `/token-estimate` | Estimate token usage for a request |
| `GET`  | `/providers` | Provider availability / status |
| `GET` `POST` `DELETE` | `/credentials` | Manage the current user's API keys |
| `GET`  | `/data-views` | List the space's data views |
| `GET`  | `/health` | Plugin health |
| `GET`  | `/metrics` | Usage metrics |
| `POST` | `/benchmark` | Benchmark generation across providers |

---

## Development

See the [Kibana contributing guide](https://github.com/elastic/kibana/blob/main/CONTRIBUTING.md)
for setting up your development environment.

Run Kibana from the Kibana root (`yarn start`), not from the plugin directory.

---

## Documentation

- [docs/mcp-integration.md](docs/mcp-integration.md) — MCP server integration.
- [docs/test-prompts.md](docs/test-prompts.md) — example prompts for manual testing.
