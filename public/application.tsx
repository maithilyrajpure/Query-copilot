import React from 'react';
import ReactDOM from 'react-dom';
import type { CoreStart } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

import { App } from './app/App';

/**
 * Renders the Query Copilot React application into the given DOM element and
 * returns an unmount function for Kibana to call on navigation away.
 *
 * Uses React 17's ReactDOM.render (the runtime here is React 17; createRoot /
 * react-dom/client are not available).
 */
export function renderApp(coreStart: CoreStart, element: HTMLElement): () => void {
  ReactDOM.render(
    <KibanaContextProvider services={coreStart}>
      <App coreStart={coreStart} />
    </KibanaContextProvider>,
    element
  );

  return () => {
    ReactDOM.unmountComponentAtNode(element);
  };
}
