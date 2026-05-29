import type {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '@kbn/core/server';

import type { QueryCopilotPluginSetup, QueryCopilotPluginStart } from './types';
import { defineRoutes } from './routes';

export class QueryCopilotPlugin
  implements Plugin<QueryCopilotPluginSetup, QueryCopilotPluginStart>
{
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup): QueryCopilotPluginSetup {
    this.logger.info('Query Copilot server ready');

    const router = core.http.createRouter();

    // Register server-side APIs
    defineRoutes(router);

    return {};
  }

  public start(core: CoreStart): QueryCopilotPluginStart {
    this.logger.info('Query Copilot started');

    return {};
  }

  public stop() {
    this.logger.info('Query Copilot stopped');
  }
}