/**
 * Builds a correction `ProviderPrompt` for the KQL correction loop.
 *
 * The builder reuses the original prompt that produced the failing query — its
 * `userMessage` already carries the analyst intent, few-shot examples, and
 * schema context — and appends a focused correction instruction that lists the
 * specific validation errors and tells the model to fix ONLY those errors.
 */
import type { ProviderPrompt } from '../providers';

/** Low temperature: corrections should be deterministic, targeted edits. */
const CORRECTION_TEMPERATURE = 0.1;

export class CorrectionPromptBuilder {
  /**
   * Builds a correction prompt that preserves the original analyst intent and
   * context (carried in `original`) and appends an instruction to fix ONLY the
   * listed errors in the failing KQL.
   *
   * @param original the prompt that produced the failing query (its userMessage already holds the analyst intent, examples, and schema context)
   * @param kql      the failing KQL to correct
   * @param errors   specific validation error messages to fix
   * @param attempt  1-based correction attempt number
   */
  buildCorrectionPrompt(
    original: ProviderPrompt,
    kql: string,
    errors: readonly string[],
    attempt: number
  ): ProviderPrompt {
    const errorBlock =
      errors.length > 0
        ? errors.map((e) => `- ${e}`).join('\n')
        : '- (no specific error messages were provided; re-check the KQL syntax and field names)';

    const instruction = [
      `## Correction required (attempt ${attempt})`,
      'Your previous KQL failed validation. The original analyst request and schema context are above — keep that intent unchanged.',
      '',
      'Failing KQL:',
      kql,
      '',
      'Validation errors to fix:',
      errorBlock,
      '',
      'Fix ONLY the errors listed above. Do not change any other part of the query, and do not add new fields or filters beyond what is required to resolve those errors. Use only the fields provided earlier. Return a single corrected JSON object in the exact required shape, with no Markdown and no commentary.',
    ].join('\n');

    return {
      systemPrompt: original.systemPrompt,
      userMessage: `${original.userMessage}\n\n${instruction}`,
      temperature: original.temperature ?? CORRECTION_TEMPERATURE,
      ...(original.maxTokens !== undefined ? { maxTokens: original.maxTokens } : {}),
    };
  }
}
