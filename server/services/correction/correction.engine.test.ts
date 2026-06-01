import { CorrectionEngine } from './correction.engine';
import type { CorrectionParams } from './correction.engine';
import { CorrectionPromptBuilder } from './correction.prompt.builder';
import type { ProviderRouter, ProviderResponse } from '../providers';
import type { KQLValidatorService, ValidationResult } from '../validation';
import type { LoggerService } from '../observability';
import type { SchemaContext } from '../schema';
import type { ProviderPrompt } from '../providers';

function makeValidation(valid: boolean): ValidationResult {
  return {
    valid,
    syntaxErrors: valid ? [] : [{ message: 'Unexpected token', position: 5, token: 'and' }],
    fieldErrors: valid ? [] : [{ field: 'foo.bar', message: 'Unknown field "foo.bar"' }],
    warnings: [],
    ecsFieldsUsed: [],
    totalFieldsInQuery: valid ? 1 : 0,
    ecsFieldCoverage: valid ? '1/1' : '0/0',
  };
}

function makeResponse(
  kql: string,
  provider = 'openai' as ProviderResponse['provider']
): ProviderResponse {
  return {
    content: JSON.stringify({
      kql,
      explanation: '',
      fieldsUsed: [],
      filtersApplied: [],
      investigationReasoning: '',
    }),
    tokensUsed: {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    } as unknown as ProviderResponse['tokensUsed'],
    rawResponse: {},
    latencyMs: 12,
    provider,
  };
}

const schemaContext = {
  relevantECSFields: [],
  availableIndexFields: [],
  fieldOverlap: [],
} as unknown as SchemaContext;

const originalPrompt: ProviderPrompt = {
  systemPrompt: 'sys',
  userMessage: 'analyst request: find X',
  temperature: 0.1,
};

function makeLogger() {
  return { logPipelineStage: jest.fn(), logError: jest.fn() };
}

function makeEngine(opts: {
  route: jest.Mock;
  validate: jest.Mock;
  maxRetries?: number;
  logger?: any;
}) {
  const router = { route: opts.route } as unknown as ProviderRouter;
  const validator = { validate: opts.validate } as unknown as KQLValidatorService;
  const logger = (opts.logger ?? makeLogger()) as unknown as LoggerService;
  return new CorrectionEngine(
    new CorrectionPromptBuilder(),
    router,
    validator,
    logger,
    opts.maxRetries ?? 3
  );
}

function makeParams(over: Partial<CorrectionParams> = {}): CorrectionParams {
  return {
    originalPrompt,
    generatedKQL: 'user.name : ',
    validationResult: makeValidation(false),
    schemaContext,
    requestId: 'req-1',
    ...over,
  };
}

describe('CorrectionEngine', () => {
  it('succeeds on the first correction', async () => {
    const route = jest.fn().mockResolvedValue(makeResponse('user.name : "admin"'));
    const validate = jest.fn().mockReturnValue(makeValidation(true));
    const engine = makeEngine({ route, validate });

    const res = await engine.correct(makeParams());

    expect(res.succeeded).toBe(true);
    expect(res.attempts.length).toBe(1);
    expect(res.kql).toBe('user.name : "admin"');
    expect(res.attempts[0].providerUsed).toBe('openai');
    expect(res.attempts[0].latencyMs).toBe(12);
    expect(res.attempts[0].validationResult.valid).toBe(true);
  });

  it('exhausts retries when the query never validates', async () => {
    const route = jest.fn().mockResolvedValue(makeResponse('still bad'));
    const validate = jest.fn().mockReturnValue(makeValidation(false));
    const engine = makeEngine({ route, validate, maxRetries: 2 });

    const res = await engine.correct(makeParams());

    expect(res.succeeded).toBe(false);
    expect(res.attempts.length).toBe(2);
    expect(res.kql).toBe('still bad');
    expect(res.validationResult.valid).toBe(false);
  });

  it('is a no-op when the query is already valid', async () => {
    const route = jest.fn();
    const validate = jest.fn();
    const engine = makeEngine({ route, validate });

    const res = await engine.correct(makeParams({ validationResult: makeValidation(true) }));

    expect(res.succeeded).toBe(true);
    expect(res.attempts.length).toBe(0);
    expect(route).not.toHaveBeenCalled();
  });

  it('resolves (does not throw) when all providers fail', async () => {
    const route = jest.fn().mockRejectedValue(new Error('all providers down'));
    const validate = jest.fn();
    const logger = makeLogger();
    const engine = makeEngine({ route, validate, logger });

    const res = await engine.correct(makeParams());

    expect(res.succeeded).toBe(false);
    expect(res.attempts.length).toBe(0);
    expect(res.kql).toBe('user.name : '); // original, unchanged
    expect(logger.logError).toHaveBeenCalled();
  });

  it('strips code fences when parsing the model response', async () => {
    const fenced = '```json\n' + JSON.stringify({ kql: 'event.outcome : "failure"' }) + '\n```';
    const route = jest.fn().mockResolvedValue({ ...makeResponse('ignored'), content: fenced });
    const validate = jest.fn().mockReturnValue(makeValidation(true));
    const engine = makeEngine({ route, validate });

    const res = await engine.correct(makeParams());

    expect(res.attempts[0].generatedKQL).toBe('event.outcome : "failure"');
    expect(res.succeeded).toBe(true);
  });

  it('logs each correction attempt', async () => {
    const route = jest.fn().mockResolvedValue(makeResponse('still bad'));
    const validate = jest.fn().mockReturnValue(makeValidation(false));
    const logger = makeLogger();
    const engine = makeEngine({ route, validate, maxRetries: 2, logger });

    await engine.correct(makeParams());

    expect(logger.logPipelineStage.mock.calls.length).toBe(2);
  });
});
