import { ECSRegistry, INVESTIGATION_TYPE_CATEGORIES } from './ecs.registry';
import { INVESTIGATION_TYPES } from '../../../common/constants';

const ALLOWED_TYPES = ['keyword', 'ip', 'date', 'long', 'boolean'];
const ALLOWED_NORMALIZATION_LEVELS = ['core', 'extended', 'custom'];

describe('ECSRegistry', () => {
  describe('getAllFields', () => {
    it('returns a substantial catalogue of fields', () => {
      expect(ECSRegistry.getAllFields().length).toBeGreaterThanOrEqual(80);
    });

    it('only uses supported ECS field types', () => {
      for (const field of ECSRegistry.getAllFields()) {
        expect(ALLOWED_TYPES).toContain(field.type);
      }
    });

    it('has a unique name for every field', () => {
      const names = ECSRegistry.getAllFields().map((field) => field.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });

    it('gives every field a non-empty description and a valid normalization level', () => {
      for (const field of ECSRegistry.getAllFields()) {
        expect(typeof field.description).toBe('string');
        expect(field.description.length).toBeGreaterThan(0);
        expect(ALLOWED_NORMALIZATION_LEVELS).toContain(
          field.normalizationLevel
        );
      }
    });

    it('marks @timestamp as the only required field', () => {
      const required = ECSRegistry.getAllFields().filter(
        (field) => field.isRequired === true
      );
      expect(required).toHaveLength(1);
      expect(required[0]?.name).toBe('@timestamp');
    });
  });

  describe('getFieldsByCategory', () => {
    it('returns only fields of the requested category', () => {
      const processFields = ECSRegistry.getFieldsByCategory('process');
      expect(processFields.length).toBeGreaterThan(0);
      for (const field of processFields) {
        expect(field.category).toBe('process');
      }
    });

    it('returns an empty array for an unknown category', () => {
      expect(ECSRegistry.getFieldsByCategory('nonexistent_category')).toEqual(
        []
      );
    });
  });

  describe('getFieldByName', () => {
    it('resolves a known field by exact name', () => {
      const field = ECSRegistry.getFieldByName('source.ip');
      expect(field).toBeDefined();
      expect(field?.type).toBe('ip');
    });

    it('returns undefined for an unknown field name', () => {
      expect(ECSRegistry.getFieldByName('does.not.exist')).toBeUndefined();
    });
  });

  describe('getFieldsByInvestigationType', () => {
    it('returns category-consistent fields for every investigation type', () => {
      for (const type of Object.values(INVESTIGATION_TYPES)) {
        const fields = ECSRegistry.getFieldsByInvestigationType(type);
        const categories =
          ECSRegistry.getCategoriesForInvestigationType(type);

        expect(fields.length).toBeGreaterThan(0);
        for (const field of fields) {
          expect(categories).toContain(field.category);
        }
      }
    });

    it('includes core base and source fields for brute_force', () => {
      const names = ECSRegistry.getFieldsByInvestigationType(
        'brute_force'
      ).map((field) => field.name);
      expect(names).toContain('@timestamp');
      expect(names).toContain('source.ip');
    });
  });

  describe('INVESTIGATION_TYPE_CATEGORIES', () => {
    it('has an entry for every investigation type', () => {
      for (const type of Object.values(INVESTIGATION_TYPES)) {
        expect(INVESTIGATION_TYPE_CATEGORIES[type]).toBeDefined();
        expect(
          INVESTIGATION_TYPE_CATEGORIES[type].length
        ).toBeGreaterThan(0);
      }
    });
  });
});
