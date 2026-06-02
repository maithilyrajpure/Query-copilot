import type { ProviderName, ProviderStatus } from '../../../common/types';

/** Human-readable display names for each known LLM provider. */
const PROVIDER_DISPLAY_NAMES: Record<ProviderName, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

/** Maps a {@link ProviderName} to its human-readable display name. */
export function providerDisplayName(name: ProviderName): string {
  return PROVIDER_DISPLAY_NAMES[name];
}

/**
 * Picks the "primary" provider from the configured list: prefer an enabled
 * provider whose role is `primary`, else the first enabled provider, else the
 * first provider. Returns `undefined` when the list is empty.
 */
export function selectPrimaryProvider(
  providers: readonly ProviderStatus[]
): ProviderStatus | undefined {
  return (
    providers.find((p) => p.role === 'primary' && p.enabled) ??
    providers.find((p) => p.enabled) ??
    providers[0]
  );
}
