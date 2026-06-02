import { ProviderApiService } from './provider.api';
import type { HttpSetup } from '@kbn/core/public';

describe('ProviderApiService', () => {
  it('getProviders fetches the providers endpoint', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({ providers: [{ name: 'openai' }] }),
      post: jest.fn(),
    };
    const svc = new ProviderApiService(http as unknown as HttpSetup);

    const res = await svc.getProviders();

    expect(res.providers.length).toBe(1);
    expect(http.get).toHaveBeenCalledWith('/api/query_copilot/providers');
  });

  it('getHealth fetches the health endpoint', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({ status: 'healthy', components: {} }),
      post: jest.fn(),
    };
    const svc = new ProviderApiService(http as unknown as HttpSetup);

    const res = await svc.getHealth();

    expect(http.get).toHaveBeenCalledWith('/api/query_copilot/health');
    expect(res).toMatchObject({ status: 'healthy' });
  });
});
