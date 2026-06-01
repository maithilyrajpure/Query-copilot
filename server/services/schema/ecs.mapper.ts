/**
 * ECS context mapper.
 *
 * Fuses the static ECS knowledge base (what fields *should* exist for a given
 * investigation type, per {@link ECSRegistry}) with the concrete field mapping
 * of the target Elasticsearch index (what fields *actually* exist, per
 * {@link ESIndexMapping}).
 *
 * The product of this fusion is a {@link SchemaContext}, which a downstream
 * query builder consumes to generate queries that reference only fields the
 * target index really has — avoiding queries that silently match nothing
 * because they reference absent fields.
 *
 * @module server/services/schema/ecs.mapper
 */

import type { InvestigationIntent } from '../../../common/types';
import type { ECSField } from '../../../common/types';
import { ECSRegistry } from './ecs.registry';
import type { ESIndexMapping } from './es.mapping.fetcher';

/**
 * Schema context fusing ECS knowledge with the concrete fields available in the
 * target index.
 *
 * The key value of this structure is {@link SchemaContext.fieldOverlap}: it
 * tells a downstream query builder which of the relevant ECS fields actually
 * exist in the target index, so the builder can avoid referencing absent
 * fields (which would otherwise produce queries that match nothing).
 */
export interface SchemaContext {
  /**
   * ECS fields relevant to the investigation: the registry fields for the
   * investigation type, unioned with the intent's own suggested fields,
   * de-duplicated by field name.
   */
  readonly relevantECSFields: readonly ECSField[];
  /** All field names present in the target index mapping (sorted ascending). */
  readonly availableIndexFields: readonly string[];
  /**
   * Names of relevant ECS fields that ALSO exist in the index mapping
   * (sorted ascending, de-duplicated).
   *
   * A downstream query builder should prefer these names when constructing a
   * query, since they are both ECS-relevant for the investigation and known to
   * be present in the target index.
   */
  readonly fieldOverlap: readonly string[];
}

/**
 * Builds a {@link SchemaContext} for a given investigation intent and target
 * index mapping.
 *
 * This mapper is stateless; a single instance may be reused across requests.
 */
export class ECSContextMapper {
  /**
   * Build the schema context for the supplied intent and index mapping.
   *
   * The returned {@link SchemaContext.relevantECSFields} is the union of the
   * registry fields for `intent.type` and `intent.suggestedFields`, de-duped by
   * name (registry fields first, so they win on collision). The
   * {@link SchemaContext.fieldOverlap} is the subset of those relevant field
   * names that are actually present in `esMapping`.
   *
   * @param intent - The classified investigation intent.
   * @param esMapping - The fetched field mapping for the target index.
   * @returns A frozen schema context fusing ECS knowledge with the index mapping.
   */
  public buildContext(
    intent: InvestigationIntent,
    esMapping: ESIndexMapping
  ): SchemaContext {
    const registryFields: readonly ECSField[] =
      ECSRegistry.getFieldsByInvestigationType(intent.type);

    // Registry fields first so they win on a name collision with suggestions.
    const relevantECSFields: readonly ECSField[] = this.dedupeByName([
      ...registryFields,
      ...intent.suggestedFields,
    ]);

    const availableIndexFields: readonly string[] = Array.from(
      esMapping.fields.keys()
    ).sort();

    const overlapSet = new Set<string>();
    for (const field of relevantECSFields) {
      if (esMapping.fields.has(field.name)) {
        overlapSet.add(field.name);
      }
    }
    const fieldOverlap: readonly string[] = Array.from(overlapSet).sort();

    return Object.freeze({
      relevantECSFields,
      availableIndexFields,
      fieldOverlap,
    });
  }

  /**
   * De-duplicate a list of ECS fields by their `name`, preserving order and
   * keeping the first occurrence of each name.
   *
   * @param fields - Fields to de-duplicate.
   * @returns A new array containing one field per distinct name.
   */
  private dedupeByName(fields: readonly ECSField[]): ECSField[] {
    const seen = new Set<string>();
    const result: ECSField[] = [];
    for (const field of fields) {
      if (!seen.has(field.name)) {
        seen.add(field.name);
        result.push(field);
      }
    }
    return result;
  }
}
