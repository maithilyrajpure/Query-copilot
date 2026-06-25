import { ESQLSyntaxChecker } from './esql.syntax.checker';

describe('ESQLSyntaxChecker', () => {
  const checker = new ESQLSyntaxChecker();

  it('passes a valid ES|QL statement', () => {
    const result = checker.check('FROM logs-* | STATS count = COUNT(*) BY user.name | SORT count DESC');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('passes a simple FROM ... LIMIT', () => {
    expect(checker.check('FROM logs-* | LIMIT 10').valid).toBe(true);
  });

  it('flags a malformed command (typo) as invalid with a message', () => {
    const result = checker.check('FROM logs-* | STATZ count = COUNT(*)');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(typeof result.errors[0].message).toBe('string');
    expect(result.errors[0].message.length).toBeGreaterThan(0);
  });

  it('flags a statement that does not start with a source command', () => {
    const result = checker.check('STATS count = COUNT(*)');
    expect(result.valid).toBe(false);
  });

  it('never throws on garbage input', () => {
    expect(() => checker.check('|||  not esql  (((')).not.toThrow();
    expect(checker.check('|||  not esql  (((').valid).toBe(false);
  });
});
