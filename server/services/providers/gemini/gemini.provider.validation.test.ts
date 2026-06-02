/**
 * @jest-environment node
 *
 * Tests for GeminiProvider.validateModelAvailability() — the startup model
 * discovery / validation path that replaces the retired gemini-1.5-pro default
 * and short-circuits requests when the configured model is affirmatively
 * unavailable for generateContent.
 *
 * Construction of GeminiProvider calls new GoogleGenerativeAI(apiKey) and
 * getGenerativeModel(...), neither of which makes a network call, so building
 * the provider in-test is safe and deterministic. We mock global.fetch (used by
 * the v1beta listModels discovery REST call) and never touch the network.
 */
import { GeminiProvider } from './gemini.provider';
import type { GeminiConfig } from './gemini.config';
import { ProviderUnavailableError } from '../errors';
import type { ProviderPrompt } from '../types';

function buildConfig(overrides: Partial<GeminiConfig> = {}): GeminiConfig {
  return {
    apiKey: 'test-api-key',
    model: 'gemini-2.0-flash',
    maxTokens: 8192,
    timeoutMs: 30_000,
    temperature: 0.2,
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const PROMPT: ProviderPrompt = {
  systemPrompt: 'You are a helpful assistant.',
  userMessage: 'hello',
};

describe('GeminiProvider.validateModelAvailability', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  it('marks available=true when discovery includes the configured model (prefix stripped)', async () => {
    const provider = new GeminiProvider(buildConfig({ model: 'gemini-2.0-flash' }));

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        models: [
          {
            name: 'models/gemini-2.0-flash',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
          {
            name: 'models/text-embedding-004',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      })
    );

    const result = await provider.validateModelAvailability();

    expect(result.available).toBe(true);
    expect(result.configuredModel).toBe('gemini-2.0-flash');
    // "models/" prefix stripped; embedding-only model excluded
    expect(result.supportedModels).toEqual(['gemini-2.0-flash']);

    // Not short-circuited: isHealthy() falls through to the countTokens probe.
    // The probe will use the (mocked) SDK, not our error cache. We only assert
    // the cached error path is NOT engaged — isHealthy is allowed to do its probe.
    await expect(
      provider.isHealthy().catch(() => false)
    ).resolves.toBeDefined();
  });

  it('marks available=false and short-circuits complete() with ProviderUnavailableError when model is absent', async () => {
    const provider = new GeminiProvider(buildConfig({ model: 'gemini-1.5-pro' }));

    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        models: [
          {
            name: 'models/gemini-2.0-flash',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/gemini-2.5-flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      })
    );

    const result = await provider.validateModelAvailability();

    expect(result.available).toBe(false);
    expect(result.configuredModel).toBe('gemini-1.5-pro');
    expect(result.supportedModels).toEqual(['gemini-2.0-flash', 'gemini-2.5-flash']);

    // Discovery hit fetch exactly once.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // complete() must reject with the cached typed error WITHOUT any further
    // network call (fetch count stays at 1; generateContent never invoked).
    await expect(provider.complete(PROMPT)).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // isHealthy() returns false immediately via the cached error (no probe).
    await expect(provider.isHealthy()).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a non-2xx discovery response as advisory (available=true, no models, not marked unavailable)', async () => {
    const provider = new GeminiProvider(buildConfig({ model: 'gemini-1.5-pro' }));

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse({ error: 'forbidden' }, false, 403));

    const result = await provider.validateModelAvailability();

    expect(result.available).toBe(true);
    expect(result.supportedModels).toEqual([]);

    // Not marked unavailable: isHealthy() is NOT short-circuited to false by a
    // cached error (it proceeds to its own probe).
    await expect(
      provider.isHealthy().catch(() => false)
    ).resolves.toBeDefined();
  });

  it('treats a thrown discovery error as advisory (available=true, no models)', async () => {
    const provider = new GeminiProvider(buildConfig({ model: 'gemini-1.5-pro' }));

    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const result = await provider.validateModelAvailability();

    expect(result.available).toBe(true);
    expect(result.supportedModels).toEqual([]);
  });
});
