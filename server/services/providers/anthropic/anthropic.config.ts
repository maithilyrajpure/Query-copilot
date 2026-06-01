import { PROVIDER_DEFAULT_MODELS, PROVIDER_MAX_TOKENS } from '../../../../common';

/**
 * Configuration contract for the Anthropic provider instance.
 * Sourced from Kibana config (server/config.ts → providers.anthropic).
 */
export interface AnthropicConfig {
  /** Anthropic API key — never logged. */
  readonly apiKey: string;
  /** Model identifier, e.g. "claude-3-5-sonnet-20241022". */
  readonly model: string;
  /** Maximum completion tokens for generation requests. */
  readonly maxTokens: number;
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs: number;
  /**
   * Sampling temperature — 0.0 to 1.0.
   * Anthropic clamps above 1.0; 0.0–0.2 recommended for query generation.
   */
  readonly temperature: number;
  /**
   * Anthropic API version header sent with every request.
   * SDK default: "2023-06-01" — override only for beta features.
   */
  readonly anthropicVersion: string;
}

export const ANTHROPIC_DEFAULTS = {
  model: PROVIDER_DEFAULT_MODELS.anthropic,
  maxTokens: PROVIDER_MAX_TOKENS.anthropic,
  timeoutMs: 60_000,
  temperature: 0.2,
  anthropicVersion: '2023-06-01',
} as const satisfies Omit<AnthropicConfig, 'apiKey'>;

/** Maximum retries for transient non-rate-limit errors. */
export const ANTHROPIC_MAX_RETRIES = 2;
export const ANTHROPIC_RETRY_BASE_DELAY_MS = 500;
