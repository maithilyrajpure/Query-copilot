import './index.scss';

import { QueryCopilotPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, Kibana Platform `plugin()` initializer.
export function plugin() {
  return new QueryCopilotPlugin();
}
export type { QueryCopilotPluginSetup, QueryCopilotPluginStart } from './types';
