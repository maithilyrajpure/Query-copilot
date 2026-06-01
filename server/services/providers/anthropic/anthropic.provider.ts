import Anthropic, {
  APIConnectionTimeoutError,
  APIConnectionError,
  AuthenticationError,
  RateLimitError,
  InternalServerError,
  PermissionDeniedError,
  BadRequestError,
  APIError,
  APIUserAbortError,
} from '@anthropic-ai/sdk';
import { BaseProvider } from '../base.provider';
import type { ProviderPrompt, ProviderResponse, ProviderMetadata } from '../types';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderAuthError,
  ProviderTimeoutError,
  ProviderContextOverflowError,
  ProviderUnavailableError,
} from '../errors';
import { PROVIDER_NAMES } from '../../../../common';
import { AnthropicAdapter } from './anthropic.adapter';
import type { AnthropicConfig } from './anthropic.config';
import {
  ANTHROPIC_MAX_RETRIES,
  ANTHROPIC_RETRY_BASE_DELAY_MS,
} from './anthropic.config';

/**
 * AnthropicProvider
 *
 * Fallback provider adapter for Anthropic Claude models (priority 4).
 * Extends BaseProvider for retry, timeout, and error normalisation.
 *
 * Uses the official @anthropic-ai/sdk. SDK-level retries are disabled —
 * BaseProvider.retry() owns all retry logic.
 *
 * API contract:
 *  - System prompt → `system` parameter on messages.create()
 *  - User message  → single `{ role: 'user', content }` in `messages` array
 *  - No streaming  — stream: false equivalent (we don't pass stream at all)
 *
 * Health check:
 *  messages.create() with max_tokens: 1 on a minimal prompt.
 *  countTokens() would be cheaper but is a beta API with limited availability.
 *  A 1-token completion validates the API key and model availability at
 *  minimal cost (~0.001 cents per check).
 *
 * Error classification:
 *  - 429 / RateLimitError         → ProviderRateLimitError  (aborts retry)
 *  - 401 / AuthenticationError    → ProviderAuthError       (aborts retry)
 *  - 403 / PermissionDeniedError  → ProviderAuthError       (aborts retry)
 *  - 400 / BadRequestError        → ProviderContextOverflowError if token-related
 *                                   else non-retryable ProviderError
 *  - 5xx / InternalServerError    → ProviderUnavailableError (retryable)
 *  - APIConnectionTimeoutError    → ProviderTimeoutError     (retryable)
 *  - APIConnectionError           → ProviderUnavailableError (retryable)
 *  - APIUserAbortError            → ProviderTimeoutError     (from withTimeout)
 */
export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;
  private readonly adapter: AnthropicAdapter;
  private readonly config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    super();
    this.config = config;
    this.adapter = new AnthropicAdapter();

    // Disable SDK retries — BaseProvider.retry() owns that logic.
    // Pass timeout to the SDK layer as a belt-and-suspenders guard alongside
    // our withTimeout() wrapper.
    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
      defaultHeaders: {
        'anthropic-version': config.anthropicVersion,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // ILLMProvider
  // ---------------------------------------------------------------------------

  public getMetadata(): ProviderMetadata {
    return {
      name: PROVIDER_NAMES.ANTHROPIC,
      role: 'fallback',
      priority: 4,
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Sends a prompt to Claude and returns a normalised ProviderResponse.
   */
  public async complete(prompt: ProviderPrompt): Promise<ProviderResponse> {
    return this.retry(
      () => this.executeComplete(prompt),
      ANTHROPIC_MAX_RETRIES,
      ANTHROPIC_RETRY_BASE_DELAY_MS
    );
  }

  /**
   * Synchronous token estimator.
   *
   * Anthropic uses a BPE tokeniser similar to GPT — chars/4 is a reasonable
   * approximation for English text. The SDK exposes client.messages.countTokens()
   * but it requires a network call and is async; we use the heuristic here to
   * satisfy the synchronous ILLMProvider contract.
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Health check: issues a minimal 1-token completion to validate the API key
   * and model availability. Returns false on any error without throwing.
   */
  public async isHealthy(): Promise<boolean> {
    try {
      await this.withTimeout(
        () =>
          this.client.messages.create({
            model: this.config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        Math.min(this.config.timeoutMs, 10_000)
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async executeComplete(prompt: ProviderPrompt): Promise<ProviderResponse> {
    const startMs = Date.now();

    let message: Anthropic.Message;

    try {
      message = await this.withTimeout(
        () =>
          this.client.messages.create({
            model: this.config.model,
            max_tokens: prompt.maxTokens ?? this.config.maxTokens,
            temperature: prompt.temperature ?? this.config.temperature,
            system: prompt.systemPrompt,
            messages: [{ role: 'user', content: prompt.userMessage }],
          }),
        this.config.timeoutMs
      );
    } catch (err) {
      throw this.classifyError(err);
    }

    const latencyMs = Date.now() - startMs;
    const response = this.adapter.adaptMessage(message, latencyMs);

    if (response.content.trim().length === 0) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.ANTHROPIC,
        `Model returned empty content (stop_reason: ${message.stop_reason ?? 'unknown'})`,
        { retryable: message.stop_reason !== 'refusal' }
      );
    }

    return response;
  }

  /**
   * Classifies Anthropic SDK exceptions into typed ProviderErrors.
   */
  private classifyError(err: unknown): ProviderError {
    // Already typed — pass through
    if (err instanceof ProviderError) return err;

    // SDK abort — from withTimeout() or an external AbortController
    if (err instanceof APIUserAbortError) {
      return new ProviderTimeoutError(PROVIDER_NAMES.ANTHROPIC, this.config.timeoutMs, {
        cause: err,
      });
    }

    // Network-level connection timeout (SDK-side)
    if (err instanceof APIConnectionTimeoutError) {
      return new ProviderTimeoutError(PROVIDER_NAMES.ANTHROPIC, this.config.timeoutMs, {
        cause: err,
      });
    }

    // Network-level connection failure (DNS, ECONNREFUSED, etc.)
    if (err instanceof APIConnectionError) {
      return new ProviderUnavailableError(
        PROVIDER_NAMES.ANTHROPIC,
        err.message,
        { retryable: true, cause: err }
      );
    }

    // HTTP API errors — all extend APIError and carry a .status field
    if (err instanceof APIError) {
      const status = err.status;

      if (err instanceof RateLimitError) {
        const retryAfterMs = this.extractRetryAfterMs(err);
        return new ProviderRateLimitError(PROVIDER_NAMES.ANTHROPIC, {
          retryAfterMs,
          cause: err,
        });
      }

      if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
        return new ProviderAuthError(PROVIDER_NAMES.ANTHROPIC, { cause: err });
      }

      if (err instanceof BadRequestError) {
        const msg = err.message.toLowerCase();
        if (msg.includes('token') || msg.includes('context') || msg.includes('length')) {
          return new ProviderContextOverflowError(
            PROVIDER_NAMES.ANTHROPIC,
            0,
            this.config.maxTokens,
            { cause: err }
          );
        }
        return new ProviderError(
          `Anthropic bad request: ${err.message}`,
          PROVIDER_NAMES.ANTHROPIC,
          { retryable: false, statusCode: 400, cause: err }
        );
      }

      if (err instanceof InternalServerError) {
        return new ProviderUnavailableError(
          PROVIDER_NAMES.ANTHROPIC,
          err.message,
          { retryable: true, statusCode: status ?? 500, cause: err }
        );
      }

      // Any remaining APIError — delegate to BaseProvider mapping
      return this.normalizeError(err);
    }

    return this.normalizeError(err);
  }

  /**
   * Attempts to parse a Retry-After value from the error headers.
   * Anthropic includes `retry-after` (seconds) on 429 responses.
   */
  private extractRetryAfterMs(err: APIError): number | null {
    try {
      const headers = err.headers as Record<string, string> | undefined;
      if (!headers) return null;

      const retryAfter =
        headers['retry-after'] ?? headers['Retry-After'] ?? headers['x-ratelimit-reset-after'];

      if (retryAfter === undefined) return null;

      // Can be seconds (number string) or an HTTP date
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) return Math.ceil(seconds * 1000);

      const date = new Date(retryAfter).getTime();
      if (!isNaN(date)) return Math.max(0, date - Date.now());
    } catch {
      // Parsing failed — caller handles backoff
    }
    return null;
  }
}
