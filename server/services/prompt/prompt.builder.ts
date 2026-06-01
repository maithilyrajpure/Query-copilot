/**
 * Prompt assembly for the Query Copilot generation pipeline.
 *
 * The {@link PromptBuilder} composes the provider-agnostic {@link ProviderPrompt}
 * objects that drive KQL generation. It layers the static {@link SYSTEM_PROMPT}
 * with an ECS field reference derived from the resolved {@link SchemaContext},
 * and builds a user message from the most relevant few-shot examples, the prior
 * conversation, the analyst's latest request, and the target index schema.
 *
 * It also builds correction prompts: when a generated KQL query fails
 * validation, the original prompt is reused verbatim (so the ECS context and
 * few-shot framing carry over) and a correction instruction enumerating the
 * validation errors is appended to the user message.
 *
 * The builder is stateless apart from its injected {@link PromptTemplateRegistry}
 * and never mutates the inputs it is given.
 */

import type {
  InvestigationIntent,
  ConversationMessage,
  ValidationError,
  ECSField,
} from '../../../common/types';
import type { ProviderPrompt } from '../providers';
import type { SchemaContext } from '../schema';
import { SYSTEM_PROMPT } from './system.prompts';
import { PromptTemplateRegistry } from './prompt.templates';

/** Low sampling temperature so query generation is as deterministic as possible. */
const GENERATION_TEMPERATURE = 0.1;
/** Maximum number of prior conversation turns rendered into a prompt. */
const MAX_HISTORY_MESSAGES = 10;
/** Maximum number of available index fields listed; truncation is reported explicitly. */
const MAX_AVAILABLE_FIELDS_RENDERED = 100;

/**
 * Assembles {@link ProviderPrompt} instances for KQL generation and correction.
 *
 * Inject a {@link PromptTemplateRegistry} to control which few-shot examples are
 * available; when omitted a default registry over the curated catalogue is used.
 */
export class PromptBuilder {
  private readonly templateRegistry: PromptTemplateRegistry;

  constructor(templateRegistry?: PromptTemplateRegistry) {
    this.templateRegistry = templateRegistry ?? new PromptTemplateRegistry();
  }

  /**
   * Builds the initial generation prompt for an investigation.
   *
   * @param intent   The classified investigation intent driving few-shot selection.
   * @param context  The resolved schema context (relevant ECS fields and index fields).
   * @param history  The conversation so far; the last user message is treated as the request.
   * @returns A {@link ProviderPrompt} with a deterministic generation temperature.
   */
  public buildGenerationPrompt(
    intent: InvestigationIntent,
    context: SchemaContext,
    history: ConversationMessage[]
  ): ProviderPrompt {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(intent, context, history);
    return { systemPrompt, userMessage, temperature: GENERATION_TEMPERATURE };
  }

  /**
   * Builds a correction prompt after a generated query fails validation.
   *
   * The original system prompt is preserved so the ECS context and few-shot
   * framing carry over, and a correction instruction is appended to the original
   * user message.
   *
   * @param originalPrompt   The prompt that produced the failing query.
   * @param generatedKQL     The KQL that failed validation.
   * @param validationErrors The validation issues that must be resolved.
   * @param attempt          The (1-based) correction attempt number, surfaced to the model.
   * @returns A {@link ProviderPrompt} that asks the model to revise the query.
   */
  public buildCorrectionPrompt(
    originalPrompt: ProviderPrompt,
    generatedKQL: string,
    validationErrors: ValidationError[],
    attempt: number
  ): ProviderPrompt {
    const instruction = this.buildCorrectionInstruction(generatedKQL, validationErrors, attempt);
    const corrected: ProviderPrompt = {
      systemPrompt: originalPrompt.systemPrompt,
      userMessage: `${originalPrompt.userMessage}\n\n${instruction}`,
      temperature: originalPrompt.temperature ?? GENERATION_TEMPERATURE,
      ...(originalPrompt.maxTokens !== undefined ? { maxTokens: originalPrompt.maxTokens } : {}),
    };
    return corrected;
  }

  /** Combines the static system prompt with an ECS field reference for the context. */
  private buildSystemPrompt(context: SchemaContext): string {
    return `${SYSTEM_PROMPT}\n\n${this.formatEcsFieldReference(context.relevantECSFields)}`;
  }

  /** Renders the relevant ECS fields as a reference section for the system prompt. */
  private formatEcsFieldReference(fields: readonly ECSField[]): string {
    const header = '## ECS field reference';
    if (fields.length === 0) {
      return `${header}\nNo specific ECS fields were identified for this investigation; rely on the available index fields.`;
    }
    const lines = fields.map((field) => `- ${field.name} (${field.type}): ${field.description}`);
    return `${header}\n${lines.join('\n')}`;
  }

  /** Composes the analyst-facing user message from examples, history, request, and schema. */
  private buildUserMessage(
    intent: InvestigationIntent,
    context: SchemaContext,
    history: ConversationMessage[]
  ): string {
    const { analystQuery, priorMessages } = this.resolveAnalystQuery(history, intent);

    const sections: string[] = [];
    sections.push(this.formatFewShotExamples(intent.type));

    const historySection = this.formatHistory(priorMessages);
    if (historySection !== '') {
      sections.push(historySection);
    }

    sections.push(`## Analyst request\n${analystQuery}`);
    sections.push(this.formatSchemaContext(context));
    sections.push(
      'Generate the KQL for the analyst request above, following your system instructions. Respond with only the JSON object.'
    );

    return sections.join('\n\n');
  }

  /**
   * Identifies the analyst's latest request and the messages that preceded it.
   *
   * The last message with role `'user'` is treated as the request; everything
   * before it is prior context. If there is no user message, the intent's
   * reasoning is used as the request and the whole history is treated as prior.
   */
  private resolveAnalystQuery(
    history: ConversationMessage[],
    intent: InvestigationIntent
  ): { analystQuery: string; priorMessages: ConversationMessage[] } {
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];
      if (message !== undefined && message.role === 'user') {
        return { analystQuery: message.content, priorMessages: history.slice(0, i) };
      }
    }
    return { analystQuery: intent.reasoning, priorMessages: history };
  }

  /** Renders the few-shot examples for an investigation type into a labelled block. */
  private formatFewShotExamples(type: InvestigationIntent['type']): string {
    const examples = this.templateRegistry.getFewShotExamples(type);
    const header = '## Examples';
    if (examples.length === 0) {
      return `${header}\nNo examples available for this investigation type.`;
    }
    const blocks = examples.map((example, index) => {
      return [
        `Example ${index + 1}:`,
        `Request: ${example.userQuery}`,
        `KQL: ${example.expectedKQL}`,
        `Explanation: ${example.explanation}`,
      ].join('\n');
    });
    return `${header}\n${blocks.join('\n\n')}`;
  }

  /** Renders the most recent conversation turns; returns '' when there are none. */
  private formatHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return '';
    }
    const recent = messages.slice(-MAX_HISTORY_MESSAGES);
    const lines = recent.map((m) => `${m.role}: ${m.content}`);
    return `## Conversation so far\n${lines.join('\n')}`;
  }

  /** Renders the target index schema: confirmed-present fields and available fields. */
  private formatSchemaContext(context: SchemaContext): string {
    const header = '## Target index schema';

    const overlapValue = context.fieldOverlap.length
      ? context.fieldOverlap.join(', ')
      : 'none of the relevant ECS fields were found in this index';
    const overlapLine = `Fields confirmed present in the index (prefer these): ${overlapValue}`;

    let availableLine: string;
    if (context.availableIndexFields.length === 0) {
      availableLine = 'Available index fields: (index mapping unavailable)';
    } else {
      const total = context.availableIndexFields.length;
      const shown = context.availableIndexFields.slice(0, MAX_AVAILABLE_FIELDS_RENDERED);
      availableLine = `Available index fields (${total} total): ${shown.join(', ')}`;
      if (total > MAX_AVAILABLE_FIELDS_RENDERED) {
        availableLine += ` … (showing first ${MAX_AVAILABLE_FIELDS_RENDERED} of ${total})`;
      }
    }

    return `${header}\n${overlapLine}\n${availableLine}`;
  }

  /** Builds the correction instruction appended to the original user message. */
  private buildCorrectionInstruction(
    generatedKQL: string,
    errors: ValidationError[],
    attempt: number
  ): string {
    const issueLines = errors.length
      ? errors.map((err) => `- ${this.formatValidationError(err)}`).join('\n')
      : '- (no specific errors were reported; re-check the KQL syntax and field names)';

    return [
      `## Correction required (attempt ${attempt})`,
      'Your previous response produced this KQL, which failed validation:',
      generatedKQL,
      '',
      'The following validation issue(s) must be fixed:',
      issueLines,
      '',
      'Revise the KQL to resolve every issue above. Use only the fields provided earlier. Return a single corrected JSON object in the exact required shape, with no Markdown or commentary.',
    ].join('\n');
  }

  /** Formats a single validation error as a compact, human-readable line. */
  private formatValidationError(err: ValidationError): string {
    let line = `[${err.severity}${err.code ? '/' + err.code : ''}] ${err.message}`;
    if (err.field !== null) {
      line += ` (field: ${err.field})`;
    }
    if (err.line !== null) {
      line += ` at line ${err.line}`;
      if (err.column !== null) {
        line += `, column ${err.column}`;
      }
    }
    if (err.suggestion !== null) {
      line += ` — suggestion: ${err.suggestion}`;
    }
    return line;
  }
}
