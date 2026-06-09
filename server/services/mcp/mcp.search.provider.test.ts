/**
 * Unit tests for {@link McpSearchProvider}.
 *
 * The MCP client is mocked; we assert the provider builds the expected
 * `query_body` ({ query, size, sort }) and forwards/propagates the client's
 * result and errors unchanged.
 */

import type { QueryExecutionParams, QueryExecutionResult } from '../../../common/types';
import { McpSearchProvider } from './mcp.search.provider';
import { McpConnectionError } from './errors';
import type { McpClientService } from './mcp.client.service';

function makeClient(search: jest.Mock): McpClientService {
  return { search } as unknown as McpClientService;
}

const RESULT: QueryExecutionResult = {
  columns: [{ id: 'message', displayName: 'message', dataType: 'string' }],
  rows: [{ message: 'hello' }],
  total: 1,
  tookMs: 0,
  timedOut: false,
};

const PARAMS: QueryExecutionParams = {
  kql: 'event.action : "login"',
  indexPattern: 'logs-*',
};

describe('McpSearchProvider', () => {
  it('calls mcpClient.search with the indexPattern and a query_body of { query, size, sort }', async () => {
    const search = jest.fn().mockResolvedValue(RESULT);
    const provider = new McpSearchProvider(makeClient(search));

    const result = await provider.execute(PARAMS);

    expect(search).toHaveBeenCalledTimes(1);
    const [indexPattern, queryBody] = search.mock.calls[0];
    expect(indexPattern).toBe('logs-*');
    expect(queryBody).toHaveProperty('query');
    expect(queryBody).toHaveProperty('size', 100);
    expect(queryBody.sort).toEqual([{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }]);

    // Returns the client's result unchanged.
    expect(result).toBe(RESULT);
  });

  it('honours an explicit maxResults as the query_body size', async () => {
    const search = jest.fn().mockResolvedValue(RESULT);
    const provider = new McpSearchProvider(makeClient(search));

    await provider.execute({ ...PARAMS, maxResults: 25 });

    expect(search.mock.calls[0][1]).toHaveProperty('size', 25);
  });

  it('propagates a rejecting mcpClient.search unchanged (no fallback)', async () => {
    const error = new McpConnectionError('connect ECONNREFUSED');
    const search = jest.fn().mockRejectedValue(error);
    const provider = new McpSearchProvider(makeClient(search));

    await expect(provider.execute(PARAMS)).rejects.toBe(error);
  });
});
