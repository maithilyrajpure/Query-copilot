/**
 * Typed error model for the MCP client.
 *
 * Mirrors the design of `server/services/providers/errors.ts`:
 *  - A base {@link McpError} all failures extend, so callers can catch broadly.
 *  - `retryable` drives retry/fallback decisions without `instanceof` ladders.
 *  - `statusCode` carries an upstream/HTTP-ish status when one is meaningful.
 *  - `cause` preserves the original error for stack traces and debug logging.
 *  - `Object.setPrototypeOf(this, new.target.prototype)` keeps the prototype
 *    chain correct across transpilation boundaries (ES5-target `instanceof`).
 *
 * @packageDocumentation
 */

import type { ToolName } from './types';

/**
 * Base class for every MCP client failure.
 *
 * Catch this to handle any MCP failure generically, or narrow to a subclass to
 * make retry/fallback decisions.
 */
export class McpError extends Error {
  /** Whether retrying the same operation might succeed. */
  public readonly retryable: boolean;
  /** Upstream/HTTP-ish status code when meaningful, else `null`. */
  public readonly statusCode: number | null;
  /** The original error that triggered this one, if any. */
  public readonly cause: unknown;

  constructor(
    message: string,
    options: {
      retryable?: boolean;
      statusCode?: number | null;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'McpError';
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode ?? null;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the MCP transport cannot reach the server (connection refused,
 * DNS failure, `fetch failed`, etc.). Always retryable — a transient network
 * condition may resolve on retry.
 */
export class McpConnectionError extends McpError {
  constructor(reason: string, options: { cause?: unknown } = {}) {
    super(`Failed to reach the MCP server: ${reason}`, {
      retryable: true,
      statusCode: 503,
      cause: options.cause,
    });
    this.name = 'McpConnectionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a tool call returns `isError: true`, or when the tool output
 * cannot be parsed into the expected shape. Not retryable — the same input
 * will produce the same failure.
 */
export class McpToolError extends McpError {
  /** The tool that failed. */
  public readonly tool: ToolName;

  constructor(tool: ToolName, reason: string, options: { cause?: unknown } = {}) {
    super(`MCP tool "${tool}" failed: ${reason}`, {
      retryable: false,
      statusCode: 422,
      cause: options.cause,
    });
    this.name = 'McpToolError';
    this.tool = tool;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an MCP request exceeds its timeout budget. Retryable — the
 * server may simply have been slow.
 */
export class McpTimeoutError extends McpError {
  /** The timeout budget (ms) that was exceeded, when known. */
  public readonly timeoutMs: number | null;

  constructor(reason: string, options: { timeoutMs?: number; cause?: unknown } = {}) {
    super(`MCP request timed out: ${reason}`, {
      retryable: true,
      statusCode: 504,
      cause: options.cause,
    });
    this.name = 'McpTimeoutError';
    this.timeoutMs = options.timeoutMs ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Type guard: `true` when `error` is an {@link McpError} or subclass. */
export function isMcpError(error: unknown): error is McpError {
  return error instanceof McpError;
}
