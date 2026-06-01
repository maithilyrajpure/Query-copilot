/**
 * Unit tests for {@link ESMappingFetcher}.
 *
 * These tests use plain, dependency-free typed mocks (no `@kbn` mock package)
 * so they can run in isolation. The mocks are constructed with the minimal
 * surface the fetcher actually uses and cast through `unknown` to the real
 * Kibana types when handed to the class under test.
 */

import { ESMappingFetcher } from './es.mapping.fetcher';
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
const createMockEsClient = () => ({ fieldCaps: jest.fn() });

describe('ESMappingFetcher', () => {
  describe('fetchIndexMappings — success path', () => {
    it('parses field_caps into queryable field mappings and drops metadata/object fields', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      esClient.fieldCaps.mockResolvedValue({
        indices: ['logs-000001'],
        fields: {
          '@timestamp': {
            date: { type: 'date', searchable: true, aggregatable: true, metadata_field: false },
          },
          'source.ip': {
            ip: { type: 'ip', searchable: true, aggregatable: true, metadata_field: false },
          },
          'user.name': {
            keyword: {
              type: 'keyword',
              searchable: true,
              aggregatable: true,
              metadata_field: false,
            },
          },
          'event.severity': {
            long: { type: 'long', searchable: true, aggregatable: true, metadata_field: false },
          },
          _id: {
            _id: { type: '_id', searchable: true, aggregatable: false, metadata_field: true },
          },
          process: {
            object: {
              type: 'object',
              searchable: false,
              aggregatable: false,
              metadata_field: false,
            },
          },
        },
      });

      const fetcher = new ESMappingFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );

      const result = await fetcher.fetchIndexMappings('logs-*');

      // The resolved fields collection is a Map.
      expect(result.fields).toBeInstanceOf(Map);

      // Only the four queryable, non-metadata, non-object fields survive.
      expect(result.fields.size).toBe(4);
      expect(result.fields.has('@timestamp')).toBe(true);
      expect(result.fields.has('source.ip')).toBe(true);
      expect(result.fields.has('user.name')).toBe(true);
      expect(result.fields.has('event.severity')).toBe(true);

      // Metadata field and structural object are excluded.
      expect(result.fields.has('_id')).toBe(false);
      expect(result.fields.has('process')).toBe(false);

      // A representative field is normalized exactly as expected.
      expect(result.fields.get('source.ip')).toEqual({
        name: 'source.ip',
        type: 'ip',
        searchable: true,
        aggregatable: true,
      });

      // The pattern is echoed back and the timestamp is a Date.
      expect(result.indexPattern).toBe('logs-*');
      expect(result.fetchedAt).toBeInstanceOf(Date);

      // field_caps is called once, targeting the supplied pattern with all fields.
      expect(esClient.fieldCaps).toHaveBeenCalledTimes(1);
      const callArg = esClient.fieldCaps.mock.calls[0][0];
      expect(callArg.index).toBe('logs-*');
      expect(callArg.fields).toBe('*');

      // Success path does not log a warning.
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('fetchIndexMappings — error path', () => {
    it('resolves with an empty mapping and logs a warning when field_caps rejects', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      esClient.fieldCaps.mockRejectedValue(new Error('cluster unavailable'));

      const fetcher = new ESMappingFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );

      // Never throws — the call resolves.
      await expect(fetcher.fetchIndexMappings('logs-*')).resolves.toBeDefined();

      const result = await fetcher.fetchIndexMappings('logs-*');

      expect(result.fields.size).toBe(0);
      expect(result.indexPattern).toBe('logs-*');
      expect(result.fetchedAt).toBeInstanceOf(Date);

      // One warning per failed call (we invoked the method twice above).
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('logs exactly once for a single failing call', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      esClient.fieldCaps.mockRejectedValue(new Error('cluster unavailable'));

      const fetcher = new ESMappingFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );

      const result = await fetcher.fetchIndexMappings('logs-*');

      expect(result.fields.size).toBe(0);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchIndexMappings — empty fields path', () => {
    it('returns an empty mapping without logging when no fields are reported', async () => {
      const esClient = createMockEsClient();
      const logger = createMockLogger();

      esClient.fieldCaps.mockResolvedValue({ indices: [], fields: {} });

      const fetcher = new ESMappingFetcher(
        esClient as unknown as ElasticsearchClient,
        logger as unknown as Logger
      );

      const result = await fetcher.fetchIndexMappings('does-not-exist-*');

      expect(result.fields.size).toBe(0);
      expect(result.indexPattern).toBe('does-not-exist-*');
      expect(result.fetchedAt).toBeInstanceOf(Date);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
