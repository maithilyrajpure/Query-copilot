/**
 * Unit tests for the POST /execute route handler.
 *
 * Mirrors the query.routes.test.ts harness: a fake IRouter captures the
 * registered handler, and a fake request context drives it. Covers the
 * searchEnabled OFF (asCurrentUser) / ON (mcpSearchProvider) branches and the
 * MCP-unreachable error mapping (500, no fallback).
 */

import { registerExecutionRoutes } from './execution.routes';
import { McpConnectionError } from '../services/mcp/errors';
import type { IRouter } from '@kbn/core/server';
import type { QueryExecutionResult } from '../../common/types';
import type { QueryCopilotContext } from '../types';
import type { QuerySearchProvider } from '../services/execution';

function captureHandler(): { router: IRouter; getHandler: () => any } {
  let handler: any;
  const router = {
    post: jest.fn((_opts: unknown, h: unknown) => {
      handler = h;
    }),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  } as unknown as IRouter;
  return { router, getHandler: () => handler };
}

function makeContext(mcpSearchProvider?: QuerySearchProvider): QueryCopilotContext {
  return {
    logger: {
      logRequest: jest.fn(),
      logPipelineStage: jest.fn(),
      logError: jest.fn(),
      logProviderCall: jest.fn(),
      logCacheEvent: jest.fn(),
    },
    metrics: {},
    config: {},
    router: {},
    mcpSearchProvider,
  } as unknown as QueryCopilotContext;
}

const RESULT: QueryExecutionResult = {
  columns: [{ id: 'message', displayName: 'message', dataType: 'string' }],
  rows: [{ message: 'hello' }],
  total: 1,
  tookMs: 7,
  timedOut: false,
};

function makeEsClient(): { search: jest.Mock } {
  // asCurrentUser.search returns a raw ES response; the normalizer flattens it.
  return {
    search: jest.fn().mockResolvedValue({
      took: 7,
      timed_out: false,
      hits: {
        total: { value: 1 },
        hits: [{ _index: 'logs-1', _id: '1', _source: { message: 'hello' } }],
      },
    }),
  };
}

function makeCtx(esClient: { search: jest.Mock }) {
  return { core: Promise.resolve({ elasticsearch: { client: { asCurrentUser: esClient } } }) };
}

function makeRequest() {
  return {
    body: { kql: 'event.action : "login"', indexPattern: 'logs-*' },
    url: { pathname: '/api/query_copilot/execute' },
    headers: {},
  };
}

function makeResponse() {
  return {
    ok: jest.fn((x) => ({ kind: 'ok', ...x })),
    customError: jest.fn((x) => ({ kind: 'customError', ...x })),
  };
}

describe('registerExecutionRoutes handler', () => {
  it('runs the asCurrentUser QueryExecutorService path when searchEnabled is OFF', async () => {
    const context = makeContext(undefined);
    const esClient = makeEsClient();

    const { router, getHandler } = captureHandler();
    registerExecutionRoutes(router, context);
    const handler = getHandler();

    const response = makeResponse();
    await handler(makeCtx(esClient), makeRequest(), response as any);

    expect(esClient.search).toHaveBeenCalledTimes(1);
    expect(response.ok).toHaveBeenCalledTimes(1);
    const okArg = response.ok.mock.calls[0][0];
    expect(okArg.body.total).toBe(1);
    expect(okArg.headers).toHaveProperty('X-Request-ID');
  });

  it('uses mcpSearchProvider (and NOT asCurrentUser) when searchEnabled is ON', async () => {
    const execute = jest.fn().mockResolvedValue(RESULT);
    const context = makeContext({ execute });
    const esClient = makeEsClient();

    const { router, getHandler } = captureHandler();
    registerExecutionRoutes(router, context);
    const handler = getHandler();

    const response = makeResponse();
    await handler(makeCtx(esClient), makeRequest(), response as any);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      kql: 'event.action : "login"',
      indexPattern: 'logs-*',
      timeRange: undefined,
    });
    expect(esClient.search).not.toHaveBeenCalled();

    expect(response.ok).toHaveBeenCalledTimes(1);
    expect(response.ok.mock.calls[0][0].body).toBe(RESULT);
  });

  it('maps an unreachable MCP server (McpConnectionError) to 500 with no fallback', async () => {
    const execute = jest.fn().mockRejectedValue(new McpConnectionError('connect ECONNREFUSED'));
    const context = makeContext({ execute });
    const esClient = makeEsClient();

    const { router, getHandler } = captureHandler();
    registerExecutionRoutes(router, context);
    const handler = getHandler();

    const response = makeResponse();
    await handler(makeCtx(esClient), makeRequest(), response as any);

    expect(execute).toHaveBeenCalledTimes(1);
    // No silent fallback to the asCurrentUser path.
    expect(esClient.search).not.toHaveBeenCalled();

    expect(response.customError).toHaveBeenCalledTimes(1);
    const errArg = response.customError.mock.calls[0][0];
    expect(errArg.statusCode).toBe(500);
    expect(errArg.headers).toHaveProperty('X-Request-ID');
  });
});
