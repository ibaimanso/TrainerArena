import type Redis from 'ioredis';

/**
 * connect-redis v9 only speaks the node-redis v5 API (e.g. `set(key, value,
 * { expiration: { type: 'EX', value: ttl } })`), which ioredis does not
 * understand: the options object is serialised as a plain argument, Redis
 * rejects the SET and express-session swallows the error, so sessions are
 * never persisted. This adapter maps the subset of the node-redis API that
 * connect-redis uses onto the shared ioredis client.
 */
export interface SessionStoreClient {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { expiration?: { type: 'EX'; value: number } }
  ): Promise<unknown>;
  expire(key: string, ttl: number): Promise<unknown>;
  del(keys: string[]): Promise<unknown>;
  mGet(keys: string[]): Promise<(string | null)[]>;
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string[]>;
}

export function createSessionStoreClient(redis: Redis): SessionStoreClient {
  return {
    get: (key) => redis.get(key),
    set: (key, value, options) =>
      options?.expiration
        ? redis.set(key, value, 'EX', options.expiration.value)
        : redis.set(key, value),
    expire: (key, ttl) => redis.expire(key, ttl),
    del: (keys) => redis.del(...keys),
    mGet: (keys) => redis.mget(...keys),
    scanIterator: (options) =>
      (async function* () {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(
            cursor,
            'MATCH',
            options.MATCH,
            'COUNT',
            options.COUNT
          );
          cursor = next;
          yield keys;
        } while (cursor !== '0');
      })(),
  };
}
