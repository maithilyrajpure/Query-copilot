/**
 * @jest-environment node
 *
 * Regression tests for GroqProvider.complete()'s pre-flight context-overflow
 * guard.
 *
 * The original guard compared `estimatedInputTokens + maxTokens` against
 * `this.config.maxTokens` (the OUTPUT cap, 8192) as if it were the context
 * window. Reserving the full 8192-token output budget out of an 8192 "window"
 * meant ANY non-zero prompt overflowed. The fix compares against a distinct
 * `contextWindowTokens` (131072 for llama-3.3-70b-versatile).
 *
 * Construction of GroqProvider calls `new Groq({ apiKey })` (the SDK), which
 * makes NO network call, so building the provider in-test is safe. The guard
 * runs before any network call, and for the success path we replace the SDK
 * client with a jest.fn() so complete() never touches the network.
 */
import { GroqProvider } from './groq.provider';
import type { GroqConfig } from './groq.config';
import { ProviderContextOverflowError } from '../errors';
import type { ProviderPrompt } from '../types';

function buildConfig(overrides: Partial<GroqConfig> = {}): GroqConfig {
  return {
    apiKey: 'test-key',
    model: 'llama-3.3-70b-versatile',
    maxTokens: 8192,
    contextWindowTokens: 131_072,
    timeoutMs: 30_000,
    temperature: 0.2,
    ...overrides,
  };
}

/** estimateTokens = ceil(chars / 4), so ~10,400 chars ≈ 2,600 input tokens. */
function buildPrompt(overrides: Partial<ProviderPrompt> = {}): ProviderPrompt {
  return {
    systemPrompt: 'a'.repeat(5_200),
    userMessage: 'b'.repeat(5_200),
    ...overrides,
  };
}

/** Minimal valid Groq ChatCompletion shape that adaptGroqCompletion accepts. */
function minimalCompletion() {
  return {
    id: 'cmpl-test',
    model: 'llama-3.3-70b-versatile',
    choices: [{ message: { role: 'assistant', content: 'SELECT * FROM logs' } }],
    usage: { prompt_tokens: 2600, completion_tokens: 8, total_tokens: 2608 },
  };
}

function mockClient(provider: GroqProvider, createFn: jest.Mock) {
  (
    provider as unknown as {
      client: { chat: { completions: { create: jest.Mock } } };
    }
  ).client = { chat: { completions: { create: createFn } } };
}

describe('GroqProvider.complete() context-overflow guard', () => {
  it('regression: a ~2,600-token prompt no longer overflows with the 131072 window (would have under the old 8192 cap)', async () => {
    const provider = new GroqProvider(buildConfig());
    const create = jest.fn().mockResolvedValue(minimalCompletion());
    mockClient(provider, create);

    const prompt = buildPrompt();

    // Under the OLD guard (input + 8192 output > 8192 window) this always threw.
    const response = await provider.complete(prompt);

    expect(create).toHaveBeenCalledTimes(1);
    expect(response.content).toBe('SELECT * FROM logs');
    expect(response.provider).toBe('groq');
  });

  it('the request body still uses maxTokens as the OUTPUT cap, not the context window', async () => {
    const provider = new GroqProvider(buildConfig());
    const create = jest.fn().mockResolvedValue(minimalCompletion());
    mockClient(provider, create);

    await provider.complete(buildPrompt());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 8192 }));
  });

  it('still guards genuine overflow: input + output exceeding a small context window rejects and never calls the client', async () => {
    const provider = new GroqProvider(buildConfig({ contextWindowTokens: 4096 }));
    const create = jest.fn().mockResolvedValue(minimalCompletion());
    mockClient(provider, create);

    // ~2,600 input tokens + 8192 output cap = ~10,792 > 4096 window.
    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderContextOverflowError
    );

    // Error must reference the context-window limit (4096), not the output cap (8192).
    await expect(provider.complete(buildPrompt())).rejects.toThrow(/limit of 4096/);

    expect(create).not.toHaveBeenCalled();
  });
});
