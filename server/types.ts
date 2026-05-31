import type { NavigationServerPluginSetup } from '@kbn/navigation-plugin/server';
import type { LoggerService } from './services/observability/logger.service';
import type { MetricsService } from './services/observability/metrics.service';
import type { ConfigService } from './services/config/config.service';

// ---------------------------------------------------------------------------
// Plugin dependency contracts
// ---------------------------------------------------------------------------

export interface PluginSetupDependencies {
  navigation: NavigationServerPluginSetup;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginStartDependencies {}

// ---------------------------------------------------------------------------
// Plugin contract surfaces
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QueryCopilotPluginSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QueryCopilotPluginStart {}

// ---------------------------------------------------------------------------
// Plugin context — passed to route handlers and downstream services
// Assembles all instantiated services into a single typed accessor.
// ---------------------------------------------------------------------------

export interface QueryCopilotContext {
  readonly config: ConfigService;
  readonly logger: LoggerService;
  readonly metrics: MetricsService;
}
