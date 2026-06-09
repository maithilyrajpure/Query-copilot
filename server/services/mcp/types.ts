/**
 * Shared types for the Model Context Protocol (MCP) client integration.
 *
 * The {@link McpClientService} talks to the Elastic Elasticsearch MCP Server
 * (v0.4.6) over streamable-HTTP. The server exposes a fixed set of *tools*; the
 * {@link ToolName} enum names every tool we are aware of, even when this plugin
 * does not (yet) expose a typed wrapper for it.
 *
 * @packageDocumentation
 */

/**
 * Canonical tool names exposed by the Elastic Elasticsearch MCP Server.
 *
 * The string values MUST match the tool names the server advertises via
 * `tools/list`. All five tools are enumerated for completeness; this plugin
 * currently only ships typed wrappers for {@link ToolName.ListIndices},
 * {@link ToolName.GetMappings} and {@link ToolName.Search}. The remaining tools
 * ({@link ToolName.Esql}, {@link ToolName.GetShards}) are reserved for future
 * use and have no service methods yet.
 */
export enum ToolName {
  /** List the indices visible to the connected cluster. */
  ListIndices = 'list_indices',
  /** Fetch the field mappings for an index (pattern). */
  GetMappings = 'get_mappings',
  /** Execute a Query DSL search against an index (pattern). */
  Search = 'search',
  /** Execute an ES|QL query (reserved — no wrapper yet). */
  Esql = 'esql',
  /** Inspect shard allocation (reserved — no wrapper yet). */
  GetShards = 'get_shards',
}

/**
 * A minimal, defensive summary of a single index as returned by the MCP
 * `list_indices` tool.
 *
 * There is no pre-existing common type for this shape, and the exact field
 * names emitted by the MCP server can vary between versions, so every field
 * beyond {@link McpIndexSummary.name} is optional and populated best-effort by
 * {@link McpClientService.listIndices}.
 */
export interface McpIndexSummary {
  /** The index name. Always present. */
  readonly name: string;
  /** Cluster health for the index (`green` | `yellow` | `red`), when reported. */
  readonly health?: string;
  /** Index status (e.g. `open` | `close`), when reported. */
  readonly status?: string;
  /** Document count, when reported and numeric. */
  readonly docsCount?: number;
}
