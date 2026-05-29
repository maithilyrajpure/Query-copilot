import { i18n } from '@kbn/i18n';
import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type {
  QueryCopilotPluginSetup,
  QueryCopilotPluginStart,
  AppPluginStartDependencies,
} from './types';
import { PLUGIN_NAME } from '../common';

export class QueryCopilotPlugin
  implements Plugin<QueryCopilotPluginSetup, QueryCopilotPluginStart>
{
  public setup(core: CoreSetup): QueryCopilotPluginSetup {
    
    // Register an application into the side navigation menu
    core.application.register({
      id: 'queryCopilot',
      title: PLUGIN_NAME,
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services as specified in kibana.json
        const [coreStart, depsStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
      
    });

    // Return methods that should be available to other plugins
    return {
      getGreeting() {
        return i18n.translate('queryCopilot.greetingText', {
          defaultMessage: 'Hello from {name}!',
          values: {
            name: PLUGIN_NAME,
          },
        });
      },
    };
  }

  public start(core: CoreStart): QueryCopilotPluginStart {
    return {};
  }

  public stop() {}
}
