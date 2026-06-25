import { useCallback, useState } from 'react';

import { useCopilot } from '../store/copilot.context';
import { ApiError, useServices } from '../services';
import { queryError, setGenerating, setQueryResults } from '../store/copilot.actions';
import type { CopilotError } from '../store/types';
import type { QueryLanguage, TimeRange } from '../../common/types';

/**
 * Owns KQL query execution against the backend.
 *
 * The returned `isExecuting` is a DEDICATED execution flag, local to this hook —
 * distinct from the shared `state.isGenerating` (which is also used by chat
 * generation). Components that drive the Run action should bind their loading
 * state to `isExecuting` so query execution and chat generation can't bleed into
 * each other's spinners.
 *
 * On success the {@link import('../../common/types').QueryExecutionResponse}
 * lands in `state.queryResults` (rendered by QueryOutputPanel as a results
 * table); on failure the normalised error is dispatched to `state.error` (also
 * rendered there as a callout). The hook additionally toggles `state.isGenerating`
 * so the shared loading affordances stay consistent.
 */

/** Builds a {@link CopilotError} from any thrown value. */
function toCopilotError(error: unknown): CopilotError {
  if (error instanceof ApiError) {
    return { message: error.message, statusCode: error.statusCode, requestId: error.requestId ?? null };
  }
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return { message, statusCode: null, requestId: null };
}

export interface UseQueryExecutionResult {
  readonly executeQuery: (
    kql: string,
    indexPattern: string,
    timeRange?: TimeRange,
    language?: QueryLanguage
  ) => Promise<void>;
  readonly isExecuting: boolean;
  readonly error: CopilotError | null;
}

export function useQueryExecution(): UseQueryExecutionResult {
  const { dispatch } = useCopilot();
  const { queryApi } = useServices();
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<CopilotError | null>(null);

  const executeQuery = useCallback(
    async (
      kql: string,
      indexPattern: string,
      timeRange?: TimeRange,
      language?: QueryLanguage
    ): Promise<void> => {
      if (kql.trim().length === 0) {
        const err: CopilotError = { message: 'No KQL to run.', statusCode: null, requestId: null };
        setError(err);
        dispatch(queryError(err));
        return;
      }

      setIsExecuting(true);
      setError(null);
      dispatch(setGenerating(true));
      try {
        const results = await queryApi.executeQuery(kql, indexPattern, timeRange, language);
        dispatch(setQueryResults(results));
      } catch (e) {
        const err = toCopilotError(e);
        setError(err);
        dispatch(queryError(err));
      } finally {
        setIsExecuting(false);
        dispatch(setGenerating(false));
      }
    },
    [dispatch, queryApi]
  );

  return { executeQuery, isExecuting, error };
}
