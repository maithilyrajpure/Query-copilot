/**
 * MCP-backed {@link QuerySearchProvider}.
 *
 * Adapts {@link McpClientService} to the query-execution seam so that query
 * EXECUTION (POST /execute) can be served by the MCP server's `search` tool
 * when the `queryCopilot.mcp.searchEnabled` feature flag is on.
 *
 * @packageDocumentation
 */

import { buildQueryDsl, DEFAULT_MAX_RESULTS, TIMESTAMP_SORT } from '../execution';
import type { QuerySearchProvider } from '../execution';
import type { QueryExecutionParams, QueryExecutionResult } from '../../../common/types';
import type { McpClientService } from './mcp.client.service';

/**
 * Executes KQL queries via the MCP server's `search` tool, exposing them
 * through the {@link QuerySearchProvider} contract.
 *
 * @remarks
 * **(a) RBAC DIVERGENCE.** Unlike the default {@link QueryExecutorService} —
 * which calls `_search` as the per-request `asCurrentUser` Elasticsearch client
 * and so honours the requesting Kibana user's permissions — this provider runs
 * the search as the MCP container's own Elasticsearch identity (the credential
 * the MCP server process runs with, "Aryan"). The results a user sees through
 * this path therefore reflect the MCP container's privileges, NOT the caller's.
 * This is an intentional consequence of routing execution through the MCP server.
 *
 * **(b) Identical shape.** {@link McpClientService.search} performs all
 * normalization internally and returns the very same {@link QueryExecutionResult}
 * type that {@link QueryExecutorService.execute} returns, so the route and the
 * client are agnostic to which provider produced the result.
 *
 * **(c) No silent fallback.** When the MCP server is unreachable,
 * {@link McpClientService.search} throws a typed `McpConnectionError` /
 * `McpTimeoutError`. This provider propagates that error unchanged — there is
 * intentionally NO fallback to the `asCurrentUser` path, so an MCP outage
 * surfaces loudly rather than being silently masked. (`buildQueryDsl` can also
 * throw `KQLSyntaxError` for bad KQL, which the route maps to 400.)
 */
export class McpSearchProvider implements QuerySearchProvider {
  /**
   * @param mcpClient - The MCP client used to invoke the `search` tool.
   */
  constructor(private readonly mcpClient: McpClientService) {}

  /**
   * Execute a KQL query via the MCP server and return a normalized result.
   *
   * Builds the IDENTICAL Query DSL the `asCurrentUser` path builds (via the
   * shared {@link buildQueryDsl}), then assembles the `query_body` with the same
   * `size` cap and `@timestamp` sort before handing it to the `search` tool.
   *
   * @param params - The KQL, index pattern, optional time range and max results.
   * @returns A normalized {@link QueryExecutionResult}.
   * @throws {KQLSyntaxError} when the KQL is invalid (mapped to 400 by the route).
   * @throws {McpConnectionError} / {@link McpTimeoutError} / {@link McpToolError}
   *   when the MCP call fails — propagated, never silently masked.
   */
  execute(params: QueryExecutionParams): Promise<QueryExecutionResult> {
    const queryBody = {
      query: buildQueryDsl(params.kql, params.timeRange),
      size: params.maxResults ?? DEFAULT_MAX_RESULTS,
      sort: TIMESTAMP_SORT,
    };
    return this.mcpClient.search(params.indexPattern, queryBody);
  }
}
