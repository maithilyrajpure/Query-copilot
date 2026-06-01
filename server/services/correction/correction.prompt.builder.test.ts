import { CorrectionPromptBuilder } from './correction.prompt.builder';
import type { ProviderPrompt } from '../providers';

const original: ProviderPrompt = {
  systemPrompt: 'SYSTEM RULES HERE',
  userMessage: 'Analyst request: find failed logins for admin\n## Examples\n...',
  temperature: 0.1,
};
const builder = new CorrectionPromptBuilder();

describe('CorrectionPromptBuilder', () => {
  it('preserves the original system prompt', () => {
    const result = builder.buildCorrectionPrompt(
      original,
      'user.name : ',
      ['Syntax error at position 12'],
      1
    );

    expect(result.systemPrompt).toBe(original.systemPrompt);
  });

  it('builds a userMessage that keeps the original context and appends the correction instruction', () => {
    const result = builder.buildCorrectionPrompt(
      original,
      'user.name : ',
      ['Syntax error at position 12'],
      1
    );

    expect(result.userMessage.startsWith(original.userMessage)).toBe(true);
    expect(result.userMessage).toContain('user.name : ');
    expect(result.userMessage).toContain('Syntax error at position 12');
    expect(result.userMessage).toContain('attempt 1');
    expect(result.userMessage).toMatch(/fix ONLY/i);
  });

  it('lists every provided error message', () => {
    const result = builder.buildCorrectionPrompt(
      original,
      'user.name : ',
      ['error A', 'error B'],
      1
    );

    expect(result.userMessage).toContain('error A');
    expect(result.userMessage).toContain('error B');
  });

  it('still builds a usable prompt when no errors are provided', () => {
    expect(() => builder.buildCorrectionPrompt(original, 'user.name : ', [], 1)).not.toThrow();

    const result = builder.buildCorrectionPrompt(original, 'user.name : ', [], 1);

    expect(result.userMessage.startsWith(original.userMessage)).toBe(true);
    expect(result.userMessage).toMatch(/re-check/i);
  });

  describe('temperature', () => {
    it('uses the original temperature when present', () => {
      const result = builder.buildCorrectionPrompt(
        original,
        'user.name : ',
        ['Syntax error at position 12'],
        1
      );

      expect(result.temperature).toBe(0.1);
    });

    it('falls back to a low default temperature when the original has none', () => {
      const withoutTemperature: ProviderPrompt = {
        systemPrompt: 'SYSTEM RULES HERE',
        userMessage: 'Analyst request: find failed logins for admin',
      };

      const result = builder.buildCorrectionPrompt(
        withoutTemperature,
        'user.name : ',
        ['Syntax error at position 12'],
        1
      );

      expect(typeof result.temperature).toBe('number');
      expect(result.temperature as number).toBeLessThanOrEqual(0.2);
    });
  });
});
