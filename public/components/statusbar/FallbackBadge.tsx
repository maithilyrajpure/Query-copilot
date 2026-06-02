import React from 'react';
import { EuiBadge } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';
import { providerDisplayName } from './provider_display';

/**
 * Shows whether a fallback (non-primary) provider served the most recent query.
 *
 * There is no `fallbackTriggered` field in state; it is derived: take the
 * provider that actually ran (`estimatedCost.provider`), find its status in the
 * configured provider list, and treat it as a fallback when its role is not
 * `primary`. Always renders (green "operational" by default, orange on fallback).
 */
export const FallbackBadge: React.FC = () => {
  const { state } = useCopilot();

  const usedName = state.estimatedCost?.provider;
  const match = usedName
    ? state.providerState.providers.find((p) => p.name === usedName)
    : undefined;
  const fallbackTriggered = Boolean(match && match.role !== 'primary');

  if (fallbackTriggered && usedName) {
    return (
      <EuiBadge color="warning" data-test-subj="queryCopilotFallbackBadge">
        {`Fallback: ${providerDisplayName(usedName)} Standby`}
      </EuiBadge>
    );
  }

  return (
    <EuiBadge color="success" data-test-subj="queryCopilotFallbackBadge">
      All Systems Operational
    </EuiBadge>
  );
};
