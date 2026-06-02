import './index.scss';

import { QueryCopilotPlugin } from './plugin';

export function plugin() {
  return new QueryCopilotPlugin();
}
