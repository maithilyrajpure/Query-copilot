import React from 'react';
import { EuiBadge } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';

/**
 * Shows the estimated USD cost of the most recent query. Renders nothing until a
 * query has produced a cost estimate.
 */
export const CostBadge: React.FC = () => {
  const { state } = useCopilot();
  const estimatedCost = state.estimatedCost;
  if (estimatedCost === null) {
    return null;
  }
  return (
    <EuiBadge color="hollow" data-test-subj="queryCopilotCostBadge">
      {`$${estimatedCost.totalCostUsd.toFixed(4)}`}
    </EuiBadge>
  );
};
