/**
 * Elasticsearch field *value* sampler for the query copilot.
 *
 * The {@link ESMappingFetcher} grounds the LLM in the target index's field
 * *names* and types — but not their *values*. That gap lets the model emit
 * valid KQL with the wrong literals: e.g. `event.category:"authentication"`
 * (textbook ECS) when the real data uses `event.action:"login"`. The resulting
 * query is syntactically valid yet matches zero documents.
 *
 * This module closes the gap for a curated allowlist of HIGH-SIGNAL,
 * low-cardinality discriminator fields. For each such field that exists in the
 * resolved mapping (and is aggregatable, directly or via its `.keyword`
 * subfield), it runs a single `terms` aggregation and surfaces the real values
 * present in the index, so the prompt can steer the model towards literals that
 * actually exist.
 *
 * High-cardinality fields (IPs, URLs, usernames, ids, free-text messages) are
 * deliberately EXCLUDED: enumerating them is both useless and slow.
 *
 * @packageDocumentation
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ESIndexMapping } from './es.mapping.fetcher';

/**
 * Curated allowlist of high-signal, low-cardinality discriminator fields worth
 * enumerating. These are the fields where the LLM most often guesses a
 * plausible-but-wrong literal, and where the true value set is small enough to
 * fit in a prompt. High-cardinality fields (source.ip, url.path, user.name,
 * `*.id`, message, …) are intentionally absent.
 */
const VALUE_ALLOWLIST: readonly string[] = [
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
];

/** Maximum number of fields aggregated in a single request. */
const MAX_FIELDS = 12;
/** Maximum number of distinct values sampled per field. */
const MAX_VALUES = 12;

/** A resolved aggregation candidate: the queryable base field + its aggregatable variant. */
interface ValueCandidate {
  /** The QUERYABLE base field name (e.g. `event.category`), used as the agg/map key. */
  readonly baseField: string;
  /** The aggregatable field actually targeted (e.g. `event.category` or `event.category.keyword`). */
  readonly aggField: string;
}

/** Minimal shape of a `terms` aggregation result we consume from the search response. */
interface TermsAggregation {
  buckets?: ReadonlyArray<{ key?: unknown }>;
}

/**
 * Samples the real values of a curated set of high-signal fields in an index
 * pattern via a single `terms`-aggregation search.
 *
 * Best-effort by contract: this never throws and never blocks generation. A
 * short timeout bounds the cost, and any failure (unreachable cluster, RED
 * shards, malformed response) yields whatever was gathered — possibly an empty
 * Map — rather than an error.
 */
export class FieldValuesFetcher {
  /**
   * @param esClient - Kibana's scoped {@link ElasticsearchClient}, used to call
   *   the `search` API (mirrors {@link ESMappingFetcher}'s injection).
   * @param logger - A {@link Logger} used to emit a warning when value sampling
   *   fails.
   */
  constructor(
    private readonly esClient: ElasticsearchClient,
    private readonly logger: Logger
  ) {}

  /**
   * Sample the real values for the allowlisted fields present in `mapping`.
   *
   * @param indexPattern - The index pattern to sample (may contain wildcards).
   * @param mapping - The already-resolved field mapping, used to determine which
   *   allowlisted fields exist and how to reach an aggregatable variant.
   * @returns A Map from queryable base field name to its sampled values. Empty
   *   when there are no candidates (no ES call is made) or on any failure.
   *
   * @remarks
   * This method **never throws**. It is intentionally fast and best-effort: a
   * short request timeout bounds its latency, and `ignore_unavailable` /
   * `allow_no_indices` keep RED shards in the pattern from hard-failing the
   * whole request.
   */
  async fetchValues(
    indexPattern: string,
    mapping: ESIndexMapping
  ): Promise<Map<string, string[]>> {
    const values = new Map<string, string[]>();

    // Resolve the aggregatable variant for each allowlisted field that exists.
    const candidates: ValueCandidate[] = [];
    for (const baseField of VALUE_ALLOWLIST) {
      if (candidates.length >= MAX_FIELDS) {
        break;
      }
      const direct = mapping.fields.get(baseField);
      if (direct?.aggregatable === true) {
        candidates.push({ baseField, aggField: baseField });
        continue;
      }
      // Text fields are not aggregatable — fall back to the `.keyword` subfield.
      const keywordField = `${baseField}.keyword`;
      if (mapping.fields.get(keywordField)?.aggregatable === true) {
        candidates.push({ baseField, aggField: keywordField });
      }
    }

    if (candidates.length === 0) {
      // Nothing worth sampling: skip the ES call entirely.
      return values;
    }

    try {
      const aggs: Record<string, { terms: { field: string; size: number } }> = {};
      for (const candidate of candidates) {
        aggs[candidate.baseField] = {
          terms: { field: candidate.aggField, size: MAX_VALUES },
        };
      }

      const response = await this.esClient.search<Record<string, unknown>>(
        {
          index: indexPattern,
          size: 0,
          track_total_hits: false,
          ignore_unavailable: true,
          allow_no_indices: true,
          timeout: '2s',
          aggs,
        },
        { requestTimeout: 2_500 }
      );

      const aggregations = (response.aggregations ?? {}) as Record<string, TermsAggregation>;
      for (const candidate of candidates) {
        const buckets = aggregations[candidate.baseField]?.buckets ?? [];
        const fieldValues: string[] = [];
        for (const bucket of buckets) {
          if (bucket.key === undefined || bucket.key === null) {
            continue;
          }
          // Stringify so numeric keys (e.g. 401) render as queryable literals.
          fieldValues.push(String(bucket.key));
        }
        if (fieldValues.length > 0) {
          values.set(candidate.baseField, fieldValues);
        }
      }
    } catch (error) {
      this.logger.warn(
        `FieldValuesFetcher: failed to sample field values for index pattern "${indexPattern}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Intentionally swallow: value sampling must never block generation.
    }

    return values;
  }
}
