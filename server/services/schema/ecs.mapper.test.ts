import { ECSContextMapper } from './ecs.mapper';
import { ECSRegistry } from './ecs.registry';
import type { ESIndexMapping, ESFieldMapping } from './es.mapping.fetcher';
import type { InvestigationIntent } from '../../../common/types';

function makeIntent(overrides: Partial<InvestigationIntent> = {}): InvestigationIntent {
  return {
    type: 'brute_force',
    confidence: 0.9,
    reasoning: 'test',
    suggestedFields: [],
    suggestedQueryLanguage: 'kql' as InvestigationIntent['suggestedQueryLanguage'],
    timeRangeHint: null,
    entitiesExtracted: {
      ipAddresses: [],
      hostnames: [],
      usernames: [],
      processNames: [],
      filePaths: [],
      hashes: [],
      domains: [],
      ports: [],
    },
    ...overrides,
  };
}

function makeMapping(indexPattern: string, fieldNames: string[]): ESIndexMapping {
  const fields = new Map<string, ESFieldMapping>();
  for (const name of fieldNames) {
    fields.set(name, { name, type: 'keyword', searchable: true, aggregatable: true });
  }
  return { indexPattern, fields, fetchedAt: new Date() };
}

describe('ECSContextMapper', () => {
  let mapper: ECSContextMapper;

  beforeEach(() => {
    mapper = new ECSContextMapper();
  });

  describe('relevantECSFields', () => {
    it('equals the registry getFieldsByInvestigationType set for a brute_force intent with no suggestedFields', () => {
      const intent = makeIntent({ type: 'brute_force', suggestedFields: [] });
      const mapping = makeMapping('logs-*', []);

      const context = mapper.buildContext(intent, mapping);

      const expectedNames = ECSRegistry.getFieldsByInvestigationType('brute_force').map(
        (f) => f.name
      );
      const actualNames = context.relevantECSFields.map((f) => f.name);

      expect(expectedNames.length).toBeGreaterThan(0);
      expect(actualNames).toEqual(expectedNames);
    });

    it('includes a suggested field not already present in the registry-by-type result, without introducing duplicate names', () => {
      // http.version is not part of the brute_force categories, so it must come
      // from the intent's suggestedFields.
      const suggested = ECSRegistry.getFieldByName('http.version');
      expect(suggested).toBeDefined();

      const intent = makeIntent({
        type: 'brute_force',
        suggestedFields: suggested ? [suggested] : [],
      });
      const mapping = makeMapping('logs-*', []);

      const context = mapper.buildContext(intent, mapping);

      const names = context.relevantECSFields.map((f) => f.name);
      expect(names).toContain('http.version');

      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('availableIndexFields', () => {
    it('equals the sorted list of the Map keys', () => {
      const intent = makeIntent();
      const mapping = makeMapping('logs-*', ['zeta', 'alpha', 'mid']);

      const context = mapper.buildContext(intent, mapping);

      expect(context.availableIndexFields).toEqual(['alpha', 'mid', 'zeta']);
    });
  });

  describe('fieldOverlap', () => {
    it('contains relevant-for-brute_force fields present in the index, sorted, de-duplicated, and excludes unrelated fields', () => {
      const intent = makeIntent({ type: 'brute_force', suggestedFields: [] });
      const mapping = makeMapping('logs-*', [
        'source.ip',
        'user.name',
        '@timestamp',
        'totally.unrelated.field',
      ]);

      const context = mapper.buildContext(intent, mapping);

      // Must not contain the irrelevant field.
      expect(context.fieldOverlap).not.toContain('totally.unrelated.field');

      // Sorted ascending.
      const sorted = [...context.fieldOverlap].sort();
      expect(context.fieldOverlap).toEqual(sorted);

      // De-duplicated.
      const unique = new Set(context.fieldOverlap);
      expect(unique.size).toBe(context.fieldOverlap.length);

      // Every entry is both present in the index and the name of a relevant ECS field.
      const relevantNames = new Set(context.relevantECSFields.map((f) => f.name));
      for (const name of context.fieldOverlap) {
        expect(context.availableIndexFields).toContain(name);
        expect(relevantNames.has(name)).toBe(true);
      }

      // Any relevant field that is also in the mapping must appear in the overlap.
      for (const field of context.relevantECSFields) {
        if (mapping.fields.has(field.name)) {
          expect(context.fieldOverlap).toContain(field.name);
        }
      }
    });
  });

  describe('fieldValues', () => {
    it('defaults to an empty map when no values are provided', () => {
      const intent = makeIntent();
      const mapping = makeMapping('logs-*', ['event.category']);

      const context = mapper.buildContext(intent, mapping);

      expect(context.fieldValues.size).toBe(0);
    });

    it('flows the provided sampled values through into the context', () => {
      const intent = makeIntent();
      const mapping = makeMapping('logs-*', ['event.action']);
      const fieldValues = new Map<string, readonly string[]>([
        ['event.action', ['login', 'logout']],
      ]);

      const context = mapper.buildContext(intent, mapping, fieldValues);

      expect(Array.from(context.fieldValues.get('event.action') ?? [])).toEqual([
        'login',
        'logout',
      ]);
    });
  });

  describe('empty mapping', () => {
    it('yields empty availableIndexFields and empty fieldOverlap', () => {
      const intent = makeIntent({ type: 'brute_force' });
      const mapping = makeMapping('logs-*', []);

      const context = mapper.buildContext(intent, mapping);

      expect(context.availableIndexFields).toEqual([]);
      expect(context.fieldOverlap).toEqual([]);
    });
  });
});
