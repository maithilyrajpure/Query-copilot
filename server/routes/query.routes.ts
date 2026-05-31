import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { QueryCopilotContext } from '../types';
import { PLUGIN_ROUTE_PREFIX, PROVIDER_NAMES, PIPELINE_CONFIG } from '../../common';

const conversationMessageSchema = schema.object({
  id: schema.string({ minLength: 1 }),
  role: schema.oneOf([
    schema.literal('user'),
    schema.literal('assistant'),
    schema.literal('system'),
  ]),
  content: schema.string({ minLength: 1 }),
  timestamp: schema.string({ minLength: 1 }),
  pipelineId: schema.nullable(schema.string()),
  queryDraftId: schema.nullable(schema.string()),
  metadata: schema.object({
    tokensUsed: schema.nullable(schema.number()),
    provider: schema.nullable(
      schema.oneOf([
        schema.literal(PROVIDER_NAMES.GEMINI),
        schema.literal(PROVIDER_NAMES.GROQ),
        schema.literal(PROVIDER_NAMES.OLLAMA),
        schema.literal(PROVIDER_NAMES.ANTHROPIC),
        schema.literal(PROVIDER_NAMES.OPENAI),
      ])
    ),
    model: schema.nullable(schema.string()),
    latencyMs: schema.nullable(schema.number()),
  }),
});

const queryGenerationRequestBodySchema = schema.object({
  analystQuery: schema.string({ minLength: 3, maxLength: 500 }),
  indexPattern: schema.string({ minLength: 1, maxLength: 256 }),
  conversationHistory: schema.arrayOf(conversationMessageSchema, {
    maxSize: PIPELINE_CONFIG.MAX_CONVERSATION_HISTORY,
    defaultValue: [],
  }),
  preferredProvider: schema.maybe(
    schema.oneOf([
      schema.literal(PROVIDER_NAMES.GEMINI),
      schema.literal(PROVIDER_NAMES.GROQ),
      schema.literal(PROVIDER_NAMES.OLLAMA),
      schema.literal(PROVIDER_NAMES.ANTHROPIC),
      schema.literal(PROVIDER_NAMES.OPENAI),
    ])
  ),
});

export function registerQueryRoutes(router: IRouter, context: QueryCopilotContext): void {
  router.post(
    {
      path: `${PLUGIN_ROUTE_PREFIX}/generate`,
      validate: {
        body: queryGenerationRequestBodySchema,
      },
      options: {
        authRequired: true,
        tags: ['access:queryCopilot'],
        body: {
          accepts: ['application/json'],
          maxBytes: 1024 * 64,
        },
      },
    },
    async (_ctx, request, response) => {
      const requestId = (request.headers['x-request-id'] as string) ?? crypto.randomUUID();
      context.logger.logRequest(requestId, 'POST', request.url.pathname);
      return response.customError({
        statusCode: 501,
        body: { message: 'Not yet implemented' },
      });
    }
  );
}
