import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIAbortError,
  GoogleGenerativeAIResponseError,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import type { GenerativeModel } from '@google/generative-ai';
import { BaseProvider } from '../base.provider';
import type { ProviderPrompt, ProviderResponse, ProviderMetadata } from '../types';
import {
  ProviderRateLimitError,
  ProviderAuthError,
  ProviderContextOverflowError,
  ProviderUnavailableError,
} from '../errors';
import { PROVIDER_NAMES } from '../../../../common';
import { GeminiAdapter } from './gemini.adapter';
import type { GeminiConfig } from './gemini.config';
import {
  GEMINI_SAFETY_SETTINGS,
  GEMINI_MAX_RETRIES,
  GEMINI_RETRY_BASE_DELAY_MS,
  GEMINI_HEALTH_PROBE_TEXT,
} from './gemini.config';

/**
 * GeminiProvider
 *
 * Concrete provider adapter for Google Gemini models.
 * Extends BaseProvider for retry, timeout, and error normalisation infrastructure.
 *
 * Lifecycle:
 *  1. complete()   — sends a system + user message pair via generateContent().
 *                    Wraps in withTimeout(), retries transient failures via retry().
 *  2. isHealthy()  — makes a minimal countTokens probe to verify the API key and
 *                    model availability without generating a completion.
 *  3. estimateTokens() — delegates to SDK's countTokens() for accurate pre-flight
 *                    estimates; falls back to the heuristic (chars / 4) on failure.
 *
 * Error classification:
 *  - HTTP 429          → ProviderRateLimitError (not retried by retry() — handled upstream)
 *  - HTTP 401/403      → ProviderAuthError (not retried)
 *  - HTTP 422          → ProviderContextOverflowError (not retried)
 *  - AbortError        → ProviderTimeoutError (wrapped in withTimeout)
 *  - Safety block      → ProviderUnavailableError with descriptive message
 *  - All others        → delegated to BaseProvider.normalizeError()
 */
export class GeminiProvider extends BaseProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  private readonly adapter: GeminiAdapter;
  private readonly config: GeminiConfig;

  constructor(config: GeminiConfig) {
    super();
    this.config = config;
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = this.client.getGenerativeModel(
      {
        model: config.model,
        systemInstruction: undefined, // Set per-request in complete()
        safetySettings: GEMINI_SAFETY_SETTINGS.map((s) => ({
          category: HarmCategory[s.category as keyof typeof HarmCategory],
          threshold: HarmBlockThreshold[s.threshold as keyof typeof HarmBlockThreshold],
        })),
        generationConfig: {
          maxOutputTokens: config.maxTokens,
          temperature: config.temperature,
          candidateCount: 1,
        },
      }
    );
    this.adapter = new GeminiAdapter();
  }

  // ---------------------------------------------------------------------------
  // ILLMProvider — required implementations
  // ---------------------------------------------------------------------------

  /**
   * Sends a prompt to Gemini and returns the normalised ProviderResponse.
   *
   * Gemini does not have a first-class "system message" in the messages array;
   * instead it accepts `systemInstruction` at the model level. Because we set
   * system prompts per-request, we create a fresh GenerativeModel instance
   * scoped to this call rather than mutating the shared this.model.
   */
  public async complete(prompt: ProviderPrompt): Promise<ProviderResponse> {
    return this.retry(
      () => this.executeComplete(prompt),
      GEMINI_MAX_RETRIES,
      GEMINI_RETRY_BASE_DELAY_MS
    );
  }

  /**
   * Lightweight health probe — counts tokens on a minimal string.
   * countTokens() validates the API key and model availability without billing
   * for a completion. Returns false on any error rather than throwing.
   */
  public async isHealthy(): Promise<boolean> {
    try {
      await this.withTimeout(
        () => this.model.countTokens(GEMINI_HEALTH_PROBE_TEXT),
        this.config.timeoutMs
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the static metadata used by the provider router for selection and ranking.
   */
  public getMetadata(): ProviderMetadata {
    return {
      name: PROVIDER_NAMES.GEMINI,
      role: 'primary',
      priority: 1,
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Uses the SDK's countTokens() for an accurate pre-flight token estimate.
   * Falls back to the BaseProvider heuristic (chars / 4) if the API call fails
   * to avoid blocking the pipeline on a counting failure.
   *
   * Note: This is an async operation — we return synchronously from the interface
   * method using the heuristic, and expose an async variant for callers that can
   * afford to await.
   */
  public override estimateTokens(text: string): number {
    // Synchronous heuristic — satisfies ILLMProvider contract.
    // Use estimateTokensAsync() for accurate SDK-based counts when latency allows.
    return super.estimateTokens(text);
  }

  /**
   * Accurate async token estimation via SDK countTokens().
   * Returns the heuristic estimate on failure to remain non-blocking.
   */
  public async estimateTokensAsync(text: string): Promise<number> {
    try {
      const result = await this.withTimeout(
        () => this.model.countTokens(text),
        5_000 // Short timeout — this is a pre-flight check, not a generation
      );
      return result.totalTokens;
    } catch {
      return super.estimateTokens(text);
    }
  }

  // ---------------------------------------------------------------------------
  // Private implementation
  // ---------------------------------------------------------------------------

  /**
   * Core generation logic — called by complete() inside the retry wrapper.
   * Creates a request-scoped GenerativeModel with the per-request systemInstruction
   * to avoid mutating shared state.
   */
  private async executeComplete(prompt: ProviderPrompt): Promise<ProviderResponse> {
    // Build a request-scoped model with this prompt's system instruction.
    // getGenerativeModel() is cheap — it does not make a network call.
    const requestModel = this.client.getGenerativeModel({
      model: this.config.model,
      systemInstruction: prompt.systemPrompt,
      safetySettings: GEMINI_SAFETY_SETTINGS.map((s) => ({
        category: HarmCategory[s.category as keyof typeof HarmCategory],
        threshold: HarmBlockThreshold[s.threshold as keyof typeof HarmBlockThreshold],
      })),
      generationConfig: {
        maxOutputTokens: prompt.maxTokens ?? this.config.maxTokens,
        temperature: prompt.temperature ?? this.config.temperature,
        candidateCount: 1,
      },
    });

    const startMs = Date.now();

    let rawResult: Awaited<ReturnType<typeof requestModel.generateContent>>;

    try {
      rawResult = await this.withTimeout(
        () =>
          requestModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt.userMessage }] }],
          }),
        this.config.timeoutMs
      );
    } catch (err) {
      throw this.classifyError(err);
    }

    const latencyMs = Date.now() - startMs;
    const response = rawResult.response;

    // Validate the response has usable content before adapting
    this.assertUsableResponse(response);

    const providerResponse = this.adapter.adaptGenerateContentResponse(
      response,
      this.config.model,
      latencyMs,
      rawResult
    );

    // Final guard: empty content after safety checks is a non-retryable failure
    if (providerResponse.content.trim().length === 0) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.GEMINI,
        'Response content is empty — the request may have been blocked by safety filters',
        { retryable: false }
      );
    }

    return providerResponse;
  }

  /**
   * Classifies any thrown value from the Gemini SDK into a typed ProviderError.
   * Called from the catch block in executeComplete() before re-throwing.
   *
   * Maps:
   *  - GoogleGenerativeAIFetchError(429) → ProviderRateLimitError
   *  - GoogleGenerativeAIFetchError(401/403) → ProviderAuthError
   *  - GoogleGenerativeAIFetchError(422) → ProviderContextOverflowError
   *  - GoogleGenerativeAIFetchError(other) → ProviderUnavailableError with status
   *  - GoogleGenerativeAIAbortError → delegated to BaseProvider.normalizeError()
   *    (which maps AbortError → ProviderTimeoutError)
   *  - GoogleGenerativeAIResponseError → ProviderUnavailableError (safety / parse)
   *  - Everything else → BaseProvider.normalizeError()
   */
  private classifyError(err: unknown): Error {
    if (err instanceof GoogleGenerativeAIFetchError) {
      const status = err.status;

      if (status === 429) {
        // Extract Retry-After if present in the error details
        const retryAfterMs = this.extractRetryAfterMs(err);
        return new ProviderRateLimitError(PROVIDER_NAMES.GEMINI, {
          retryAfterMs,
          cause: err,
        });
      }

      if (status === 401 || status === 403) {
        return new ProviderAuthError(PROVIDER_NAMES.GEMINI, { cause: err });
      }

      if (status === 422) {
        // 422 from Gemini typically means the context window was exceeded
        return new ProviderContextOverflowError(
          PROVIDER_NAMES.GEMINI,
          0, // We don't have exact counts at this point
          this.config.maxTokens,
          { cause: err }
        );
      }

      return new ProviderUnavailableError(
        PROVIDER_NAMES.GEMINI,
        err.message,
        { retryable: this.isRetryableStatus(status), statusCode: status ?? null, cause: err }
      );
    }

    if (err instanceof GoogleGenerativeAIAbortError) {
      // BaseProvider.normalizeError() handles AbortError → ProviderTimeoutError
      return this.normalizeError(err);
    }

    if (err instanceof GoogleGenerativeAIResponseError) {
      // Safety block, parse error, or empty response
      return new ProviderUnavailableError(
        PROVIDER_NAMES.GEMINI,
        `Model response error: ${err.message}`,
        { retryable: false, cause: err }
      );
    }

    // Delegate all other errors (network, AbortError, unknown) to BaseProvider
    return this.normalizeError(err);
  }

  /**
   * Asserts that the SDK response has at least one candidate with content.
   * Throws ProviderUnavailableError if the response was fully blocked.
   */
  private assertUsableResponse(
    response: Awaited<ReturnType<typeof this.model.generateContent>>['response']
  ): void {
    const candidates = response.candidates ?? [];

    if (candidates.length === 0) {
      const blockReason = response.promptFeedback?.blockReason;
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.GEMINI,
        blockReason
          ? `Prompt blocked by safety filters: ${blockReason}`
          : 'No candidates returned in response',
        { retryable: false }
      );
    }
  }

  /**
   * Attempts to extract a Retry-After value from the SDK error's errorDetails.
   * Gemini may include retry information in the error payload.
   * Returns null if not present or unparseable.
   */
  private extractRetryAfterMs(err: GoogleGenerativeAIFetchError): number | null {
    try {
      const details = err.errorDetails;
      if (!Array.isArray(details)) return null;

      for (const detail of details) {
        // Google API error details use '@type' to identify the message type
        if (
          detail != null &&
          typeof detail === 'object' &&
          typeof (detail as Record<string, unknown>)['retryDelay'] === 'string'
        ) {
          const delayStr = (detail as Record<string, unknown>)['retryDelay'] as string;
          // Delay is in format "Xs" (seconds)
          const seconds = parseFloat(delayStr.replace('s', ''));
          if (!isNaN(seconds)) {
            return Math.ceil(seconds * 1000);
          }
        }
      }
    } catch {
      // Parsing failed — return null and let the caller handle backoff
    }

    return null;
  }

  /**
   * Determines whether an HTTP status code warrants a retry.
   * 5xx are transient server errors; 4xx (except 429) are client errors.
   */
  private isRetryableStatus(status: number | undefined): boolean {
    if (status === undefined) return true;
    return status >= 500 && status < 600;
  }
}
