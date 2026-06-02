import React from 'react';
import { EuiBadge, useEuiTheme } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';
import { selectPrimaryProvider } from './provider_display';

/**
 * Shows the LLM provider/model actually in use. Prefers the model from the most
 * recent cost estimate (the provider that actually ran); otherwise falls back to
 * the primary configured provider's model (or name). Renders nothing when
 * neither resolves.
 */
export const ProviderBadge: React.FC = () => {
  const { state } = useCopilot();
  const { euiTheme } = useEuiTheme();

  const used = state.estimatedCost;
  let display: string | null = null;
  if (used) {
    display = used.model;
  } else {
    const primary = selectPrimaryProvider(state.providerState.providers);
    if (primary) {
      display = primary.model || primary.name;
    }
  }

  if (!display) {
    return null;
  }

  return (
    <EuiBadge color={euiTheme.colors.primary} data-test-subj="queryCopilotProviderBadge">
      {`LLM Provider: ${display}`}
    </EuiBadge>
  );
};
