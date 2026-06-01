import { PipelineContext } from './pipeline.context';
import type { PipelineStageRecord } from './pipeline.context';

describe('PipelineContext', () => {
  describe('constructor', () => {
    it('initializes with the provided requestId and sensible defaults', () => {
      const ctx = new PipelineContext('req-1');

      expect(ctx.requestId).toBe('req-1');
      expect(typeof ctx.startTime).toBe('number');
      expect(ctx.stages).toEqual([]);
      expect(ctx.currentProvider).toBeNull();
      expect(ctx.cacheHit).toBe(false);
    });
  });

  describe('addStage', () => {
    it('accumulates stage records in the order they are added', () => {
      const ctx = new PipelineContext('req-1');

      const normalizeStage: PipelineStageRecord = {
        stage: 'normalize',
        durationMs: 3,
        success: true,
      };
      const intentStage: PipelineStageRecord = {
        stage: 'intent',
        durationMs: 5,
        success: true,
        metadata: { type: 'brute_force' },
      };

      ctx.addStage(normalizeStage);
      ctx.addStage(intentStage);

      expect(ctx.stages.length).toBe(2);
      expect(ctx.stages[0].stage).toBe('normalize');
      expect(ctx.stages[1].metadata?.type).toBe('brute_force');
    });
  });

  describe('getElapsedMs', () => {
    it('returns the number of milliseconds elapsed since startTime', () => {
      const ctx = new PipelineContext('r', Date.now() - 1000);

      const elapsed = ctx.getElapsedMs();

      expect(typeof elapsed).toBe('number');
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('mutable fields', () => {
    it('reflects updates to currentProvider and cacheHit', () => {
      const ctx = new PipelineContext('req-1');

      ctx.currentProvider = 'openai';
      ctx.cacheHit = true;

      expect(ctx.currentProvider).toBe('openai');
      expect(ctx.cacheHit).toBe(true);
    });
  });
});
