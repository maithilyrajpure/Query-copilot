import type Anthropic from '@anthropic-ai/sdk';
import type { ProviderResponse } from '../types';
import type { ProviderFinishReason } from '../../../../common/types';
import { PROVIDER_NAMES } from '../../../../common';

/**
 * AnthropicAdapter
 *
 * Translates Anthropic SDK Message responses into the server-side
 * ProviderResponse contract. Pure data transformation — no I/O.
 */
export class AnthropicAdapter {
  /**
   * Maps an Anthropic Message to ProviderResponse.
   *
   * @param message   The Message object from client.messages.create().
   * @param latencyMs Wall-clock time from request start to response received.
   */
  public adaptMessage(
    message: Anthropic.Message,
    latencyMs: number
  ): ProviderResponse {
    const content = this.extractText(message);
    const now = new Date().toISOString();

    return {
      provider: PROVIDER_NAMES.ANTHROPIC,
      content,
      tokensUsed: {
        promptTokens: message.usage.input_tokens,
        completionTokens: message.usage.output_tokens,
        totalTokens: message.usage.input_tokens + message.usage.output_tokens,
        estimatedAt: now,
        isActual: true,
      },
      rawResponse: message,
      latencyMs,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts plain text from the content block array.
   *
   * Claude returns content as an array of typed blocks (TextBlock, ToolUseBlock, etc.).
   * We concatenate all TextBlock values in order. Non-text blocks are ignored —
   * the pipeline does not use tool calls.
   */
  private extractText(message: Anthropic.Message): string {
    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  /**
   * Maps Anthropic StopReason to the normalised ProviderFinishReason union.
   *
   * Anthropic StopReason values:
   *   'end_turn'       — natural completion
   *   'max_tokens'     — hit the token limit
   *   'stop_sequence'  — hit a custom stop string
   *   'tool_use'       — model requested a tool call
   *   'pause_turn'     — multi-turn pause (extended thinking)
   *   'refusal'        — model refused the request
   *   null             — unknown / in-progress
   */
  public mapStopReason(
    stopReason: Anthropic.Message['stop_reason']
  ): ProviderFinishReason {
    switch (stopReason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'refusal':
        return 'content_filter';
      case 'pause_turn':
      case null:
      default:
        return 'unknown';
    }
  }
}
