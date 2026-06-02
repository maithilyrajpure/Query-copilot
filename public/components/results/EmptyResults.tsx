import React from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';

export interface EmptyResultsProps {
  title?: string;
  body?: string;
}

/** Empty-state prompt shown when there are no results (or none yet). */
export const EmptyResults: React.FC<EmptyResultsProps> = ({ title, body }) => {
  return (
    <EuiEmptyPrompt
      data-test-subj="queryCopilotEmptyResults"
      iconType="search"
      title={<h3>{title ?? 'Run a query to see results'}</h3>}
      body={<p>{body ?? 'Generated KQL results will appear here once you run a query.'}</p>}
    />
  );
};
