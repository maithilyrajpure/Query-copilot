import { PromptTemplateRegistry } from './prompt.templates';
import type { FewShotExample } from './prompt.templates';
import { INVESTIGATION_TYPES } from '../../../common/constants';

describe('PromptTemplateRegistry', () => {
  const registry = new PromptTemplateRegistry();
  const allTypes = Object.values(INVESTIGATION_TYPES);

  const isNonEmptyString = (value: unknown): boolean =>
    typeof value === 'string' && value.length > 0;

  const referencesKqlField = (kql: string): boolean =>
    kql.includes(':') ||
    kql.includes('>=') ||
    kql.includes('<=') ||
    kql.includes('>') ||
    kql.includes('<');

  describe('getFewShotExamples', () => {
    it.each(allTypes)('returns at least 2 examples for "%s"', (type) => {
      const examples = registry.getFewShotExamples(type);
      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThanOrEqual(2);
    });

    it.each(allTypes)('returns fully-populated examples for "%s"', (type) => {
      const examples = registry.getFewShotExamples(type);
      examples.forEach((example: FewShotExample) => {
        expect(isNonEmptyString(example.userQuery)).toBe(true);
        expect(isNonEmptyString(example.expectedKQL)).toBe(true);
        expect(isNonEmptyString(example.explanation)).toBe(true);
      });
    });

    it.each(allTypes)('returns a defensive copy for "%s"', (type) => {
      const first = registry.getFewShotExamples(type);
      const originalLength = first.length;
      first.pop();
      const second = registry.getFewShotExamples(type);
      expect(second.length).toBe(originalLength);
    });
  });

  describe('getAllExamples', () => {
    it('returns at least 24 examples (12 types x 2)', () => {
      const all = registry.getAllExamples();
      expect(all.length).toBeGreaterThanOrEqual(24);
    });

    it('returns only fully-populated examples', () => {
      const all = registry.getAllExamples();
      all.forEach((example: FewShotExample) => {
        expect(isNonEmptyString(example.userQuery)).toBe(true);
        expect(isNonEmptyString(example.expectedKQL)).toBe(true);
        expect(isNonEmptyString(example.explanation)).toBe(true);
      });
    });
  });

  describe('example KQL content', () => {
    it('every expectedKQL references a field via a colon or comparison operator', () => {
      const all = registry.getAllExamples();
      all.forEach((example: FewShotExample) => {
        expect(referencesKqlField(example.expectedKQL)).toBe(true);
      });
    });
  });
});
