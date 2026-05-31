import { PROVIDER_DEFAULT_MODELS, PROVIDER_MAX_TOKENS } from '../../../../common';

/**
 * Configuration contract for the Gemini provider instance.
 *
 * Sourced from Kibana config (server/config.ts → providers.gemini) and
 * validated by ProviderConfigSchema before being passed here.
 * All fields are required at the provider level — the config schema applies
 * defaults before constructing a GeminiProvider instance.
 */
export interface GeminiConfig {
  /** Google AI Studio / Vertex AI API key. Never logged. */
  readonly apiKey: string;
  /** Gemini model identifier, e.g. "gemini-1.5-pro" */
  readonly model: string;
  /** Maximum completion tokens for generation requests. */
  readonly maxTokens: number;
  /** Per-request timeout in milliseconds. Enforced via BaseProvider.withTimeout(). */
  readonly timeoutMs: number;
  /**
   * Sampling temperature — 0.0 to 2.0.
   * Lower values produce more deterministic outputs.
   * Recommended: 0.0–0.2 for query generation.
   */
  readonly temperature: number;
}

/**
 * Production-safe defaults.
 * These are applied when the operator has not overridden a field in kibana.yml.
 * They mirror ProviderConfigSchema defaults in common/schemas/provider.schema.ts.
 */
export const GEMINI_DEFAULTS = {
  model: PROVIDER_DEFAULT_MODELS.gemini,
  maxTokens: PROVIDER_MAX_TOKENS.gemini,
  timeoutMs: 30_000,
  temperature: 0.2,
} as const satisfies Omit<GeminiConfig, 'apiKey'>;

/**
 * Safety settings applied to every generation request.
 * We use BLOCK_NONE across all categories because:
 *  1. Security queries legitimately reference harmful content (malware, exploits).
 *  2. Overly aggressive filtering produces empty responses for valid analyst queries.
 * Operators requiring stricter filtering can override this at the fleet level.
 */
export const GEMINI_SAFETY_SETTINGS = [
  {
    category: 'HARM_CATEGORY_HARASSMENT' as const,
    threshold: 'BLOCK_NONE' as const,
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH' as const,
    threshold: 'BLOCK_NONE' as const,
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT' as const,
    threshold: 'BLOCK_NONE' as const,
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT' as const,
    threshold: 'BLOCK_NONE' as const,
  },
] as const;

/** Maximum retries for transient (non-rate-limit) failures. */
export const GEMINI_MAX_RETRIES = 2;

/** Base delay for exponential backoff on retries. */
export const GEMINI_RETRY_BASE_DELAY_MS = 500;

/** Minimal prompt used by isHealthy() to verify connectivity without spending tokens. */
export const GEMINI_HEALTH_PROBE_TEXT = 'ping';
