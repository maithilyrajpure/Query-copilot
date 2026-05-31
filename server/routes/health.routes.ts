import type { IRouter } from '@kbn/core/server';
import type { QueryCopilotContext } from '../types';
import { PLUGIN_ROUTE_PREFIX } from '../../common';

export function registerHealthRoutes(router: IRouter, context: QueryCopilotContext): void {
  router.get(
    {
      path: `${PLUGIN_ROUTE_PREFIX}/health`,
      validate: false,
      options: {
        authRequired: true,
        tags: ['access:queryCopilot'],
      },
    },
    async (_ctx, request, response) => {
      context.logger.logRequest(request.headers['x-request-id'] as string ?? 'unknown', 'GET', request.url.pathname);
      return response.customError({
        statusCode: 501,
        body: { message: 'Not yet implemented' },
      });
    }
  );
}
