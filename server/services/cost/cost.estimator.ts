import type { ProviderName } from '../../../common';
import type { TokenEstimate, CostEstimate } from '../../../common/types';
import { PROVIDER_NAMES } from '../../../common';
import type { ProviderTokenEstimate } from '../token/token.estimator';
import { PricingRegistry } from './pricing.registry';

// ---------------------------------------------------------------------------
// Internal arithmetic helpers
// ---------------------------------------------------------------------------

/**
 * Converts a token count and a per-million-token price to a USD cost.
 *
 * All intermediate math is done in micro-dollars (USD * 1e6) then rounded
 * to 6 decimal places at output to avoid floating-point drift accumulating
 * across large token counts.
 *
 * Example: 1000 tokens at $1.25/M → 1000 / 1_000_000 * 1.25 = $0.00125
 */
function computeCostUsd(tokens: number, pricePerMToken: number): number {
  if (tokens === 0 || pricePerMToken === 0) return 0;
  const raw = (tokens / 1_000_000) * pricePerMToken;
  // Round to 6 decimal places (sub-cent precision — sufficient for display
  // and downstream aggregation without introducing drift)
  return Math.round(raw * 1_000_000) / 1_000_000;
}

/**
 * Formats a USD cost value as a human-readable string.
 *
 * Rules:
 *  - Zero       → "$0.0000"
 *  - < $0.0001  → "$<0.0001" (sub-tenth-of-a-cent)
 *  - < $0.01    → 6 decimal places (e.g. "$0.000125")
 *  - < $1.00    → 4 decimal places (e.g. "$0.0021")
 *  - >= $1.00   → 2 decimal places (e.g. "$1.23")
 */
function formatCostUsd(usd: number): string {
  if (usd === 0) return '$0.0000';
  if (usd < 0.0001) return '$<0.0001';
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  if (usd < 1.0) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Zero-cost sentinel
// ---------------------------------------------------------------------------

function zeroCostEstimate(
  provider: ProviderName,
  model: string,
  rateCardVersion: string
): CostEstimate {
  const now = new Date().toISOString();
  return {
    provider,
    model,
    promptCostUsd: 0,
    completionCostUsd: 0,
    totalCostUsd: 0,
    currency: 'USD',
    rateCardVersion,
    estimatedAt: now,
    isActual: false,
  };
}

// ---------------------------------------------------------------------------
// CostEstimatorService
// ---------------------------------------------------------------------------

/**
 * CostEstimatorService
 *
 * Converts token counts into USD cost estimates using the PricingRegistry.
 *
 * Design:
 *  - Stateless after construction — safe to share across requests.
 *  - PricingRegistry is injected; default instance covers all built-in providers.
 *  - Never throws. Missing pricing → zero-cost estimate with `isActual: false`.
 *  - Accepts both ProviderTokenEstimate (server-side) and TokenEstimate
 *    (common/types — from actual provider API responses) via overloads.
 *  - `isActual` on the output mirrors whether token counts were from actual
 *    API responses (true) or pre-flight estimates (false).
 *
 * Rate card versioning:
 *  The registry version is a date string (YYYY-MM-DD) reflecting when the
 *  prices were last updated. This is included in CostEstimate.rateCardVersion
 *  so pipeline results can be audited against the pricing snapshot that was
 *  active at query time.
 */
export class CostEstimatorService {
  private readonly registry: PricingRegistry;

  /**
   * Rate card version — bumped when PRICING_TABLE is updated.
   * Format: YYYY-MM-DD of the most recent pricing update.
   */
  private static readonly RATE_CARD_VERSION = '2024-11-01';

  constructor(registry?: PricingRegistry) {
    this.registry = registry ?? new PricingRegistry();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Estimates cost from a common/types TokenEstimate (pipeline result envelope).
   *
   * This variant is used post-completion when actual token counts are available
   * from the provider's API response. `isActual` mirrors the input estimate's
   * isActual flag.
   *
   * @param tokenEstimate  The token counts (prompt + completion).
   * @param provider       The provider that processed the request.
   * @param model          The model name used (from ProviderMetadata or config).
   */
  public estimate(
    tokenEstimate: TokenEstimate,
    provider: ProviderName,
    model: string
  ): CostEstimate {
    return this.computeCost(
      tokenEstimate.promptTokens,
      tokenEstimate.completionTokens,
      provider,
      model,
      tokenEstimate.isActual
    );
  }

  /**
   * Estimates cost from a server-side ProviderTokenEstimate (pre-flight or
   * post-response estimates from TokenEstimatorService).
   *
   * `isActual` is always false for ProviderTokenEstimate — these are
   * estimations, never actuals from the API.
   *
   * @param tokenEstimate  The token estimate from TokenEstimatorService.
   * @param model          The model name to look up pricing for.
   */
  public estimateFromProviderEstimate(
    tokenEstimate: ProviderTokenEstimate,
    model: string
  ): CostEstimate {
    return this.computeCost(
      tokenEstimate.inputTokens,
      tokenEstimate.outputTokens,
      tokenEstimate.provider,
      model,
      false // ProviderTokenEstimate is always an estimate, never an actual
    );
  }

  /**
   * Estimates cost from raw token counts.
   *
   * Use when token counts are known directly (e.g. from provider usage metadata)
   * but a TokenEstimate wrapper has not been constructed yet.
   *
   * @param promptTokens      Input token count.
   * @param completionTokens  Output token count.
   * @param provider          Provider identifier.
   * @param model             Model identifier.
   * @param isActual          True when counts came from actual API usage metadata.
   */
  public estimateFromCounts(
    promptTokens: number,
    completionTokens: number,
    provider: ProviderName,
    model: string,
    isActual: boolean
  ): CostEstimate {
    return this.computeCost(promptTokens, completionTokens, provider, model, isActual);
  }

  /**
   * Returns the current rate card version string.
   * Exposed so route handlers can include it in API responses.
   */
  public getRateCardVersion(): string {
    return CostEstimatorService.RATE_CARD_VERSION;
  }

  /**
   * Returns the registry for inspection (e.g. health endpoint pricing dump).
   * Callers must not mutate the registry directly — use registry.register()
   * for runtime overrides.
   */
  public getRegistry(): PricingRegistry {
    return this.registry;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Core computation — isolated so all public overloads converge here.
   *
   * Computation steps:
   *  1. Look up pricing in the registry.
   *  2. If not found → return zero-cost estimate (logged concern for operators).
   *  3. Ollama wildcard returns zero-cost with isActual matching the input.
   *  4. Compute prompt and completion costs independently.
   *  5. Sum and format.
   */
  private computeCost(
    promptTokens: number,
    completionTokens: number,
    provider: ProviderName,
    model: string,
    isActual: boolean
  ): CostEstimate {
    const version = CostEstimatorService.RATE_CARD_VERSION;

    // Ollama is free — short-circuit without hitting the registry
    if (provider === PROVIDER_NAMES.OLLAMA) {
      return {
        ...zeroCostEstimate(provider, model, version),
        isActual,
      };
    }

    const pricing = this.registry.getPricing(provider, model);

    // No pricing data — return zero with isActual: false to flag the gap
    if (pricing === null) {
      return zeroCostEstimate(provider, model, version);
    }

    const promptCostUsd = computeCostUsd(promptTokens, pricing.inputPricePerMToken);
    const completionCostUsd = computeCostUsd(completionTokens, pricing.outputPricePerMToken);
    const totalCostUsd = Math.round((promptCostUsd + completionCostUsd) * 1_000_000) / 1_000_000;

    const now = new Date().toISOString();

    return {
      provider,
      model,
      promptCostUsd,
      completionCostUsd,
      totalCostUsd,
      currency: 'USD',
      rateCardVersion: version,
      estimatedAt: now,
      isActual,
    };
  }
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------
export { formatCostUsd };
