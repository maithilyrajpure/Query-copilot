/**
 * @jest-environment node
 *
 * Unit tests for OpenAIProvider — the fallback (priority 5) provider adapter.
 *
 * Mirrors the GroqProvider test conventions: the OpenAI SDK is mocked so no
 * network call is ever made. Construction of OpenAIProvider calls
 * `new OpenAI({...})`, which the mock below turns into a plain class whose
 * instances expose `chat.completions.create` and `models.retrieve` as
 * jest.fn()s controllable per-test.
 *
 * The provider classifies SDK exceptions with `instanceof` against the named
 * error classes exported from `openai` (RateLimitError, AuthenticationError,
 * …). The mock therefore re-exports those as real, throwable classes forming
 * the same hierarchy the provider relies on: APIError is the base, and the
 * concrete subclasses extend it so `err instanceof APIError` holds. APIError
 * instances carry the `status`/`headers`/`message` shape the provider reads.
 *
 * BaseProvider.retry() re-runs the operation for retryable errors with an
 * exponential backoff sleep. To keep these tests fast and deterministic we
 * stub the global setTimeout used by that sleep so the backoff resolves
 * immediately, then assert on the FINAL thrown error after retries are
 * exhausted (matching how the production code surfaces the last error).
 */

// ---------------------------------------------------------------------------
// openai SDK mock
//
// The whole mock is defined inside the jest.mock factory because jest.mock is
// hoisted above all module-level statements; referencing out-of-factory
// bindings from the factory would hit the temporal dead zone. The factory
// builds:
//   - a `default` class capturing constructor args and exposing controllable
//     create/retrieve jest.fn()s (shared via module-level singletons), and
//   - named error classes forming a real instanceof hierarchy: APIError is the
//     base; concrete subclasses extend it so `err instanceof APIError` holds.
//     APIError carries the `status`/`headers`/`message` shape the provider
//     reads.
// Tests reach the create/retrieve fns and error classes via the typed
// `mockedOpenAI()` accessor, which calls jest.requireMock('openai').
// ---------------------------------------------------------------------------

interface OpenAIMockModule {
  default: new (opts: unknown) => unknown;
  APIError: new (status?: number, message?: string, headers?: Record<string, string>) => Error;
  APIConnectionError: new (message?: string) => Error;
  APIConnectionTimeoutError: new (message?: string) => Error;
  APIUserAbortError: new (message?: string) => Error;
  RateLimitError: new (message?: string, headers?: Record<string, string>) => Error;
  AuthenticationError: new (message?: string) => Error;
  PermissionDeniedError: new (message?: string) => Error;
  BadRequestError: new (message?: string) => Error;
  InternalServerError: new (message?: string) => Error;
  __createMock: jest.Mock;
  __retrieveMock: jest.Mock;
}

jest.mock('openai', () => {
  const createMock = jest.fn();
  const retrieveMock = jest.fn();

  class MockAPIError extends Error {
    public readonly status: number | undefined;
    public readonly headers: Record<string, string> | undefined;

    constructor(status?: number, message?: string, headers?: Record<string, string>) {
      super(message ?? 'api error');
      this.name = 'APIError';
      this.status = status;
      this.headers = headers;
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockAPIConnectionError extends MockAPIError {
    constructor(message?: string) {
      super(undefined, message ?? 'connection error');
      this.name = 'APIConnectionError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockAPIConnectionTimeoutError extends MockAPIConnectionError {
    constructor(message?: string) {
      super(message ?? 'connection timed out');
      this.name = 'APIConnectionTimeoutError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockAPIUserAbortError extends MockAPIError {
    constructor(message?: string) {
      super(undefined, message ?? 'request aborted');
      this.name = 'APIUserAbortError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockRateLimitError extends MockAPIError {
    constructor(message?: string, headers?: Record<string, string>) {
      super(429, message ?? 'rate limited', headers);
      this.name = 'RateLimitError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockAuthenticationError extends MockAPIError {
    constructor(message?: string) {
      super(401, message ?? 'invalid api key');
      this.name = 'AuthenticationError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockPermissionDeniedError extends MockAPIError {
    constructor(message?: string) {
      super(403, message ?? 'permission denied');
      this.name = 'PermissionDeniedError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockBadRequestError extends MockAPIError {
    constructor(message?: string) {
      super(400, message ?? 'bad request');
      this.name = 'BadRequestError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockInternalServerError extends MockAPIError {
    constructor(message?: string) {
      super(500, message ?? 'internal server error');
      this.name = 'InternalServerError';
      Object.setPrototypeOf(this, new.target.prototype);
    }
  }

  class MockOpenAI {
    public readonly chat = { completions: { create: createMock } };
    public readonly models = { retrieve: retrieveMock };
    constructor(_opts: unknown) {
      // Constructor args are intentionally ignored; the SDK makes no network
      // call at construction time, so capturing them is unnecessary.
    }
  }

  return {
    __esModule: true,
    default: MockOpenAI,
    APIError: MockAPIError,
    APIConnectionError: MockAPIConnectionError,
    APIConnectionTimeoutError: MockAPIConnectionTimeoutError,
    APIUserAbortError: MockAPIUserAbortError,
    RateLimitError: MockRateLimitError,
    AuthenticationError: MockAuthenticationError,
    PermissionDeniedError: MockPermissionDeniedError,
    BadRequestError: MockBadRequestError,
    InternalServerError: MockInternalServerError,
    __createMock: createMock,
    __retrieveMock: retrieveMock,
  };
});

/** Typed accessor for the mocked openai module's error classes and fns. */
function mockedOpenAI(): OpenAIMockModule {
  return jest.requireMock('openai') as OpenAIMockModule;
}

import { OpenAIProvider } from './openai.provider';
import type { OpenAIConfig } from './openai.config';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderAuthError,
  ProviderTimeoutError,
  ProviderContextOverflowError,
  ProviderUnavailableError,
} from '../errors';
import type { ProviderPrompt } from '../types';

function buildConfig(overrides: Partial<OpenAIConfig> = {}): OpenAIConfig {
  return {
    apiKey: 'test-key',
    model: 'gpt-4o',
    maxTokens: 4_096,
    timeoutMs: 30_000,
    temperature: 0.2,
    ...overrides,
  };
}

function buildPrompt(overrides: Partial<ProviderPrompt> = {}): ProviderPrompt {
  return {
    systemPrompt: 'You translate questions into KQL.',
    userMessage: 'show me failed logins',
    ...overrides,
  };
}

/** Minimal valid OpenAI ChatCompletion shape that adaptChatCompletion accepts. */
function minimalCompletion(
  overrides: { content?: string; finishReason?: string } = {}
) {
  return {
    id: 'chatcmpl-test',
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: overrides.content ?? 'status: 401' },
        finish_reason: overrides.finishReason ?? 'stop',
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  };
}

/**
 * Stubs the global setTimeout so BaseProvider.retry()'s exponential-backoff
 * sleep resolves synchronously — keeps retryable-error tests fast.
 */
let setTimeoutSpy: jest.SpyInstance;
const createMock = mockedOpenAI().__createMock;
const retrieveMock = mockedOpenAI().__retrieveMock;

beforeEach(() => {
  createMock.mockReset();
  retrieveMock.mockReset();
  setTimeoutSpy = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
});

afterEach(() => {
  setTimeoutSpy.mockRestore();
});

describe('OpenAIProvider.complete() success path', () => {
  it('returns a normalised ProviderResponse with mapped token usage and metadata', async () => {
    createMock.mockResolvedValue(minimalCompletion({ content: 'event.outcome:"failure"' }));
    const provider = new OpenAIProvider(buildConfig());

    const response = await provider.complete(buildPrompt());

    expect(response.provider).toBe('openai');
    expect(response.content).toBe('event.outcome:"failure"');
    expect(response.tokensUsed).toEqual(
      expect.objectContaining({
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
        isActual: true,
      })
    );
    expect(typeof response.latencyMs).toBe('number');
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('sends model, system+user messages, stream:false and max_completion_tokens', async () => {
    createMock.mockResolvedValue(minimalCompletion({ content: 'foo' }));
    const provider = new OpenAIProvider(buildConfig({ maxTokens: 2_048 }));

    await provider.complete(buildPrompt());

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        stream: false,
        max_completion_tokens: 2_048,
        messages: [
          { role: 'system', content: 'You translate questions into KQL.' },
          { role: 'user', content: 'show me failed logins' },
        ],
      })
    );
  });
});

describe('OpenAIProvider.complete() empty-content handling', () => {
  it('throws a retryable ProviderUnavailableError on empty content', async () => {
    createMock.mockResolvedValue(minimalCompletion({ content: '', finishReason: 'stop' }));
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderUnavailableError
    );
  });

  it('treats a content_filter empty response as non-retryable (no retries)', async () => {
    createMock.mockResolvedValue(
      minimalCompletion({ content: '', finishReason: 'content_filter' })
    );
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toMatchObject({
      retryable: false,
    });
    // Non-retryable → attempted exactly once.
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAIProvider.complete() error classification', () => {
  it('maps RateLimitError (429) → ProviderRateLimitError', async () => {
    const { RateLimitError } = mockedOpenAI();
    createMock.mockRejectedValue(new RateLimitError('slow down'));
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderRateLimitError
    );
  });

  it('parses retryAfterMs from the retry-after header on a rate-limit error', async () => {
    const { RateLimitError } = mockedOpenAI();
    createMock.mockRejectedValue(new RateLimitError('slow down', { 'retry-after': '3' }));
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toMatchObject({
      retryAfterMs: 3_000,
    });
  });

  it('maps AuthenticationError (401) → ProviderAuthError', async () => {
    const { AuthenticationError } = mockedOpenAI();
    createMock.mockRejectedValue(new AuthenticationError());
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('maps PermissionDeniedError (403) → ProviderAuthError', async () => {
    const { PermissionDeniedError } = mockedOpenAI();
    createMock.mockRejectedValue(new PermissionDeniedError());
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderAuthError
    );
  });

  it('maps a token-related BadRequestError (400) → ProviderContextOverflowError', async () => {
    const { BadRequestError } = mockedOpenAI();
    createMock.mockRejectedValue(
      new BadRequestError('This model maximum context length is 8192 tokens')
    );
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderContextOverflowError
    );
  });

  it('maps a generic BadRequestError (400) → non-retryable ProviderError (statusCode 400)', async () => {
    const { BadRequestError } = mockedOpenAI();
    createMock.mockRejectedValue(new BadRequestError('unsupported parameter'));
    const provider = new OpenAIProvider(buildConfig());

    const error = await provider.complete(buildPrompt()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).not.toBeInstanceOf(ProviderContextOverflowError);
    expect(error).toMatchObject({ retryable: false, statusCode: 400 });
  });

  it('maps InternalServerError (5xx) → retryable ProviderUnavailableError', async () => {
    const { InternalServerError } = mockedOpenAI();
    createMock.mockRejectedValue(new InternalServerError('upstream exploded'));
    const provider = new OpenAIProvider(buildConfig());

    const error = await provider.complete(buildPrompt()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ retryable: true });
  });

  it('maps APIConnectionTimeoutError → ProviderTimeoutError', async () => {
    const { APIConnectionTimeoutError } = mockedOpenAI();
    createMock.mockRejectedValue(new APIConnectionTimeoutError());
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.complete(buildPrompt())).rejects.toBeInstanceOf(
      ProviderTimeoutError
    );
  });

  it('maps APIConnectionError → retryable ProviderUnavailableError', async () => {
    const { APIConnectionError } = mockedOpenAI();
    createMock.mockRejectedValue(new APIConnectionError('socket hang up'));
    const provider = new OpenAIProvider(buildConfig());

    const error = await provider.complete(buildPrompt()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ retryable: true });
  });
});

describe('OpenAIProvider.isHealthy()', () => {
  it('returns true when models.retrieve resolves', async () => {
    retrieveMock.mockResolvedValue({ id: 'gpt-4o', object: 'model' });
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.isHealthy()).resolves.toBe(true);
    expect(retrieveMock).toHaveBeenCalledWith('gpt-4o');
  });

  it('returns false (without throwing) when models.retrieve rejects', async () => {
    retrieveMock.mockRejectedValue(new Error('network down'));
    const provider = new OpenAIProvider(buildConfig());

    await expect(provider.isHealthy()).resolves.toBe(false);
  });
});

describe('OpenAIProvider.getMetadata()', () => {
  it('reports name "openai", role "fallback", priority 5 and maxTokens from config', () => {
    const provider = new OpenAIProvider(buildConfig({ maxTokens: 1_234 }));

    expect(provider.getMetadata()).toEqual({
      name: 'openai',
      role: 'fallback',
      priority: 5,
      maxTokens: 1_234,
    });
  });
});

describe('OpenAIProvider.estimateTokens()', () => {
  it('returns ceil(text.length / 4)', () => {
    const provider = new OpenAIProvider(buildConfig());

    expect(provider.estimateTokens('')).toBe(0);
    expect(provider.estimateTokens('abc')).toBe(1);
    expect(provider.estimateTokens('a'.repeat(40))).toBe(10);
    expect(provider.estimateTokens('a'.repeat(41))).toBe(11);
  });
});
