/**
 * GroqConfig
 *
 * Runtime configuration for the Groq provider adapter.
 * Constructed in GroqProvider from ConfigService values.
 */
export interface GroqConfig {
  /** Groq API key. Never log or expose this value. */
  readonly apiKey: string;
  /**
   * Model identifier passed to chat.completions.create().
   * Examples: 'llama3-70b-8192', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'
   */
  readonly model: string;
  /**
   * Token ceiling for generated completions (max_tokens in the request body).
   */
  readonly maxTokens: number;
  /**
   * Per-request timeout in milliseconds.
   * Passed to the Groq SDK ClientOptions.timeout so the SDK enforces it
   * at the HTTP layer, then also wrapped in BaseProvider.withTimeout() as
   * a belt-and-suspenders guarantee.
   */
  readonly timeoutMs: number;
  /**
   * Sampling temperature.
   * Range 0.0–2.0. Groq supports the full OpenAI-compatible range.
   * Recommended: 0.2 for deterministic query generation.
   */
  readonly temperature: number;
}
