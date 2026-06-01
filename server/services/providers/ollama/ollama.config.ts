import { PROVIDER_DEFAULT_MODELS } from '../../../../common';

/**
 * Configuration contract for the Ollama provider instance.
 *
 * Ollama runs locally — no API key is required. The operator configures
 * the endpoint and model via kibana.yml under query_copilot.providers.ollama.
 *
 * All fields are required at the provider level — the config schema applies
 * defaults before constructing an OllamaProvider instance.
 */
export interface OllamaConfig {
  /**
   * Base URL of the Ollama server.
   * Default: "http://localhost:11434"
   * Must not have a trailing slash — paths are appended directly.
   */
  readonly endpoint: string;

  /**
   * Ollama model tag, e.g. "llama3", "llama3:8b", "mistral", "codellama".
   * Must match a model present in the Ollama instance (verified by isHealthy()).
   */
  readonly model: string;

  /**
   * Per-request timeout in milliseconds.
   * Ollama on CPU can be significantly slower than cloud APIs — default is
   * intentionally higher (120s) to accommodate cold starts and large models.
   */
  readonly timeoutMs: number;

  /**
   * Sampling temperature — 0.0 to 2.0.
   * Lower values produce more deterministic query generation outputs.
   */
  readonly temperature: number;

  /**
   * Maximum tokens to generate in the completion.
   * Maps to `num_predict` in the Ollama API options object.
   */
  readonly maxTokens: number;
}

/**
 * Production-safe defaults for local Ollama deployments.
 */
export const OLLAMA_DEFAULTS = {
  endpoint: 'http://localhost:11434',
  model: PROVIDER_DEFAULT_MODELS.ollama,
  timeoutMs: 120_000, // 2 min — CPU inference is slow
  temperature: 0.2,
  maxTokens: 4096,
} as const satisfies OllamaConfig;

/** Maximum retries for transient failures (connection reset, 5xx). */
export const OLLAMA_MAX_RETRIES = 1;

/** Base delay for exponential backoff. */
export const OLLAMA_RETRY_BASE_DELAY_MS = 1_000;

/** Timeout for the isHealthy() tags probe — shorter than generation timeout. */
export const OLLAMA_HEALTH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Ollama REST API path constants
// ---------------------------------------------------------------------------
export const OLLAMA_PATHS = {
  GENERATE: '/api/generate',
  TAGS: '/api/tags',
  SHOW: '/api/show',
} as const;
