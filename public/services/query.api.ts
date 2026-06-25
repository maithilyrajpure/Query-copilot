import type {
  QueryGenerationRequest,
  QueryGenerationResponse,
  QueryExecutionResponse,
  QueryLanguage,
  TimeRange,
  TokenEstimateProviderSpec,
  TokenEstimateResponse,
} from '../../common/types';
import { PLUGIN_ROUTE_PREFIX } from '../../common';
import { ApiClient } from './api.client';

/** Typed client for the query generation/execution endpoints. */
export class QueryApiService extends ApiClient {
  public async generateQuery(request: QueryGenerationRequest): Promise<QueryGenerationResponse> {
    return this.post<QueryGenerationResponse>(`${PLUGIN_ROUTE_PREFIX}/generate`, request);
  }

  public async executeQuery(
    kql: string,
    indexPattern: string,
    timeRange?: TimeRange,
    language?: QueryLanguage
  ): Promise<QueryExecutionResponse> {
    return this.post<QueryExecutionResponse>(`${PLUGIN_ROUTE_PREFIX}/execute`, {
      kql,
      indexPattern,
      ...(timeRange ? { timeRange } : {}),
      // Forward the generated language so the server runs the ES|QL path when esql.
      ...(language ? { language } : {}),
    });
  }

  /**
   * Pure per-provider token/cost estimate for a candidate query (no LLM call,
   * carries no API key). Returns one entry per requested provider.
   */
  public async estimateTokens(
    query: string,
    providers: readonly TokenEstimateProviderSpec[]
  ): Promise<TokenEstimateResponse> {
    return this.post<TokenEstimateResponse>(`${PLUGIN_ROUTE_PREFIX}/token-estimate`, {
      query,
      providers,
    });
  }
}
