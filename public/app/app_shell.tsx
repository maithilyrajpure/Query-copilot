import React, { useEffect } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { css } from '@emotion/react';

import { TopStatusBar } from '../components/layout/TopStatusBar';
import { SplitLayout } from '../components/layout/SplitLayout';
import { ChatPanel } from '../components/chat/ChatPanel';
import { KQLEditorPanel } from '../components/editor/KQLEditorPanel';
import { QueryOutputPanel } from '../components/results/QueryOutputPanel';
import { useCopilot } from '../store/copilot.context';
import { useServices } from '../services';
import { setProviderState } from '../store/copilot.actions';

/**
 * Application shell. Composes the top status bar above a two-panel split
 * layout: a chat panel on the left and the KQL editor + output on the right.
 * The panel contents are placeholders that later tasks replace with the real
 * chat and editor implementations.
 */
export const AppShell: React.FC = () => {
  const { dispatch } = useCopilot();
  const { providerApi } = useServices();

  // Initialise provider state on mount: the task specifies calling
  // ProviderApiService.getProviders(); getHealth() is fetched alongside (an
  // intentional additive) so FallbackBadge / system-health have data to read.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ providers }, health] = await Promise.all([
          providerApi.getProviders(),
          providerApi.getHealth(),
        ]);
        if (!cancelled) dispatch(setProviderState(providers, health));
      } catch {
        // Silently ignore on mount — badges fall back to neutral/hidden.
        // (Deliberately NOT dispatching queryError so a provider-fetch failure
        //  doesn't surface a banner in the output panel.)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerApi, dispatch]);

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="none"
      responsive={false}
      data-test-subj="queryCopilotAppShell"
      css={css({ height: '100vh' })}
    >
      <EuiFlexItem grow={false}>
        <TopStatusBar />
      </EuiFlexItem>
      <EuiFlexItem grow css={css({ minHeight: 0 })}>
        <SplitLayout
          left={<ChatPanel />}
          right={
            <EuiFlexGroup
              direction="column"
              gutterSize="m"
              responsive={false}
              css={css({ overflowY: 'auto' })}
            >
              <EuiFlexItem grow={false}>
                <KQLEditorPanel />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <QueryOutputPanel />
              </EuiFlexItem>
            </EuiFlexGroup>
          }
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
