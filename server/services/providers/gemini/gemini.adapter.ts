import type {
  EnhancedGenerateContentResponse,
  GenerateContentCandidate,
} from '@google/generative-ai';
import type { ProviderResponse } from '../types';
import type { ProviderFinishReason } from '../../../../common/types';
import { PROVIDER_NAMES } from '../../../../common';

/**
 * GeminiAdapter
 *
 * Responsibility: translate Gemini SDK response objects into the
 * normalised ProviderResponse contract consumed by the pipeline.
 *
 * Design rules:
 *  - No business logic — pure data transformation.
 *  - All fields explicitly mapped — no spread of unknown SDK shapes.
 *  - Graceful fallbacks for every optional SDK field.
 *  - Token counts fall back to 0 when absent (e.g. cached responses).
 *
 * Note on ProviderResponse contract:
 *  The server-side ProviderResponse (server/services/providers/types.ts) uses
 *  `tokensUsed: TokenEstimate` and `rawResponse: unknown`.
 *  This adapter targets that contract, not common/types/provider.types.ts.
 */
export class GeminiAdapter {
  /**
   * Maps a GenerateContentResult to the server-side ProviderResponse.
   *
   * @param sdkResponse  The EnhancedGenerateContentResponse from the SDK.
   * @param model        The model string used in the request (e.g. "gemini-2.0-flash").
   * @param latencyMs    Wall-clock time from request dispatch to response receipt.
   * @param raw          The original SDK result — preserved for observability.
   */
  public adaptGenerateContentResponse(
    sdkResponse: EnhancedGenerateContentResponse,
    model: string,
    latencyMs: number,
    raw: unknown
  ): ProviderResponse {
    const text = this.extractText(sdkResponse);
    const usage = this.extractUsage(sdkResponse);
    const now = new Date().toISOString();

    return {
      provider: PROVIDER_NAMES.GEMINI,
      content: text,
      tokensUsed: {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        estimatedAt: now,
        isActual: true,
      },
      rawResponse: raw,
      latencyMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Private extraction helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the text content from the first candidate.
   * Uses the SDK's `.text()` helper which assembles all TextPart fragments.
   * Returns empty string if the response was blocked or has no text content.
   */
  private extractText(response: EnhancedGenerateContentResponse): string {
    try {
      return response.text();
    } catch {
      // response.text() throws if the prompt/candidate was blocked by safety filters.
      // Return empty string — the caller (GeminiProvider) validates non-empty content.
      return '';
    }
  }

  /**
   * Maps Gemini FinishReason to the normalised ProviderFinishReason union.
   * Gemini reasons not in the common contract are collapsed to 'unknown'.
   */
  public mapFinishReason(
    candidate: GenerateContentCandidate | undefined
  ): ProviderFinishReason {
    if (candidate?.finishReason === undefined) {
      return 'unknown';
    }

    const reasonMap: Record<string, ProviderFinishReason> = {
      STOP: 'stop',
      MAX_TOKENS: 'length',
      SAFETY: 'content_filter',
      RECITATION: 'content_filter',
      LANGUAGE: 'content_filter',
      BLOCKLIST: 'content_filter',
      PROHIBITED_CONTENT: 'content_filter',
      SPII: 'content_filter',
      OTHER: 'unknown',
      MALFORMED_FUNCTION_CALL: 'error',
      FINISH_REASON_UNSPECIFIED: 'unknown',
    };

    const key = candidate.finishReason as string;
    return reasonMap[key] ?? 'unknown';
  }

  /**
   * Extracts token usage from UsageMetadata.
   * Falls back to zeros when metadata is absent (e.g. error responses).
   */
  private extractUsage(response: EnhancedGenerateContentResponse): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const meta = response.usageMetadata;

    if (meta === undefined) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const promptTokens = meta.promptTokenCount ?? 0;
    const completionTokens = meta.candidatesTokenCount ?? 0;
    const totalTokens = meta.totalTokenCount ?? promptTokens + completionTokens;

    return { promptTokens, completionTokens, totalTokens };
  }
}
