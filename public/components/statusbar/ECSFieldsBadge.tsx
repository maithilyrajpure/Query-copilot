import React from 'react';
import { EuiBadge } from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';

/**
 * Shows the ECS field coverage summary for the most recent validation run.
 *
 * Note: the server does not populate `ValidationResult.ecsFieldCoverage` yet, so
 * this badge stays hidden until a future server task supplies it. The optional
 * `ecsFieldCoverage` field (added to ValidationResult) is the typed source this
 * task specified, so the badge is wired against it and guards for absence.
 */
export const ECSFieldsBadge: React.FC = () => {
  const { state } = useCopilot();
  const coverage = state.validationResult?.ecsFieldCoverage;
  if (!coverage) {
    return null;
  }
  return (
    <EuiBadge color="success" data-test-subj="queryCopilotEcsFieldsBadge">
      {`ECS Fields: ${coverage}`}
    </EuiBadge>
  );
};
