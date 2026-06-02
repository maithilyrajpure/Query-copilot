import type { AppMountParameters, CoreSetup, Plugin } from '@kbn/core/public';

/**
 * Public (browser) plugin for Query Copilot. Registers the app and mounts the
 * React application lazily on navigation.
 */
export class QueryCopilotPlugin implements Plugin<void, void> {
  public setup(core: CoreSetup): void {
    core.application.register({
      id: 'query_copilot',
      title: 'Query Copilot',
      async mount(params: AppMountParameters) {
        const [coreStart] = await core.getStartServices();
        const { renderApp } = await import('./application');
        return renderApp(coreStart, params.element);
      },
    });
  }

  public start(): void {}

  public stop(): void {}
}
