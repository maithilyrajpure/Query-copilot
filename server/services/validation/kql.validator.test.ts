import { KQLValidatorService } from './kql.validator';
import { ECSRegistry } from '../schema';
import type { SchemaContext } from '../schema';

function makeContext(availableIndexFields: string[]): SchemaContext {
  return {
    relevantECSFields: ECSRegistry.getFieldsByInvestigationType('brute_force'),
    availableIndexFields,
    fieldOverlap: [],
  };
}

const svc = new KQLValidatorService();

describe('KQLValidatorService', () => {
  describe('validate', () => {
    it('accepts an all-valid ECS query and reports full coverage', () => {
      const result = svc.validate(
        'user.name : "admin" and source.ip : "10.0.0.5"',
        makeContext(['user.name', 'source.ip'])
      );

      expect(result.valid).toBe(true);
      expect(result.syntaxErrors).toHaveLength(0);
      expect(result.fieldErrors).toHaveLength(0);
      expect(result.totalFieldsInQuery).toBe(2);
      expect(result.ecsFieldsUsed).toHaveLength(2);
      expect(result.ecsFieldCoverage).toBe('2/2');
    });

    it('reports an unknown field as an advisory warning, not a blocking error', () => {
      const result = svc.validate(
        'user.name : "admin" and totally.bogus.field : "x"',
        makeContext(['user.name'])
      );

      // Unknown fields no longer fail validation — the index mapping may be
      // incomplete and the KQL is syntactically valid, so it must still run.
      expect(result.valid).toBe(true);
      expect(result.fieldErrors).toHaveLength(0);
      expect(
        result.warnings.some(
          (w) => w.includes('totally.bogus.field') && /not be found|not found|may not match/i.test(w)
        )
      ).toBe(true);
    });

    it('reports a syntax error and skips field validation', () => {
      const result = svc.validate('(', makeContext(['user.name']));

      expect(result.valid).toBe(false);
      expect(result.syntaxErrors).toHaveLength(1);
      expect(result.fieldErrors).toHaveLength(0);
      expect(result.ecsFieldCoverage).toBe('0/0');
      expect(result.warnings.some((w) => /skipped/i.test(w))).toBe(true);
    });

    it('allows a non-ECS but in-index field and warns about it', () => {
      const result = svc.validate(
        'source.ip : "1.1.1.1" and user.name : "admin" and custom.app.field : "z"',
        makeContext(['source.ip', 'user.name', 'custom.app.field'])
      );

      expect(result.valid).toBe(true);
      expect(result.totalFieldsInQuery).toBe(3);
      expect(result.ecsFieldsUsed).toHaveLength(2);
      expect(result.ecsFieldCoverage).toBe('2/3');
      expect(
        result.warnings.some(
          (w) => w.includes('custom.app.field') && w.includes('not a recognized ECS field')
        )
      ).toBe(true);
    });

    it('returns real ECSField objects in ecsFieldsUsed', () => {
      const result = svc.validate(
        'user.name : "admin" and source.ip : "10.0.0.5"',
        makeContext(['user.name', 'source.ip'])
      );

      for (const field of result.ecsFieldsUsed) {
        expect(typeof field.name).toBe('string');
        expect(typeof field.type).toBe('string');
        expect(field.description.length).toBeGreaterThan(0);
      }
    });

    it('never throws on malformed input', () => {
      expect(() => svc.validate('((( : :', makeContext([]))).not.toThrow();
    });
  });
});
