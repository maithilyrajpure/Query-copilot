import type { ProviderName } from '../../../common';
import { PROVIDER_NAMES } from '../../../common';

// ---------------------------------------------------------------------------
// ProviderPricing
// ---------------------------------------------------------------------------

export interface ProviderPricing {
  /** Cost in USD per 1,000,000 input tokens. */
  readonly inputPricePerMToken: number;
  /** Cost in USD per 1,000,000 output tokens. */
  readonly outputPricePerMToken: number;
  /** Human-readable label for this rate card entry. */
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Internal registry key helpers
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic registry key for an exact provider+model match.
 * Model names are lowercased to handle casing differences across SDK versions.
 */
function exactKey(provider: ProviderName, model: string): string {
  return `${provider}/${model.toLowerCase()}`;
}

/**
 * Returns a wildcard key used when an exact model match is absent.
 * Used by providers like Ollama where all models share the same (zero) price.
 */
function wildcardKey(provider: ProviderName): string {
  return `${provider}/*`;
}

// ---------------------------------------------------------------------------
// PRICING_TABLE
//
// Prices are per 1,000,000 tokens (USD) as published by each provider.
// Ollama is self-hosted — input/output cost is $0.
//
// Sources (approximate, check provider dashboards for current rates):
//   Gemini  : https://ai.google.dev/pricing
//   Groq    : https://console.groq.com/settings/billing
//   OpenAI  : https://platform.openai.com/docs/pricing
//   Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
//
// The registry is intentionally a plain Record rather than a database so the
// plugin has zero external dependencies for pricing lookups. Operators who
// need dynamic pricing should extend PricingRegistry.register() at startup.
// ---------------------------------------------------------------------------

const PRICING_TABLE: ReadonlyArray<{
  provider: ProviderName;
  model: string; // exact model string or '*' for wildcard
  pricing: ProviderPricing;
}> = [
  // ── Gemini ───────────────────────────────────────────────────────────────
  {
    provider: PROVIDER_NAMES.GEMINI,
    model: 'gemini-2.0-flash',
    pricing: {
      inputPricePerMToken: 0.1,
      outputPricePerMToken: 0.4,
      label: 'Gemini 2.0 Flash',
    },
  },
  {
    provider: PROVIDER_NAMES.GEMINI,
    model: 'gemini-2.5-flash',
    pricing: {
      inputPricePerMToken: 0.3,
      outputPricePerMToken: 2.5,
      label: 'Gemini 2.5 Flash',
    },
  },
  {
    provider: PROVIDER_NAMES.GEMINI,
    model: 'gemini-1.5-pro',
    pricing: {
      inputPricePerMToken: 1.25,
      outputPricePerMToken: 5.0,
      label: 'Gemini 1.5 Pro',
    },
  },
  {
    provider: PROVIDER_NAMES.GEMINI,
    model: 'gemini-1.5-flash',
    pricing: {
      inputPricePerMToken: 0.075,
      outputPricePerMToken: 0.3,
      label: 'Gemini 1.5 Flash',
    },
  },
  {
    provider: PROVIDER_NAMES.GEMINI,
    model: 'gemini-1.0-pro',
    pricing: {
      inputPricePerMToken: 0.5,
      outputPricePerMToken: 1.5,
      label: 'Gemini 1.0 Pro',
    },
  },

  // ── Groq ─────────────────────────────────────────────────────────────────
  {
    provider: PROVIDER_NAMES.GROQ,
    model: 'llama3-70b-8192',
    pricing: {
      inputPricePerMToken: 0.59,
      outputPricePerMToken: 0.79,
      label: 'Groq Llama3 70B',
    },
  },
  {
    provider: PROVIDER_NAMES.GROQ,
    model: 'llama3-8b-8192',
    pricing: {
      inputPricePerMToken: 0.05,
      outputPricePerMToken: 0.08,
      label: 'Groq Llama3 8B',
    },
  },
  {
    provider: PROVIDER_NAMES.GROQ,
    model: 'llama-3.3-70b-versatile',
    pricing: {
      inputPricePerMToken: 0.59,
      outputPricePerMToken: 0.79,
      label: 'Groq Llama 3.3 70B Versatile',
    },
  },
  {
    provider: PROVIDER_NAMES.GROQ,
    model: 'llama-3.1-8b-instant',
    pricing: {
      inputPricePerMToken: 0.05,
      outputPricePerMToken: 0.08,
      label: 'Groq Llama 3.1 8B Instant',
    },
  },
  {
    provider: PROVIDER_NAMES.GROQ,
    model: 'mixtral-8x7b-32768',
    pricing: {
      inputPricePerMToken: 0.24,
      outputPricePerMToken: 0.24,
      label: 'Groq Mixtral 8x7B',
    },
  },

  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    provider: PROVIDER_NAMES.OPENAI,
    model: 'gpt-4o',
    pricing: {
      inputPricePerMToken: 2.5,
      outputPricePerMToken: 10.0,
      label: 'OpenAI GPT-4o',
    },
  },
  {
    provider: PROVIDER_NAMES.OPENAI,
    model: 'gpt-4o-mini',
    pricing: {
      inputPricePerMToken: 0.15,
      outputPricePerMToken: 0.6,
      label: 'OpenAI GPT-4o Mini',
    },
  },
  {
    provider: PROVIDER_NAMES.OPENAI,
    model: 'gpt-4-turbo',
    pricing: {
      inputPricePerMToken: 10.0,
      outputPricePerMToken: 30.0,
      label: 'OpenAI GPT-4 Turbo',
    },
  },
  {
    provider: PROVIDER_NAMES.OPENAI,
    model: 'gpt-3.5-turbo',
    pricing: {
      inputPricePerMToken: 0.5,
      outputPricePerMToken: 1.5,
      label: 'OpenAI GPT-3.5 Turbo',
    },
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    provider: PROVIDER_NAMES.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    pricing: {
      inputPricePerMToken: 3.0,
      outputPricePerMToken: 15.0,
      label: 'Anthropic Claude 3.5 Sonnet',
    },
  },
  {
    provider: PROVIDER_NAMES.ANTHROPIC,
    model: 'claude-3-5-haiku-20241022',
    pricing: {
      inputPricePerMToken: 0.8,
      outputPricePerMToken: 4.0,
      label: 'Anthropic Claude 3.5 Haiku',
    },
  },
  {
    provider: PROVIDER_NAMES.ANTHROPIC,
    model: 'claude-3-opus-20240229',
    pricing: {
      inputPricePerMToken: 15.0,
      outputPricePerMToken: 75.0,
      label: 'Anthropic Claude 3 Opus',
    },
  },
  {
    provider: PROVIDER_NAMES.ANTHROPIC,
    model: 'claude-3-sonnet-20240229',
    pricing: {
      inputPricePerMToken: 3.0,
      outputPricePerMToken: 15.0,
      label: 'Anthropic Claude 3 Sonnet',
    },
  },
  {
    provider: PROVIDER_NAMES.ANTHROPIC,
    model: 'claude-3-haiku-20240307',
    pricing: {
      inputPricePerMToken: 0.25,
      outputPricePerMToken: 1.25,
      label: 'Anthropic Claude 3 Haiku',
    },
  },

  // ── Ollama (self-hosted — zero cost) ──────────────────────────────────────
  {
    provider: PROVIDER_NAMES.OLLAMA,
    model: '*', // wildcard — all Ollama models are free
    pricing: {
      inputPricePerMToken: 0,
      outputPricePerMToken: 0,
      label: 'Ollama (self-hosted)',
    },
  },
];

// ---------------------------------------------------------------------------
// PricingRegistry
// ---------------------------------------------------------------------------

/**
 * PricingRegistry
 *
 * Holds per-provider, per-model token pricing.
 * Lookups fall back from exact model match → provider wildcard → null.
 *
 * Design rules:
 *  - Pure data store — no I/O, no network calls.
 *  - register() allows operators to override or extend pricing at startup.
 *  - lookup order: exact model key → wildcard key → null.
 *  - Model names are normalised to lowercase during registration and lookup
 *    so SDK version differences (e.g. "GPT-4o" vs "gpt-4o") are absorbed.
 *
 * Usage:
 *   const registry = new PricingRegistry();
 *   const pricing = registry.getPricing('gemini', 'gemini-1.5-pro');
 *   // { inputPricePerMToken: 1.25, outputPricePerMToken: 5.0, label: '...' }
 */
export class PricingRegistry {
  private readonly table = new Map<string, ProviderPricing>();

  constructor() {
    // Seed from the static pricing table at construction time
    for (const entry of PRICING_TABLE) {
      const key =
        entry.model === '*'
          ? wildcardKey(entry.provider)
          : exactKey(entry.provider, entry.model);
      this.table.set(key, entry.pricing);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Retrieves pricing for a provider+model combination.
   *
   * Lookup order:
   *  1. Exact match: `provider/model` (case-insensitive model)
   *  2. Wildcard:    `provider/*`
   *  3. null — no pricing data found
   *
   * Returns null rather than throwing — callers should handle missing pricing
   * gracefully (e.g. return a zero-cost estimate with a warning).
   */
  public getPricing(provider: ProviderName, model: string): ProviderPricing | null {
    // 1. Exact model match
    const exact = this.table.get(exactKey(provider, model));
    if (exact !== undefined) return exact;

    // 2. Provider wildcard (e.g. Ollama)
    const wildcard = this.table.get(wildcardKey(provider));
    if (wildcard !== undefined) return wildcard;

    // 3. Not found
    return null;
  }

  /**
   * Registers or overrides a pricing entry at runtime.
   *
   * Useful for:
   *  - Operator-supplied pricing from a remote config source
   *  - Testing with custom prices
   *  - Adding newly released models without a code deploy
   *
   * Pass model: '*' to set a provider-level wildcard (all models).
   */
  public register(provider: ProviderName, model: string, pricing: ProviderPricing): void {
    const key = model === '*' ? wildcardKey(provider) : exactKey(provider, model);
    this.table.set(key, pricing);
  }

  /**
   * Returns all registered pricing entries as a readonly snapshot.
   * Useful for health endpoints that surface rate card information.
   */
  public getAllPricing(): ReadonlyArray<{
    provider: ProviderName;
    model: string;
    pricing: ProviderPricing;
  }> {
    return Array.from(this.table.entries()).map(([key, pricing]) => {
      const slashIdx = key.indexOf('/');
      const provider = key.slice(0, slashIdx) as ProviderName;
      const model = key.slice(slashIdx + 1); // may be '*'
      return { provider, model, pricing };
    });
  }

  /**
   * Returns true if an exact or wildcard entry exists for the given provider+model.
   */
  public hasPricing(provider: ProviderName, model: string): boolean {
    return this.getPricing(provider, model) !== null;
  }
}
