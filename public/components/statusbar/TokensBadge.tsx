import React from 'react';
import { EuiBadge } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';

/**
 * Shows the total token usage of the most recent query. Renders nothing until a
 * query has produced a token estimate.
 */
export const TokensBadge: React.FC = () => {
  const { state } = useCopilot();
  const tokenUsage = state.tokenUsage;
  if (tokenUsage === null) {
    return null;
  }
  return (
    <EuiBadge color="hollow" data-test-subj="queryCopilotTokensBadge">
      {`Tokens Used: ${tokenUsage.totalTokens}`}
    </EuiBadge>
  );
};
