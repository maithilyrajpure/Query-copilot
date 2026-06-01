import { KQLSyntaxChecker } from './syntax.checker';

describe('KQLSyntaxChecker', () => {
  const checker = new KQLSyntaxChecker();

  describe('valid KQL', () => {
    it('accepts a conjunction of field expressions', () => {
      const result = checker.check('user.name : "admin" and source.ip : "10.0.0.5"');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts ranges and grouping', () => {
      const result = checker.check(
        'destination.port > 1024 and (event.outcome : "failure" or event.outcome : "unknown")'
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('treats an empty string as match-all (valid)', () => {
      const result = checker.check('');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts a bare, field-less term', () => {
      const result = checker.check('ransomware');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid KQL', () => {
    it('rejects a lone opening paren', () => {
      const result = checker.check('(');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(typeof result.errors[0].message).toBe('string');
      expect(result.errors[0].message.length).toBeGreaterThan(0);
      expect(
        result.errors[0].position === null || typeof result.errors[0].position === 'number'
      ).toBe(true);
    });

    it('rejects a dangling operator', () => {
      const result = checker.check('host.name : "web01" and');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('never throws', () => {
    it('does not throw on deeply malformed input', () => {
      expect(() => checker.check('((( malformed : : :')).not.toThrow();
    });

    it('does not throw on a clearly-bad value', () => {
      expect(() => checker.check(') unbalanced "')).not.toThrow();
    });
  });
});
