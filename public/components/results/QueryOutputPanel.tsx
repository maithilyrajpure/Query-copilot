import React from 'react';
import {
  EuiBadge,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { useCopilot } from '../../store/copilot.context';
import { EmptyResults } from './EmptyResults';
import { ResultsTable } from './ResultsTable';

/**
 * Right-card output panel: a header (with a row-count badge when results are
 * present) above the results table, an empty state, an error callout, or a
 * loading spinner — selected by the precedence in the body below.
 */
export const QueryOutputPanel: React.FC = () => {
  const { state } = useCopilot();
  const { queryResults, error, isGenerating } = state;

  const hasRows = !!queryResults && queryResults.rows.length > 0;

  let body: React.ReactNode;
  if (isGenerating && !queryResults) {
    // NOTE: `isGenerating` is the shared chat/execution flag (the store has no
    // separate `isExecuting`); we treat an in-flight run with no results yet as
    // "running query".
    body = (
      <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="l" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            Running query…
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  } else if (error && (!queryResults || queryResults.rows.length === 0)) {
    // NOTE: `state.error` is SHARED — set by both chat-generation and
    // query-execution failures, and `runQuery` does not clear it at start. So
    // we treat it as "the last error" and only surface it when there are no
    // fresh results to show.
    body = (
      <EuiCallOut color="danger" iconType="alert" title="Query execution failed">
        <p>
          {error.message}
          {error.requestId ? ` (request ${error.requestId})` : ''}
        </p>
      </EuiCallOut>
    );
  } else if (!queryResults) {
    body = <EmptyResults />;
  } else if (queryResults.rows.length === 0) {
    body = (
      <EmptyResults
        title="No results found"
        body="Your query ran successfully but returned no matching documents."
      />
    );
  } else {
    body = <ResultsTable rows={queryResults.rows} columns={queryResults.columns} />;
  }

  return (
    <EuiPanel paddingSize="m" data-test-subj="queryCopilotQueryOutputPanel">
      <EuiFlexGroup
        alignItems="center"
        justifyContent="spaceBetween"
        gutterSize="s"
        responsive={false}
      >
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiIcon type="console" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h2>Query Output</h2>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {hasRows && queryResults ? (
            <EuiBadge color="hollow">
              {`Showing ${queryResults.total ?? queryResults.rows.length} results`}
            </EuiBadge>
          ) : null}
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      {body}
    </EuiPanel>
  );
};
