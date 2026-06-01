/**
 * In-memory cache for the query pipeline.
 *
 * Provides a generic, dependency-free cache with two bounding strategies:
 *  - Time-to-live (TTL) expiry: entries older than the configured TTL are
 *    treated as misses and deleted lazily on access.
 *  - Bounded size: when the number of entries exceeds the configured maximum,
 *    the oldest entry (by insertion order) is evicted on the next write.
 *
 * Intended use is caching generation results keyed by a normalized-query
 * SHA-256 hash, but the implementation is fully generic and makes no
 * assumptions about key or value shape beyond `string` keys.
 *
 * Note: this relies on the fact that a JS `Map` preserves insertion order,
 * which gives an approximate "oldest-first" (LRU-ish) eviction policy. Reads
 * (`get`) intentionally do NOT reorder entries, keeping behavior simple and
 * predictable.
 */

export interface CacheServiceOptions {
  /** Time-to-live for entries, in milliseconds. Default 300000 (5 min). */
  readonly ttlMs?: number;
  /** Maximum number of entries; when exceeded the oldest is evicted. Default 1000. */
  readonly maxEntries?: number;
}

export interface CacheServiceStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
}

export class CacheService<T = unknown> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();
  private hits = 0;
  private misses = 0;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options?: CacheServiceOptions) {
    this.ttlMs = options?.ttlMs ?? 300000;
    this.maxEntries = options?.maxEntries ?? 1000;
  }

  /** Returns the cached value, or undefined on a miss or if the entry has expired (expired entries are deleted lazily). */
  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (entry === undefined) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  /** Stores a value under the key with the configured TTL, evicting the oldest entry if over capacity. */
  async set(key: string, value: T): Promise<void> {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** True if a non-expired entry exists for the key. */
  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return false;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** Deletes an entry; returns true if one was removed. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Removes all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Returns a snapshot of cache stats. */
  getStats(): CacheServiceStats {
    return { size: this.store.size, hits: this.hits, misses: this.misses };
  }
}
