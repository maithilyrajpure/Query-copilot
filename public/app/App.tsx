import React, { useEffect } from 'react';
import { EuiProvider } from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';

import { AppShell } from './app_shell';

interface AppProps {
  readonly coreStart: CoreStart;
}

/**
 * Root application component. Sets the Kibana chrome breadcrumbs, applies EUI
 * theming (color mode derived from the active Kibana theme), and renders the
 * application shell.
 */
export const App: React.FC<AppProps> = ({ coreStart }) => {
  useEffect(() => {
    coreStart.chrome.setBreadcrumbs([{ text: 'Query Copilot' }]);
  }, [coreStart]);

  const colorMode = coreStart.theme.getTheme().darkMode ? 'dark' : 'light';

  return (
    <EuiProvider colorMode={colorMode}>
      <AppShell />
    </EuiProvider>
  );
};
