import type { Logger } from '@kbn/core/server';
import type { ProviderName } from '../../../common';

// ---------------------------------------------------------------------------
// Structured log entry shapes
// These are the canonical shapes written to the Kibana log stream.
// All entries share the base fields; each method adds its own payload.
// ---------------------------------------------------------------------------

interface BaseLogEntry {
  readonly timestamp: string;       // ISO 8601
  readonly requestId: string;
  readonly component: string;
}

interface RequestLogEntry extends BaseLogEntry {
  readonly method: string;
  readonly path: string;
}

interface PipelineStageLogEntry extends BaseLogEntry {
  readonly stage: string;
  readonly durationMs: number;
  readonly metadata: Record<string, unknown>;
}

interface ProviderCallLogEntry extends BaseLogEntry {
  readonly provider: ProviderName;
  readonly durationMs: number;
  readonly tokens: number;
  readonly success: boolean;
}

interface ErrorLogEntry extends BaseLogEntry {
  readonly errorName: string;
  readonly errorMessage: string;
  readonly context: Record<string, unknown>;
  // stack intentionally omitted from structured payload — logged separately
  // at debug level so it doesn't pollute info-level log streams
}

interface CacheEventLogEntry extends BaseLogEntry {
  readonly hit: boolean;
  // key is hashed before logging — raw cache keys can contain query fragments
  readonly keyHash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(): string {
  return new Date().toISOString();
}

/**
 * Produces a stable, short hash of a string for safe log inclusion.
 * Not cryptographic — purely for correlation without leaking content.
 */
function hashKey(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Scrubs any field whose name contains 'key', 'secret', 'token', or 'password'
 * from a metadata object before it reaches the log stream.
 */
function scrubSecrets(metadata: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = /key|secret|token|password|apikey|api_key/i;
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [k, SENSITIVE.test(k) ? '[REDACTED]' : v])
  );
}

// ---------------------------------------------------------------------------
// LoggerService
// ---------------------------------------------------------------------------

/**
 * Structured logger wrapper around Kibana's Logger.
 *
 * Guarantees:
 *  - Every entry includes timestamp, requestId, component, level.
 *  - Raw prompts, query strings, and API keys are never logged.
 *  - Cache keys are hashed before log inclusion.
 *  - Metadata objects are scrubbed for sensitive field names.
 *  - Error stacks are logged at debug level only, separate from the
 *    structured error entry at error/warn level.
 */
export class LoggerService {
  private readonly logger: Logger;
  private static readonly COMPONENT = 'queryCopilot';

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Log an inbound HTTP request at the plugin boundary.
   * Called once per request, before pipeline execution begins.
   */
  public logRequest(requestId: string, method: string, path: string): void {
    const entry: RequestLogEntry = {
      timestamp: iso(),
      requestId,
      component: LoggerService.COMPONENT,
      method: method.toUpperCase(),
      path,
    };
    this.logger.info(`[${requestId}] ${entry.method} ${entry.path}`, entry);
  }

  /**
   * Log a pipeline stage transition with its duration.
   * metadata is scrubbed — safe to pass arbitrary stage context.
   * Do NOT include prompt text, query strings, or LLM response content.
   */
  public logPipelineStage(
    requestId: string,
    stage: string,
    durationMs: number,
    metadata: Record<string, unknown> = {}
  ): void {
    const entry: PipelineStageLogEntry = {
      timestamp: iso(),
      requestId,
      component: LoggerService.COMPONENT,
      stage,
      durationMs,
      metadata: scrubSecrets(metadata),
    };
    this.logger.info(`[${requestId}] stage=${stage} duration=${durationMs}ms`, entry);
  }

  /**
   * Log a completed LLM provider call.
   * tokens is the total token count (prompt + completion) — not the content.
   * Provider name is safe to log; model name is included via metadata if needed.
   */
  public logProviderCall(
    requestId: string,
    provider: ProviderName,
    durationMs: number,
    tokens: number,
    success: boolean
  ): void {
    const entry: ProviderCallLogEntry = {
      timestamp: iso(),
      requestId,
      component: LoggerService.COMPONENT,
      provider,
      durationMs,
      tokens,
      success,
    };

    if (success) {
      this.logger.info(
        `[${requestId}] provider=${provider} tokens=${tokens} duration=${durationMs}ms ok`,
        entry
      );
    } else {
      this.logger.warn(
        `[${requestId}] provider=${provider} duration=${durationMs}ms failed`,
        entry
      );
    }
  }

  /**
   * Log an error with structured context.
   * The error stack is emitted separately at debug level to avoid polluting
   * warn/error streams while remaining accessible for deep debugging.
   * context is scrubbed before logging.
   */
  public logError(
    requestId: string,
    error: unknown,
    context: Record<string, unknown> = {}
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));

    const entry: ErrorLogEntry = {
      timestamp: iso(),
      requestId,
      component: LoggerService.COMPONENT,
      errorName: err.name,
      errorMessage: err.message,
      context: scrubSecrets(context),
    };

    this.logger.error(`[${requestId}] ${err.name}: ${err.message}`, entry);

    // Stack at debug — structured data at error
    if (err.stack) {
      this.logger.debug(`[${requestId}] stack: ${err.stack}`);
    }
  }

  /**
   * Log a cache hit or miss.
   * The raw key is hashed — it may contain analyst query fragments.
   */
  public logCacheEvent(requestId: string, hit: boolean, key: string): void {
    const entry: CacheEventLogEntry = {
      timestamp: iso(),
      requestId,
      component: LoggerService.COMPONENT,
      hit,
      keyHash: hashKey(key),
    };

    this.logger.debug(
      `[${requestId}] cache ${hit ? 'HIT' : 'MISS'} keyHash=${entry.keyHash}`,
      entry
    );
  }
}
