/**
 * Unit tests for {@link FieldValuesFetcher}.
 *
 * These tests use plain, dependency-free typed mocks (no `@kbn` mock package)
 * so they can run in isolation. The mocks are constructed with the minimal
 * surface the fetcher actually uses and cast through `unknown` to the real
 * Kibana types when handed to the class under test.
 */

import { FieldValuesFetcher } from './field.values.fetcher';
import type { ESIndexMapping, ESFieldMapping } from './es.mapping.fetcher';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';

/** Minimal jest-backed stand-in for Kibana's {@link Logger}. */
const createMockLogger = () => ({
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  log: jest.fn(),
  get: jest.fn(),
  isLevelEnabled: jest.fn(),
});

/** Minimal jest-backed stand-in for the {@link ElasticsearchClient} surface we use. */
const createMockEsClient = () => ({ search: jest.fn() });

/** Builds an {@link ESIndexMapping} from `[name, partial]` field tuples. */
function makeMapping(
  fields: ReadonlyArray<[string, Partial<ESFieldMapping>]>
): ESIndexMapping {
  const map = new Map<string, ESFieldMapping>();
  for (const [name, partial] of fields) {
    map.set(name, {
      name,
      type: 'keyword',
      searchable: true,
      aggregatable: true,
      ...partial,
    });
  }
  return { indexPattern: 'logs-*', fields: map, fetchedAt: new Date() };
}

describe('FieldValuesFetcher', () => {
  describe('candidate resolution', () => {
    it('aggregates an allowlisted aggregatable field directly and parses string buckets', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockResolvedValue({
        aggregations: {
          'event.action': { buckets: [{ key: 'login' }, { key: 'logout' }] },
        },
      });

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      const mapping = makeMapping([['event.action', { aggregatable: true }]]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.get('event.action')).toEqual(['login', 'logout']);
      // The agg targets the base field directly.
      const [body] = esClient.search.mock.calls[0];
      expect(body.aggs['event.action'].terms.field).toBe('event.action');
      expect(body.size).toBe(0);
    });

    it('falls back to the .keyword subfield when the base field is not aggregatable (text)', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockResolvedValue({
        aggregations: { 'rule.name': { buckets: [{ key: 'Suspicious login' }] } },
      });

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      const mapping = makeMapping([
        ['rule.name', { type: 'text', aggregatable: false }],
        ['rule.name.keyword', { type: 'keyword', aggregatable: true }],
      ]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      // Map key is the queryable BASE field; agg targets the .keyword variant.
      expect(values.get('rule.name')).toEqual(['Suspicious login']);
      const [body] = esClient.search.mock.calls[0];
      expect(body.aggs['rule.name'].terms.field).toBe('rule.name.keyword');
    });

    it('skips an allowlisted field with no aggregatable variant', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      // event.action exists but only as a non-aggregatable text field, no .keyword.
      const mapping = makeMapping([['event.action', { type: 'text', aggregatable: false }]]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.size).toBe(0);
      expect(esClient.search).not.toHaveBeenCalled();
    });
  });

  describe('value parsing', () => {
    it('stringifies numeric bucket keys (e.g. status codes)', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockResolvedValue({
        aggregations: {
          'http.response.status_code': { buckets: [{ key: 200 }, { key: 401 }] },
        },
      });

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      const mapping = makeMapping([
        ['http.response.status_code', { type: 'long', aggregatable: true }],
      ]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.get('http.response.status_code')).toEqual(['200', '401']);
    });

    it('omits fields whose terms aggregation has no buckets', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockResolvedValue({
        aggregations: {
          'event.action': { buckets: [{ key: 'login' }] },
          'event.outcome': { buckets: [] },
        },
      });

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      const mapping = makeMapping([
        ['event.action', { aggregatable: true }],
        ['event.outcome', { aggregatable: true }],
      ]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.has('event.action')).toBe(true);
      expect(values.has('event.outcome')).toBe(false);
    });
  });

  describe('candidate cap', () => {
    it('aggregates at most 12 candidate fields', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockResolvedValue({ aggregations: {} });

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      // All 15 allowlisted fields present and aggregatable.
      const mapping = makeMapping(
        [
          'event.category',
          'event.action',
          'event.outcome',
          'event.type',
          'event.module',
          'event.kind',
          'http.response.status_code',
          'http.request.method',
          'network.protocol',
          'network.transport',
          'service_name',
          'observer.source_program',
          'rule.name',
          'log.level',
          'user.roles',
        ].map((name) => [name, { aggregatable: true }] as [string, Partial<ESFieldMapping>])
      );

      await fetcher.fetchValues('logs-*', mapping);

      const [body] = esClient.search.mock.calls[0];
      expect(Object.keys(body.aggs)).toHaveLength(12);
    });
  });

  describe('no candidates', () => {
    it('returns an empty map without calling search', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      // None of these are on the allowlist.
      const mapping = makeMapping([
        ['source.ip', { aggregatable: true }],
        ['user.name', { aggregatable: true }],
      ]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.size).toBe(0);
      expect(esClient.search).not.toHaveBeenCalled();
    });
  });

  describe('graceful failure', () => {
    it('returns an empty map and logs a warning when search rejects', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();
      esClient.search.mockRejectedValue(new Error('cluster unavailable'));

      const fetcher = new FieldValuesFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );
      const mapping = makeMapping([['event.action', { aggregatable: true }]]);

      const values = await fetcher.fetchValues('logs-*', mapping);

      expect(values.size).toBe(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
