/**
 * Unit tests for {@link buildQueryDsl} and the shared sort/size constants.
 */

import type { estypes } from '@elastic/elasticsearch';
import { buildQueryDsl, DEFAULT_MAX_RESULTS, TIMESTAMP_SORT } from './search.query.builder';

describe('buildQueryDsl', () => {
  it('returns a bare kuery DSL when no timeRange is given (no bool wrap)', () => {
    const dsl = buildQueryDsl('event.action : "login"');

    // No time range → the compiled kuery is returned directly, not wrapped in a
    // bool{must,filter}. buildEsQuery produces a top-level bool, but it MUST NOT
    // carry the synthetic @timestamp range filter we add only for time ranges.
    const filters = (dsl.bool?.filter ?? []) as estypes.QueryDslQueryContainer[];
    const hasTimestampRange = filters.some(
      (f) => f.range !== undefined && '@timestamp' in (f.range as Record<string, unknown>)
    );
    expect(hasTimestampRange).toBe(false);
  });

  it('wraps the kuery in bool{must, filter:[range @timestamp]} when a timeRange is given', () => {
    const dsl = buildQueryDsl('event.action : "login"', {
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-02T00:00:00Z',
    });

    expect(dsl.bool).toBeDefined();
    expect(Array.isArray(dsl.bool?.must)).toBe(true);

    const filter = dsl.bool?.filter as estypes.QueryDslQueryContainer[];
    expect(filter).toHaveLength(1);
    expect(filter[0].range).toEqual({
      '@timestamp': {
        gte: '2026-01-01T00:00:00Z',
        lte: '2026-01-02T00:00:00Z',
        format: 'strict_date_optional_time||epoch_millis',
      },
    });
  });
});

describe('constants', () => {
  it('exposes a default max-results cap', () => {
    expect(DEFAULT_MAX_RESULTS).toBe(100);
  });

  it('sorts @timestamp descending with unmapped_type date', () => {
    expect(TIMESTAMP_SORT).toEqual([
      { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
    ]);
  });
});
