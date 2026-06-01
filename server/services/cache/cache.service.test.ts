import { CacheService } from './cache.service';

describe('CacheService', () => {
  it('set then get returns the value', async () => {
    const c = new CacheService<string>();
    await c.set('k', 'v');
    expect(await c.get('k')).toBe('v');
  });

  it('miss returns undefined', async () => {
    const c = new CacheService<string>();
    expect(await c.get('absent')).toBeUndefined();
  });

  it('expires entries past their TTL', async () => {
    // ttlMs: -1 makes expiresAt strictly less than Date.now(), so the entry
    // is always considered expired on the next access. This is deterministic
    // and needs no timers.
    const c = new CacheService<number>({ ttlMs: -1 });
    await c.set('k', 1);
    const before = c.getStats().misses;
    expect(await c.get('k')).toBeUndefined();
    expect(c.getStats().misses).toBe(before + 1);
  });

  it('reports presence via has without affecting hit/miss counters', async () => {
    const c = new CacheService<string>();
    await c.set('k', 'v');

    const before = c.getStats();
    expect(await c.has('k')).toBe(true);
    expect(await c.has('absent')).toBe(false);
    const after = c.getStats();

    expect(after.hits).toBe(before.hits);
    expect(after.misses).toBe(before.misses);
  });

  it('evicts the oldest entry when over capacity', async () => {
    const c = new CacheService<number>({ maxEntries: 2 });
    await c.set('k1', 1);
    await c.set('k2', 2);
    await c.set('k3', 3);

    expect(await c.has('k1')).toBe(false);
    expect(await c.has('k2')).toBe(true);
    expect(await c.has('k3')).toBe(true);
    expect(c.getStats().size).toBe(2);
  });

  it('supports delete and clear', async () => {
    const c = new CacheService<string>();
    await c.set('k', 'v');

    expect(c.delete('k')).toBe(true);
    expect(await c.has('k')).toBe(false);

    await c.set('a', '1');
    await c.set('b', '2');
    c.clear();
    expect(c.getStats().size).toBe(0);
  });

  it('tracks hits and misses in stats', async () => {
    const c = new CacheService<string>();
    await c.set('k', 'v');
    await c.get('k'); // hit
    await c.get('absent'); // miss

    const stats = c.getStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
  });
});
