import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/supabaseConfig', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

import {
  API_KEY_PATTERN,
  authenticate,
  generateKey,
  hashKey,
  issueKey,
  listKeys,
  revokeKey,
} from './auth';

/**
 * Minimal stand-in for a PostgREST query builder: every method returns the same
 * chainable object, which resolves to `result` when awaited or terminated.
 */
function queryChain(result) {
  const chain = {
    calls: [],
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };

  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'is',
    'order',
    'limit',
  ]) {
    chain[method] = vi.fn((...args) => {
      chain.calls.push([method, ...args]);
      return chain;
    });
  }

  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);

  return chain;
}

function bearer(key) {
  return new Request('http://localhost/api/v1/me', {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

const VALID_KEY = `jr_${'a'.repeat(64)}`;

describe('v1 API key auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_KEY = 'service-role-key';
  });

  describe('generateKey', () => {
    it('mints unguessable keys matching the documented format', () => {
      const a = generateKey();
      const b = generateKey();

      expect(a).toMatch(API_KEY_PATTERN);
      expect(b).toMatch(API_KEY_PATTERN);
      expect(a).not.toBe(b);
    });

    it('does not derive the key from any username', () => {
      // The old scheme was HMAC(secret, username), so the same username always
      // produced the same key and it could never be revoked.
      const keys = new Set([generateKey(), generateKey(), generateKey()]);
      expect(keys.size).toBe(3);
    });
  });

  describe('authenticate', () => {
    it('rejects a request with no Authorization header', async () => {
      expect(await authenticate(bearer(null))).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a legacy HMAC key', async () => {
      // jr_{username}_{32 hex} keys were mintable by anyone for anyone and can
      // never be revoked, so they must no longer authenticate.
      const legacy = `jr_thomasdavis_${'b'.repeat(32)}`;

      expect(await authenticate(bearer(legacy))).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('rejects a key that is not in the database', async () => {
      mockFrom.mockReturnValue(queryChain({ data: null, error: null }));

      expect(await authenticate(bearer(VALID_KEY))).toBeNull();
    });

    it('rejects a revoked key', async () => {
      mockFrom.mockReturnValue(
        queryChain({
          data: {
            id: 'key-1',
            username: 'thomasdavis',
            revoked_at: '2026-01-01T00:00:00Z',
          },
          error: null,
        })
      );

      expect(await authenticate(bearer(VALID_KEY))).toBeNull();
    });

    it('looks the key up by hash and never by its plaintext', async () => {
      const chain = queryChain({
        data: { id: 'key-1', username: 'thomasdavis', revoked_at: null },
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const user = await authenticate(bearer(VALID_KEY));

      expect(user).toMatchObject({ username: 'thomasdavis', keyId: 'key-1' });

      const lookup = chain.eq.mock.calls.find(
        ([column]) => column === 'key_hash'
      );
      expect(lookup?.[1]).toBe(
        crypto.createHash('sha256').update(VALID_KEY).digest('hex')
      );

      const everyArg = JSON.stringify(chain.eq.mock.calls);
      expect(everyArg).not.toContain(VALID_KEY);
    });

    it('fails closed when the service role key is missing', async () => {
      delete process.env.SUPABASE_KEY;

      expect(await authenticate(bearer(VALID_KEY))).toBeNull();
    });
  });

  describe('issueKey', () => {
    it('stores only the hash of the key it returns', async () => {
      const chain = queryChain({
        data: {
          id: 'key-1',
          name: 'default',
          key_prefix: 'jr_aaaaaaaa',
          created_at: '2026-09-02T00:00:00Z',
        },
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      const { key, record } = await issueKey('thomasdavis', 'laptop');

      expect(key).toMatch(API_KEY_PATTERN);
      expect(record.id).toBe('key-1');

      const [row] = chain.insert.mock.calls[0];
      expect(row.key_hash).toBe(hashKey(key));
      expect(row.username).toBe('thomasdavis');
      expect(JSON.stringify(row)).not.toContain(key);
    });
  });

  describe('revokeKey', () => {
    it('scopes the revoke to the owning username', async () => {
      const chain = queryChain({ data: [{ id: 'key-1' }], error: null });
      mockFrom.mockReturnValue(chain);

      expect(await revokeKey('thomasdavis', 'key-1')).toBe(true);
      expect(chain.eq).toHaveBeenCalledWith('username', 'thomasdavis');
      expect(chain.eq).toHaveBeenCalledWith('id', 'key-1');
    });

    it('reports false when nothing matched', async () => {
      mockFrom.mockReturnValue(queryChain({ data: [], error: null }));

      expect(await revokeKey('someoneelse', 'key-1')).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('returns only the caller’s active keys', async () => {
      const chain = queryChain({
        data: [{ id: 'key-1', name: 'default' }],
        error: null,
      });
      mockFrom.mockReturnValue(chain);

      expect(await listKeys('thomasdavis')).toEqual([
        { id: 'key-1', name: 'default' },
      ]);
      expect(chain.eq).toHaveBeenCalledWith('username', 'thomasdavis');
      expect(chain.is).toHaveBeenCalledWith('revoked_at', null);
    });
  });
});
