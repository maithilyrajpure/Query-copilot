/**
 * Per-request pipeline execution context.
 *
 * As the query pipeline runs, this module's {@link PipelineContext} class
 * accumulates per-stage timing and telemetry (stage records, the currently
 * selected provider, cache-hit status, and elapsed time). It is a mutable,
 * runtime bookkeeping object — not a serializable request descriptor.
 *
 * Deliberate name divergence: `common/types/pipeline.types.ts` already exports
 * an interface also named `PipelineContext`, but that one is a request-context
 * descriptor (pipelineId, sessionId, analystQuery, selectedProvider, etc.).
 * This module intentionally defines its OWN `PipelineContext` *class* with the
 * timing/telemetry shape below. The two are unrelated; this file does not
 * import or reference the common interface, and consumers should import this
 * class from this module explicitly rather than relying on the common type.
 */

import type { ProviderName } from '../../../common/types';

/** A record of one executed pipeline stage. */
export interface PipelineStageRecord {
  readonly stage: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Mutable, per-request telemetry accumulator for a single pipeline execution.
 *
 * Tracks the stages that have run (in execution order), the provider currently
 * in use, whether the result was served from cache, and how much wall-clock
 * time has elapsed since the context was created.
 */
export class PipelineContext {
  /** Correlation id for the request this context tracks. */
  readonly requestId: string;
  /** Context creation time, in epoch milliseconds (`Date.now()`). */
  readonly startTime: number;
  /** Completed stage records, in the order they were appended. */
  readonly stages: PipelineStageRecord[];
  /** Provider currently selected for execution, or `null` if none yet. */
  currentProvider: ProviderName | null;
  /** Whether the result was served from cache. */
  cacheHit: boolean;

  /**
   * Creates a new pipeline context.
   *
   * @param requestId - Correlation id for the request being tracked.
   * @param startTime - Optional start time in epoch ms; defaults to `Date.now()`.
   */
  constructor(requestId: string, startTime?: number) {
    this.requestId = requestId;
    this.startTime = startTime ?? Date.now();
    this.stages = [];
    this.currentProvider = null;
    this.cacheHit = false;
  }

  /** Appends a completed stage record. */
  addStage(stage: PipelineStageRecord): void {
    this.stages.push(stage);
  }

  /** Milliseconds elapsed since {@link startTime}. */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }
}
