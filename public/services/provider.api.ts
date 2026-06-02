import type { ProviderStatus, SystemHealth } from '../../common/types';
import { PLUGIN_ROUTE_PREFIX } from '../../common';
import { ApiClient } from './api.client';

/** Typed client for the provider-status and health endpoints. */
export class ProviderApiService extends ApiClient {
  public async getProviders(): Promise<{ providers: ProviderStatus[] }> {
    return this.get<{ providers: ProviderStatus[] }>(`${PLUGIN_ROUTE_PREFIX}/providers`);
  }

  public async getHealth(): Promise<SystemHealth> {
    return this.get<SystemHealth>(`${PLUGIN_ROUTE_PREFIX}/health`);
  }
}
