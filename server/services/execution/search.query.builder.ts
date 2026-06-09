/**
 * Shared Query DSL builder for the query-execution paths.
 *
 * Both the `asCurrentUser` {@link QueryExecutorService} and the MCP-backed
 * search provider build the IDENTICAL Elasticsearch Query DSL from a KQL string
 * plus an optional time range, so that string is extracted here once and reused
 * by both. Keeping a single source of truth guarantees the two execution paths
 * stay query-equivalent.
 *
 * @packageDocumentation
 */

import { buildEsQuery } from '@kbn/es-query';
import type { estypes } from '@elastic/elasticsearch';
import type { TimeRange } from '../../../common/types';

/** Default cap on the number of result documents returned by a query. */
export const DEFAULT_MAX_RESULTS = 100;

/**
 * Sort applied to every query: newest-first, so a capped `size` returns the
 * most recent documents. `unmapped_type: 'date'` keeps the sort valid across
 * indices in the pattern that lack an `@timestamp` mapping instead of erroring.
 */
export const TIMESTAMP_SORT = [
  { '@timestamp': { order: 'desc', unmapped_type: 'date' } },
] as const satisfies estypes.Sort;

/**
 * Build the Elasticsearch Query DSL for a KQL query, optionally constrained to
 * a time range.
 *
 * The KQL is compiled via `@kbn/es-query`'s `buildEsQuery` (kuery language).
 * When a `timeRange` is supplied, the compiled query is wrapped in a `bool`
 * with the KQL under `must` and a `@timestamp` `range` filter under `filter`.
 *
 * @param kql - The KQL (kuery) query string.
 * @param timeRange - An optional absolute/date-math time window.
 * @returns The combined {@link estypes.QueryDslQueryContainer}.
 * @throws {KQLSyntaxError} from `buildEsQuery` when the KQL is invalid.
 */
export function buildQueryDsl(
  kql: string,
  timeRange?: TimeRange
): estypes.QueryDslQueryContainer {
  // Build the KQL DSL. `buildEsQuery` throws `KQLSyntaxError` on invalid KQL.
  const kqlDsl = buildEsQuery(undefined, { query: kql, language: 'kuery' }, []);

  // Combine with an optional time range filter.
  return timeRange
    ? {
        bool: {
          must: [kqlDsl],
          filter: [
            {
              range: {
                '@timestamp': {
                  gte: timeRange.from,
                  lte: timeRange.to,
                  format: 'strict_date_optional_time||epoch_millis',
                },
              },
            },
          ],
        },
      }
    : kqlDsl;
}
