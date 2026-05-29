import type { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';

export interface QueryCopilotPluginSetup {
  getGreeting: () => string;
}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface QueryCopilotPluginStart {}

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
