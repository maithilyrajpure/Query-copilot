import { BaseProvider } from '../base.provider';
import type { ProviderPrompt, ProviderResponse, ProviderMetadata } from '../types';
import {
  ProviderUnavailableError,
  ProviderTimeoutError,
  ProviderAuthError,
  ProviderContextOverflowError,
} from '../errors';
import { PROVIDER_NAMES } from '../../../../common';
import { OllamaAdapter } from './ollama.adapter';
import type { OllamaGenerateResponse, OllamaTagsResponse } from './ollama.adapter';
import type { OllamaConfig } from './ollama.config';
import {
  OLLAMA_PATHS,
  OLLAMA_MAX_RETRIES,
  OLLAMA_RETRY_BASE_DELAY_MS,
  OLLAMA_HEALTH_TIMEOUT_MS,
} from './ollama.config';

/**
 * OllamaProvider
 *
 * Local LLM provider adapter using Ollama's REST API.
 * Extends BaseProvider for retry, timeout, and error normalisation.
 *
 * No SDK dependency — Ollama exposes a stable JSON REST API that is trivial
 * to call directly. This avoids version coupling to a third-party SDK that
 * may lag behind Ollama releases.
 *
 * All HTTP requests use Node.js 18+ built-in fetch.
 *
 * Lifecycle:
 *  1. complete()    — POST /api/generate with combined system+user prompt.
 *                     stream: false — we always wait for the full completion.
 *                     Wrapped in withTimeout() + retry().
 *  2. isHealthy()   — GET /api/tags, verifies 200 + configured model is listed.
 *                     Short timeout (OLLAMA_HEALTH_TIMEOUT_MS) — if Ollama is
 *                     unreachable the health check must fail fast.
 *  3. estimateTokens() — chars / 4 heuristic. Ollama uses SentencePiece
 *                     (model-dependent) — no universal tokeniser available
 *                     without loading the model. The heuristic is documented
 *                     and sufficient for context-window pre-flight checks.
 *
 * Error classification:
 *  - ECONNREFUSED / ENOTFOUND     → ProviderUnavailableError (retryable)
 *  - fetch AbortError             → ProviderTimeoutError (via withTimeout)
 *  - HTTP 401/403                 → ProviderAuthError (non-retryable)
 *                                   (Ollama can be put behind an auth proxy)
 *  - HTTP 400 with token message  → ProviderContextOverflowError
 *  - HTTP 5xx                     → ProviderUnavailableError (retryable)
 *  - Ollama error field in body   → ProviderUnavailableError with message
 *  - Everything else              → BaseProvider.normalizeError()
 */
export class OllamaProvider extends BaseProvider {
  private readonly config: OllamaConfig;
  private readonly adapter: OllamaAdapter;

  constructor(config: OllamaConfig) {
    super();
    this.config = config;
    this.adapter = new OllamaAdapter();
  }

  // ---------------------------------------------------------------------------
  // ILLMProvider — required implementations
  // ---------------------------------------------------------------------------

  public getMetadata(): ProviderMetadata {
    return {
      name: PROVIDER_NAMES.OLLAMA,
      role: 'local',
      priority: 3,
      maxTokens: this.config.maxTokens,
    };
  }

  /**
   * Sends a prompt to Ollama's /api/generate endpoint.
   *
   * Ollama does not support separate system/user message roles in /api/generate
   * (that's the /api/chat endpoint). We use /api/generate with the `system`
   * field for the system instruction and `prompt` for the user message.
   * This maps cleanly to what instruct-tuned models expect.
   */
  public async complete(prompt: ProviderPrompt): Promise<ProviderResponse> {
    return this.retry(
      () => this.executeGenerate(prompt),
      OLLAMA_MAX_RETRIES,
      OLLAMA_RETRY_BASE_DELAY_MS
    );
  }

  /**
   * Token estimator — chars / 4 heuristic.
   *
   * Ollama serves a variety of model families (Llama, Mistral, Gemma, etc.),
   * each with its own SentencePiece tokeniser. Loading the correct tokeniser
   * requires the model to be pulled, which is not viable at provider init time.
   * The chars/4 approximation is accurate to ±20% for English text and is
   * sufficient for context-window pre-flight guards.
   */
  public estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Health probe — GET /api/tags and verify the configured model is listed.
   *
   * This confirms two things:
   *  1. The Ollama process is running and reachable.
   *  2. The configured model has been pulled and is available for inference.
   *
   * Returns false on any failure rather than throwing — the router treats
   * a false health status as a reason to skip this provider, not an error.
   */
  public async isHealthy(): Promise<boolean> {
    try {
      const tags = await this.withTimeout(
        () => this.fetchTags(),
        OLLAMA_HEALTH_TIMEOUT_MS
      );
      return this.adapter.isModelPresent(this.config.model, tags);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — HTTP layer
  // ---------------------------------------------------------------------------

  /**
   * Core generation call — isolated so retry() wraps only the network I/O.
   */
  private async executeGenerate(prompt: ProviderPrompt): Promise<ProviderResponse> {
    const url = `${this.config.endpoint}${OLLAMA_PATHS.GENERATE}`;
    const startMs = Date.now();

    const requestBody = {
      model: this.config.model,
      system: prompt.systemPrompt,
      prompt: prompt.userMessage,
      stream: false as const,
      options: {
        temperature: prompt.temperature ?? this.config.temperature,
        num_predict: prompt.maxTokens ?? this.config.maxTokens,
      },
    };

    let response: Response;

    try {
      response = await this.withTimeout(
        () =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          }),
        this.config.timeoutMs
      );
    } catch (err) {
      // fetch throws on network-level failures (ECONNREFUSED, DNS, abort)
      // normalizeError() classifies these correctly
      throw this.classifyFetchError(err);
    }

    // Non-2xx HTTP status
    if (!response.ok) {
      throw await this.classifyHttpError(response);
    }

    let raw: OllamaGenerateResponse;
    try {
      raw = (await response.json()) as OllamaGenerateResponse;
    } catch (err) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        'Failed to parse /api/generate response as JSON',
        { retryable: false, cause: err }
      );
    }

    // Ollama surfaces model errors in the response body even with HTTP 200
    if (raw.error) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        `Ollama model error: ${raw.error}`,
        { retryable: this.isModelErrorRetryable(raw.error) }
      );
    }

    if (!raw.done) {
      // stream: false should always return done: true — if not, the response is truncated
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        'Received incomplete response (done: false) from /api/generate with stream: false',
        { retryable: true }
      );
    }

    if (raw.response.trim().length === 0) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        'Model returned empty response content',
        { retryable: false }
      );
    }

    const latencyMs = Date.now() - startMs;
    return this.adapter.adaptGenerateResponse(raw, this.config.model, latencyMs);
  }

  /**
   * Fetches /api/tags to enumerate available models.
   */
  private async fetchTags(): Promise<OllamaTagsResponse> {
    const url = `${this.config.endpoint}${OLLAMA_PATHS.TAGS}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        `GET /api/tags returned HTTP ${response.status}`,
        { retryable: false, statusCode: response.status }
      );
    }

    return (await response.json()) as OllamaTagsResponse;
  }

  // ---------------------------------------------------------------------------
  // Private — error classification
  // ---------------------------------------------------------------------------

  /**
   * Classifies fetch()-level exceptions (thrown before we get an HTTP response).
   * These are network-layer failures: ECONNREFUSED, DNS, AbortError, etc.
   */
  private classifyFetchError(err: unknown): Error {
    // AbortError from withTimeout() → already a ProviderTimeoutError
    if (err instanceof ProviderTimeoutError) return err;

    // Built-in fetch AbortError (from AbortController or our timeout race)
    if (err instanceof Error && err.name === 'AbortError') {
      return new ProviderTimeoutError(PROVIDER_NAMES.OLLAMA, this.config.timeoutMs, {
        cause: err,
      });
    }

    // Network errors — ECONNREFUSED is the most common (Ollama not running)
    if (err instanceof Error) {
      const errno = (err as Error & { cause?: { code?: string } }).cause?.code ?? '';
      const message = err.message.toLowerCase();

      if (
        errno === 'ECONNREFUSED' ||
        errno === 'ENOTFOUND' ||
        errno === 'ECONNRESET' ||
        message.includes('econnrefused') ||
        message.includes('connection refused') ||
        message.includes('failed to fetch') ||
        message.includes('network error')
      ) {
        return new ProviderUnavailableError(
          PROVIDER_NAMES.OLLAMA,
          `Cannot reach Ollama at ${this.config.endpoint} — is it running? (${err.message})`,
          { retryable: true, cause: err }
        );
      }
    }

    return this.normalizeError(err);
  }

  /**
   * Classifies HTTP error responses (4xx/5xx) into typed ProviderErrors.
   * Reads the response body for a descriptive error message where possible.
   */
  private async classifyHttpError(response: Response): Promise<Error> {
    const status = response.status;

    // Attempt to extract an error message from the body
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      // Body read failed — use status text
      bodyText = response.statusText;
    }

    if (status === 401 || status === 403) {
      // Ollama may be behind an auth proxy
      return new ProviderAuthError(PROVIDER_NAMES.OLLAMA, {
        cause: new Error(`HTTP ${status}: ${bodyText}`),
      });
    }

    if (status === 400) {
      const lower = bodyText.toLowerCase();
      if (lower.includes('context') || lower.includes('token') || lower.includes('length')) {
        return new ProviderContextOverflowError(
          PROVIDER_NAMES.OLLAMA,
          0, // exact count unavailable
          this.config.maxTokens,
          { cause: new Error(bodyText) }
        );
      }
      return new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        `Bad request: ${bodyText}`,
        { retryable: false, statusCode: 400 }
      );
    }

    if (status === 404) {
      // Model not found — operator configured a model that hasn't been pulled
      return new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        `Model "${this.config.model}" not found. Run: ollama pull ${this.config.model}`,
        { retryable: false, statusCode: 404 }
      );
    }

    if (status >= 500) {
      return new ProviderUnavailableError(
        PROVIDER_NAMES.OLLAMA,
        `Ollama server error ${status}: ${bodyText}`,
        { retryable: true, statusCode: status }
      );
    }

    return new ProviderUnavailableError(
      PROVIDER_NAMES.OLLAMA,
      `Unexpected HTTP ${status}: ${bodyText}`,
      { retryable: false, statusCode: status }
    );
  }

  /**
   * Determines whether an Ollama model error body warrants a retry.
   * Most model errors are non-retryable (wrong model, bad prompt format).
   * Out-of-memory or loading errors are transient and can be retried.
   */
  private isModelErrorRetryable(errorMessage: string): boolean {
    const lower = errorMessage.toLowerCase();
    return (
      lower.includes('loading') ||
      lower.includes('out of memory') ||
      lower.includes('oom') ||
      lower.includes('try again')
    );
  }
}
