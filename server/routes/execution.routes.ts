import { schema, type TypeOf } from '@kbn/config-schema';
import { randomUUID } from 'node:crypto';
import type { IRouter } from '@kbn/core/server';
import { KQLSyntaxError } from '@kbn/es-query';
import type { QueryCopilotContext } from '../types';
import { QueryExecutorService } from '../services/execution';
import { PLUGIN_ROUTE_PREFIX } from '../../common';

/** Request body for POST /execute. */
const executeRequestBodySchema = schema.object({
  kql: schema.string({ minLength: 1, maxLength: 8192 }),
  indexPattern: schema.string({ minLength: 1, maxLength: 256 }),
  timeRange: schema.maybe(
    schema.object({
      from: schema.string({ minLength: 1 }),
      to: schema.string({ minLength: 1 }),
    })
  ),
});

type ExecuteRequestBody = TypeOf<typeof executeRequestBodySchema>;

/**
 * Registers POST /api/query_copilot/execute.
 *
 * Runs a KQL query against the request-scoped Elasticsearch client via a
 * per-request {@link QueryExecutorService} and returns the normalized result.
 * A `KQLSyntaxError` maps to 400; any other error maps to 500. Every response
 * carries the `X-Request-ID` correlation header.
 */
export function registerExecutionRoutes(router: IRouter, context: QueryCopilotContext): void {
  router.post(
    {
      path: `${PLUGIN_ROUTE_PREFIX}/execute`,
      validate: { body: executeRequestBodySchema },
      options: {
        authRequired: true,
        tags: ['access:queryCopilot'],
        body: { accepts: ['application/json'], maxBytes: 1024 * 64 },
      },
    },
    async (ctx, request, response) => {
      const requestId = randomUUID();
      const headers = { 'X-Request-ID': requestId };
      context.logger.logRequest(requestId, 'POST', request.url.pathname);

      try {
        const body: ExecuteRequestBody = request.body;
        const params = {
          kql: body.kql,
          indexPattern: body.indexPattern,
          timeRange: body.timeRange,
        };

        let result;
        if (context.mcpSearchProvider) {
          // MCP SEARCH path (queryCopilot.mcp.searchEnabled). RBAC: runs as the MCP
          // container's ES identity (Aryan), NOT asCurrentUser. If the MCP server is
          // unreachable the typed McpConnectionError/McpTimeoutError propagates to the
          // catch below (mapped to 500) — we do NOT fall back to asCurrentUser.
          result = await context.mcpSearchProvider.execute(params);
        } else {
          const coreCtx = await ctx.core;
          const esClient = coreCtx.elasticsearch.client.asCurrentUser;
          result = await new QueryExecutorService(esClient, context.logger).execute(params);
        }

        return response.ok({ headers, body: result });
      } catch (error) {
        context.logger.logError(requestId, error, { stage: 'execute_route' });
        const statusCode = error instanceof KQLSyntaxError ? 400 : 500;
        return response.customError({
          statusCode,
          headers,
          body: {
            message: error instanceof Error ? error.message : 'Query execution failed.',
            attributes: { requestId },
          },
        });
      }
    }
  );
}
