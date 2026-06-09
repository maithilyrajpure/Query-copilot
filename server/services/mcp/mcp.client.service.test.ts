/**
 * Unit tests for {@link McpClientService}.
 *
 * The `@modelcontextprotocol/sdk` subpath modules are mocked by their exact
 * import specifiers. The mock factories construct the jest.fns *inside*
 * themselves to avoid jest's hoisting trap (the `jest.mock` call is hoisted
 * above imports), and the fns are recovered afterwards via `jest.requireMock`.
 */

import type { Logger } from '@kbn/core/server';
import type { ConfigService } from '../config';

// ── SDK mocks ────────────────────────────────────────────────────────────────
// Each factory defines its own jest.fns and a constructor that records the
// args it was called with, so tests can assert on transport/client construction.

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  const connect = jest.fn().mockResolvedValue(undefined);
  const callTool = jest.fn();
  const close = jest.fn().mockResolvedValue(undefined);
  const ctorCalls: unknown[][] = [];

  class Client {
    constructor(...args: unknown[]) {
      ctorCalls.push(args);
    }
    connect = connect;
    callTool = callTool;
    close = close;
  }

  return { Client, __mock: { connect, callTool, close, ctorCalls } };
});

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  const close = jest.fn().mockResolvedValue(undefined);
  const ctorArgs: unknown[][] = [];

  class StreamableHTTPClientTransport {
    constructor(...args: unknown[]) {
      ctorArgs.push(args);
    }
    close = close;
  }

  return { StreamableHTTPClientTransport, __mock: { ctorArgs, close } };
});

import { McpClientService } from './mcp.client.service';
import { McpToolError } from './errors';

// ── Typed accessors over the mock internals ──────────────────────────────────

interface ClientMock {
  connect: jest.Mock;
  callTool: jest.Mock;
  close: jest.Mock;
  ctorCalls: unknown[][];
}
interface TransportMock {
  ctorArgs: unknown[][];
  close: jest.Mock;
}

function clientMock(): ClientMock {
  return (
    jest.requireMock('@modelcontextprotocol/sdk/client/index.js') as { __mock: ClientMock }
  ).__mock;
}
function transportMock(): TransportMock {
  return (
    jest.requireMock('@modelcontextprotocol/sdk/client/streamableHttp.js') as {
      __mock: TransportMock;
    }
  ).__mock;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const SERVER_URL = 'http://localhost:8080/mcp';
const TIMEOUT_MS = 30000;

function makeConfigService(): ConfigService {
  return {
    getMcpConfig: () => ({ serverUrl: SERVER_URL, requestTimeoutMs: TIMEOUT_MS }),
  } as unknown as ConfigService;
}

function makeLogger(): Logger {
  const noop = jest.fn();
  return { debug: noop, info: noop, warn: noop, error: noop } as unknown as Logger;
}

/** Wrap a JSON payload the way the ES MCP server does — as a text content block. */
function textResult(payload: unknown, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError };
}

describe('McpClientService', () => {
  let service: McpClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    clientMock().ctorCalls.length = 0;
    transportMock().ctorArgs.length = 0;
    service = new McpClientService(makeConfigService(), makeLogger());
  });

  describe('connect', () => {
    it('constructs the transport with a URL equal to the configured serverUrl and connects', async () => {
      await service.connect();

      const transportArgs = transportMock().ctorArgs[0];
      expect(transportArgs[0]).toBeInstanceOf(URL);
      expect((transportArgs[0] as URL).toString()).toBe(SERVER_URL);

      expect(clientMock().connect).toHaveBeenCalledTimes(1);
      // Client identity ctor arg.
      expect(clientMock().ctorCalls[0][0]).toEqual({ name: 'queryCopilot', version: '1.0.0' });
    });

    it('is idempotent', async () => {
      await service.connect();
      await service.connect();
      expect(clientMock().connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('listIndices', () => {
    it('calls callTool with the list_indices tool name and maps summaries defensively', async () => {
      clientMock().callTool.mockResolvedValueOnce(
        textResult([
          { index: 'logs-2026', health: 'green', status: 'open', 'docs.count': '42' },
          { name: 'metrics', docsCount: 7 },
        ])
      );

      const result = await service.listIndices('logs-*');

      const [params] = clientMock().callTool.mock.calls[0];
      expect(params).toMatchObject({
        name: 'list_indices',
        arguments: { index_pattern: 'logs-*' },
      });

      expect(result).toEqual([
        { name: 'logs-2026', health: 'green', status: 'open', docsCount: 42 },
        { name: 'metrics', health: undefined, status: undefined, docsCount: 7 },
      ]);
    });
  });

  describe('getMappings', () => {
    it('calls callTool with get_mappings + { index } and flattens properties into fields', async () => {
      clientMock().callTool.mockResolvedValueOnce(
        textResult({
          'logs-*': {
            mappings: {
              properties: {
                '@timestamp': { type: 'date' },
                source: { properties: { ip: { type: 'ip' } } },
              },
            },
          },
        })
      );

      const mapping = await service.getMappings('logs-*');

      expect(clientMock().callTool.mock.calls[0][0]).toEqual({
        name: 'get_mappings',
        arguments: { index: 'logs-*' },
      });

      expect(mapping.indexPattern).toBe('logs-*');
      expect(mapping.fetchedAt).toBeInstanceOf(Date);
      expect(mapping.fields.get('@timestamp')).toEqual({
        name: '@timestamp',
        type: 'date',
        searchable: true,
        aggregatable: true,
      });
      expect(mapping.fields.get('source.ip')).toEqual({
        name: 'source.ip',
        type: 'ip',
        searchable: true,
        aggregatable: true,
      });
    });
  });

  describe('search', () => {
    it('calls callTool with search + { index, query_body } and parses the two-block response', async () => {
      // VERIFIED live shape: block[0] is a human summary, block[1] is a JSON
      // ARRAY of bare `_source` documents (no hits envelope, no _index/_id/_score).
      clientMock().callTool.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Total results: 9, showing 1.' },
          {
            type: 'text',
            text: JSON.stringify([
              {
                '@timestamp': '2026-02-02T06:42:50Z',
                event: { action: 'login' },
                source: { ip: '10.0.0.1' },
              },
            ]),
          },
        ],
        isError: false,
      });

      const result = await service.search('logs-*', { match_all: {} });

      expect(clientMock().callTool.mock.calls[0][0]).toEqual({
        name: 'search',
        arguments: { index: 'logs-*', query_body: { match_all: {} } },
      });

      // total is parsed from the summary block; took/timedOut are absent on the
      // MCP search response.
      expect(result.total).toBe(9);
      expect(result.tookMs).toBe(0);
      expect(result.timedOut).toBe(false);

      // Each bare _source doc is flattened into dotted-path columns/rows.
      const columnIds = result.columns.map((c) => c.id);
      expect(columnIds).toContain('event.action');
      expect(columnIds).toContain('source.ip');
      expect(result.rows[0]).toMatchObject({
        'event.action': 'login',
        'source.ip': '10.0.0.1',
      });
    });
  });

  describe('error mapping', () => {
    it('throws McpToolError when a tool result has isError: true', async () => {
      clientMock().callTool.mockResolvedValueOnce(
        textResult({ reason: 'index_not_found' }, true)
      );

      await expect(service.listIndices('logs-*')).rejects.toBeInstanceOf(McpToolError);
    });

    it('maps a JSON-RPC -32602 (invalid params) error to McpToolError carrying the server message', async () => {
      const rpcErr = Object.assign(
        new Error('MCP error -32602: Invalid params: query_body is required'),
        { code: -32602 }
      );
      clientMock().callTool.mockRejectedValueOnce(rpcErr);
      let caught: unknown;
      try {
        await service.search('logs-*', {});
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(McpToolError);
      expect((caught as Error).message).toContain('Invalid params: query_body is required');
    });
  });

  describe('passes the configured request timeout', () => {
    it('forwards requestTimeoutMs to callTool options', async () => {
      clientMock().callTool.mockResolvedValueOnce(textResult([]));
      await service.listIndices('logs-*');
      expect(clientMock().callTool.mock.calls[0][2]).toEqual({ timeout: TIMEOUT_MS });
    });
  });

  describe('close', () => {
    it('calls client.close and resets state', async () => {
      await service.connect();
      await service.close();
      expect(clientMock().close).toHaveBeenCalledTimes(1);

      // After close, a subsequent tool call re-connects.
      clientMock().callTool.mockResolvedValueOnce(textResult([]));
      await service.listIndices('logs-*');
      expect(clientMock().connect).toHaveBeenCalledTimes(2);
    });
  });
});
