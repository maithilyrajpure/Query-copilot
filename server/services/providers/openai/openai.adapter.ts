import type OpenAI from 'openai';
import type { ProviderResponse } from '../types';
import type { ProviderFinishReason } from '../../../../common/types';
import { PROVIDER_NAMES } from '../../../../common';

/**
 * OpenAIAdapter
 *
 * Translates OpenAI ChatCompletion responses into the server-side
 * ProviderResponse contract. Pure data transformation — no I/O.
 */
export class OpenAIAdapter {
  /**
   * Maps a ChatCompletion to ProviderResponse.
   *
   * @param completion  The ChatCompletion object from chat.completions.create().
   * @param latencyMs   Wall-clock time from request start to response received.
   */
  public adaptChatCompletion(
    completion: OpenAI.ChatCompletion,
    latencyMs: number
  ): ProviderResponse {
    const firstChoice = completion.choices[0];
    const content = firstChoice?.message?.content ?? '';
    const usage = completion.usage;
    const now = new Date().toISOString();

    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;

    return {
      provider: PROVIDER_NAMES.OPENAI,
      content,
      tokensUsed: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedAt: now,
        isActual: usage != null,
      },
      rawResponse: completion,
      latencyMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps OpenAI finish_reason to the normalised ProviderFinishReason union.
   *
   * OpenAI finish_reason values:
   *   'stop'           — natural completion or hit a stop sequence
   *   'length'         — hit max_tokens / max_completion_tokens limit
   *   'tool_calls'     — model requested tool calls
   *   'content_filter' — output blocked by content policy
   *   'function_call'  — deprecated, maps same as tool_calls
   *   null             — in-flight / unknown
   */
  public mapFinishReason(
    finishReason: OpenAI.ChatCompletion.Choice['finish_reason'] | null
  ): ProviderFinishReason {
    switch (finishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      case null:
      default:
        return 'unknown';
    }
  }
}
