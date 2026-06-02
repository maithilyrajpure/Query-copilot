import React from 'react';
import { EuiBadge } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';

/**
 * Shows the syntax validation outcome of the most recent validation run.
 * Renders nothing until a query has been validated.
 */
export const SyntaxBadge: React.FC = () => {
  const { state } = useCopilot();
  const vr = state.validationResult;
  if (vr === null) {
    return null;
  }
  return (
    <EuiBadge
      color={vr.isValid ? 'success' : 'danger'}
      data-test-subj="queryCopilotSyntaxBadge"
    >
      {`Syntax: ${vr.isValid ? 'Passed' : 'Failed'}`}
    </EuiBadge>
  );
};
