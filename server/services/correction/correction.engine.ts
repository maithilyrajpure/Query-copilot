/**
 * Iterative KQL correction engine.
 *
 * When a generated KQL query fails validation, the engine runs a bounded retry
 * loop: on each attempt it builds a focused correction prompt (via the injected
 * {@link CorrectionPromptBuilder}), routes it through the {@link ProviderRouter},
 * extracts the corrected KQL from the model response, and re-validates it with
 * the {@link KQLValidatorService}. The loop ends as soon as a query validates,
 * once `maxRetries` attempts are exhausted, or if every provider fails for an
 * attempt.
 *
 * NEVER-REJECTS CONTRACT: {@link CorrectionEngine.correct} always RESOLVES and
 * never rejects. The only awaited call (`providerRouter.route`, which throws
 * when all providers fail) is wrapped in try/catch that logs and breaks out of
 * the loop; the validator never throws; and all response-parsing helpers are
 * fully guarded. Callers therefore never need to wrap `correct` in try/catch.
 *
 * TYPE DIVERGENCE: this service deliberately defines its own `CorrectionParams`,
 * `CorrectionResult`, and `CorrectionAttempt` interfaces. In particular, the
 * service-local `CorrectionAttempt` is intentionally DIFFERENT from the
 * `CorrectionAttempt` exported by `common/types` — that common type models a
 * different concern, so it is deliberately NOT imported here.
 *
 * All dependencies are injected through the constructor; the engine itself
 * instantiates nothing, so every import below is type-only.
 */
import type { ProviderName } from '../../../common/types';
import type { ProviderPrompt } from '../providers';
import type { ProviderResponse } from '../providers';
import type { ProviderRouter } from '../providers';
import type { SchemaContext } from '../schema';
import type { KQLValidatorService, ValidationResult } from '../validation';
import type { LoggerService } from '../observability';
import type { CorrectionPromptBuilder } from './correction.prompt.builder';

/** Inputs for a single correction run. */
export interface CorrectionParams {
  readonly originalPrompt: ProviderPrompt;
  readonly generatedKQL: string;
  readonly validationResult: ValidationResult;
  readonly schemaContext: SchemaContext;
  readonly requestId: string;
}

/**
 * Record of one correction iteration.
 *
 * NOTE: intentionally distinct from `common/types`' `CorrectionAttempt`; see the
 * file-level "TYPE DIVERGENCE" note.
 */
export interface CorrectionAttempt {
  readonly attemptNumber: number;
  readonly correctionPrompt: string; // the correction prompt's userMessage
  readonly generatedKQL: string;
  readonly validationResult: ValidationResult;
  readonly latencyMs: number;
  readonly providerUsed: ProviderName;
}

/** Outcome of a correction run. */
export interface CorrectionResult {
  readonly kql: string;
  readonly validationResult: ValidationResult;
  readonly attempts: CorrectionAttempt[];
  readonly succeeded: boolean;
}

export class CorrectionEngine {
  constructor(
    private readonly correctionPromptBuilder: CorrectionPromptBuilder,
    private readonly providerRouter: ProviderRouter,
    private readonly validator: KQLValidatorService,
    private readonly logger: LoggerService,
    private readonly maxRetries: number
  ) {}

  /**
   * Iteratively corrects a failing KQL query until it validates or retries are
   * exhausted. Resolves (never rejects): see the file-level never-rejects
   * contract.
   *
   * If the incoming query is already valid this is a no-op (zero attempts). If
   * every provider fails on an attempt, the engine stops and returns the best
   * result produced so far with `succeeded: false`.
   */
  async correct(params: CorrectionParams): Promise<CorrectionResult> {
    const attempts: CorrectionAttempt[] = [];
    let currentKQL = params.generatedKQL;
    let currentValidation = params.validationResult;

    // Already valid — nothing to fix.
    if (currentValidation.valid) {
      return { kql: currentKQL, validationResult: currentValidation, attempts, succeeded: true };
    }

    for (let attemptNumber = 1; attemptNumber <= this.maxRetries; attemptNumber++) {
      const errors = this.collectErrorMessages(currentValidation);
      const correctionPrompt = this.correctionPromptBuilder.buildCorrectionPrompt(
        params.originalPrompt,
        currentKQL,
        errors,
        attemptNumber
      );

      // The router throws when all providers fail; catch, log, and stop the loop
      // so `correct` still resolves with the best result so far.
      let response: ProviderResponse | undefined;
      try {
        response = await this.providerRouter.route(correctionPrompt, params.requestId);
      } catch (error) {
        this.logger.logError(params.requestId, error, { stage: 'correction', attemptNumber });
        break; // all providers failed — stop and return the best result so far
      }
      if (!response) break; // defensive: keeps `response` narrowed as defined below

      const newKQL = this.extractKql(response.content);
      const newValidation = this.validator.validate(newKQL, params.schemaContext);

      attempts.push({
        attemptNumber,
        correctionPrompt: correctionPrompt.userMessage,
        generatedKQL: newKQL,
        validationResult: newValidation,
        latencyMs: response.latencyMs,
        providerUsed: response.provider,
      });

      // Records the attempt: attempt number, the errors being fixed, the new KQL,
      // and the new validation outcome. LoggerService scrubs this metadata before
      // it is written, so it is safe to pass query content here.
      this.logger.logPipelineStage(params.requestId, 'correction_attempt', response.latencyMs, {
        attemptNumber,
        providerUsed: response.provider,
        previousErrors: errors,
        generatedKQL: newKQL,
        valid: newValidation.valid,
        errorCount: newValidation.syntaxErrors.length + newValidation.fieldErrors.length,
        ecsFieldCoverage: newValidation.ecsFieldCoverage,
      });

      currentKQL = newKQL;
      currentValidation = newValidation;

      if (newValidation.valid) {
        return { kql: currentKQL, validationResult: currentValidation, attempts, succeeded: true };
      }
    }

    // Retries exhausted, or the loop broke on a provider error.
    return { kql: currentKQL, validationResult: currentValidation, attempts, succeeded: false };
  }

  /** Flattens syntax and field validation errors into a list of messages. */
  private collectErrorMessages(result: ValidationResult): string[] {
    return [
      ...result.syntaxErrors.map((e) => e.message),
      ...result.fieldErrors.map((e) => e.message),
    ];
  }

  /**
   * Defensively extracts the `kql` string from an LLM response. The model is
   * asked to return a JSON object `{ kql, ... }`, but responses may be wrapped
   * in Markdown code fences or include surrounding prose. If no JSON object
   * with a string `kql` can be recovered, the stripped content is returned
   * as-is so the validator can judge it.
   */
  private extractKql(content: string): string {
    const text = this.stripCodeFences((content ?? '').trim());
    const obj =
      this.tryParseObject(text) ?? this.tryParseObject(this.extractFirstJsonObject(text));
    if (obj && typeof obj.kql === 'string') return obj.kql;
    return text;
  }

  /** Removes a leading ```/```json fence and a trailing ``` fence, then trims. */
  private stripCodeFences(text: string): string {
    return text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  /**
   * Returns the substring from the first `{` to the last `}` (inclusive) when
   * both exist and the closing brace follows the opening one; otherwise `''`.
   */
  private extractFirstJsonObject(text: string): string {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      return text.slice(first, last + 1);
    }
    return '';
  }

  /** Parses `text` as a plain JSON object, or returns null on any failure. */
  private tryParseObject(text: string): Record<string, unknown> | null {
    if (!text) return null;
    try {
      const p = JSON.parse(text);
      return p && typeof p === 'object' && !Array.isArray(p)
        ? (p as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
