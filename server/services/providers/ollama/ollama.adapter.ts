import type { ProviderResponse } from '../types';
import { PROVIDER_NAMES } from '../../../../common';

// ---------------------------------------------------------------------------
// Ollama /api/generate wire types
//
// These are the raw JSON shapes returned by the Ollama REST API.
// Defined here rather than imported from an SDK — Ollama has no official
// Node SDK and the REST contract is stable and simple.
//
// Reference: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-completion
// ---------------------------------------------------------------------------

export interface OllamaGenerateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly stream: false; // always false — we never use streaming in this adapter
  readonly options: OllamaModelOptions;
  /** Suppresses Ollama's default system prompt when we supply our own via the prompt. */
  readonly system?: string;
}

export interface OllamaModelOptions {
  readonly temperature: number;
  readonly num_predict: number; // max tokens to generate
  readonly num_ctx?: number; // context window size
  readonly top_p?: number;
  readonly top_k?: number;
  readonly stop?: string[];
}

/**
 * Non-streaming response from /api/generate (stream: false).
 * All fields except `response` and `done` are absent on error.
 */
export interface OllamaGenerateResponse {
  readonly model: string;
  readonly created_at: string; // ISO 8601
  readonly response: string; // the generated text
  readonly done: boolean;
  // Token counts — present when done: true
  readonly prompt_eval_count?: number;
  readonly eval_count?: number; // completion tokens
  readonly eval_duration?: number; // nanoseconds
  readonly total_duration?: number; // nanoseconds
  readonly load_duration?: number; // nanoseconds
  readonly prompt_eval_duration?: number; // nanoseconds
  // Present on error
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Ollama /api/tags wire types
// ---------------------------------------------------------------------------

export interface OllamaTagsResponse {
  readonly models: readonly OllamaModelInfo[];
}

export interface OllamaModelInfo {
  readonly name: string; // e.g. "llama3:latest", "mistral:7b"
  readonly model: string; // canonical name
  readonly modified_at: string;
  readonly size: number;
  readonly digest: string;
}

// ---------------------------------------------------------------------------
// OllamaAdapter
// ---------------------------------------------------------------------------

/**
 * OllamaAdapter
 *
 * Translates Ollama /api/generate responses into the server-side
 * ProviderResponse contract. Pure data transformation — no I/O.
 */
export class OllamaAdapter {
  /**
   * Maps an OllamaGenerateResponse to ProviderResponse.
   *
   * @param raw       The parsed JSON body from /api/generate.
   * @param model     The model tag used in the request.
   * @param latencyMs Wall-clock time from request start to response parsed.
   */
  public adaptGenerateResponse(
    raw: OllamaGenerateResponse,
    model: string,
    latencyMs: number
  ): ProviderResponse {
    const promptTokens = raw.prompt_eval_count ?? 0;
    const completionTokens = raw.eval_count ?? 0;
    const totalTokens = promptTokens + completionTokens;
    const now = new Date().toISOString();

    return {
      provider: PROVIDER_NAMES.OLLAMA,
      content: raw.response,
      tokensUsed: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedAt: now,
        // Ollama reports actual token counts when done: true
        isActual: raw.done && (promptTokens > 0 || completionTokens > 0),
      },
      rawResponse: raw,
      latencyMs,
    };
  }

  /**
   * Determines whether a given model tag is present in the /api/tags response.
   *
   * Ollama model names are case-sensitive but may omit the ":latest" tag.
   * We normalise by appending ":latest" when no tag is present and check both forms.
   *
   * Examples:
   *   "llama3"         matches "llama3:latest"  ✓
   *   "llama3:8b"      matches "llama3:8b"      ✓
   *   "mistral"        matches "mistral:latest"  ✓
   */
  public isModelPresent(model: string, tags: OllamaTagsResponse): boolean {
    const normalizedTarget = this.normalizeModelName(model);

    return tags.models.some(
      (m) =>
        this.normalizeModelName(m.name) === normalizedTarget ||
        this.normalizeModelName(m.model) === normalizedTarget
    );
  }

  private normalizeModelName(name: string): string {
    return name.includes(':') ? name.toLowerCase() : `${name.toLowerCase()}:latest`;
  }
}
