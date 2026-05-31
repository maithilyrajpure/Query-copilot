import type { ChatCompletion } from 'groq-sdk/resources/chat/completions';
import type { CompletionUsage } from 'groq-sdk/resources/completions';
import { PROVIDER_NAMES } from '../../../../common';
import type { ProviderResponse } from '../types';

// ---------------------------------------------------------------------------
// GroqAdapterInput
// ---------------------------------------------------------------------------

export interface GroqAdapterInput {
  /** The raw ChatCompletion from groq-sdk. */
  readonly completion: ChatCompletion;
  /** Wall-clock latency measured by the provider (start → response received). */
  readonly latencyMs: number;
  /**
   * Fallback token counts used when completion.usage is absent.
   * groq-sdk always includes usage on non-streaming responses, but we
   * defend against any future API change.
   */
  readonly fallbackPromptTokens: number;
  readonly fallbackCompletionTokens: number;
}

// ---------------------------------------------------------------------------
// adaptGroqCompletion
//
// Pure function — translates a groq-sdk ChatCompletion into the provider-
// agnostic ProviderResponse consumed by the pipeline.
//
// Groq's API is OpenAI-compatible, so the shape is reliable and well-known.
// Every field access still uses null-safe fallbacks for forward compatibility.
// ---------------------------------------------------------------------------

export function adaptGroqCompletion(input: GroqAdapterInput): ProviderResponse {
  const { completion, latencyMs, fallbackPromptTokens, fallbackCompletionTokens } = input;

  // ── Content extraction ──────────────────────────────────────────────────
  // Groq always returns exactly one choice when n is omitted (default n=1).
  const firstChoice = completion.choices[0];
  const content: string = firstChoice?.message?.content ?? '';

  // ── Token accounting ────────────────────────────────────────────────────
  const usage: CompletionUsage | undefined | null = completion.usage;

  const promptTokens: number = usage?.prompt_tokens ?? fallbackPromptTokens;
  const completionTokens: number = usage?.completion_tokens ?? fallbackCompletionTokens;
  const totalTokens: number = usage?.total_tokens ?? promptTokens + completionTokens;

  return {
    content,
    provider: PROVIDER_NAMES.GROQ,
    latencyMs,
    rawResponse: completion,
    tokensUsed: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedAt: new Date().toISOString(),
      // groq-sdk always populates usage on non-streaming responses
      isActual: usage != null,
    },
  };
}
