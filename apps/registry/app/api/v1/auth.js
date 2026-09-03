import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/supabaseConfig';

/**
 * Database-backed API key authentication.
 *
 * Key format: `jr_<64 hex chars>` — a 256-bit random secret. Only its SHA-256
 * hash is persisted (`api_keys.key_hash`), so a database leak hands out no
 * working credentials, and any single key can be revoked on its own.
 *
 * Keys are deliberately NOT derived from the username. The previous scheme —
 * `jr_{username}_{HMAC(SUPABASE_KEY, username)}` — made a key a pure function
 * of a public username, so it could never be rotated or revoked, and
 * POST /api/v1/keys minted one for any username without checking the caller
 * owned it. Those legacy keys are no longer accepted.
 */

const KEY_PREFIX = 'jr_';
const KEY_BYTES = 32;

/** A well-formed API key: `jr_` followed by 64 lowercase hex characters. */
export const API_KEY_PATTERN = /^jr_[a-f0-9]{64}$/;

function getServiceClient() {
  if (!process.env.SUPABASE_KEY) {
    throw new Error('SUPABASE_KEY environment variable is required');
  }
  return createClient(SUPABASE_URL, process.env.SUPABASE_KEY);
}

/** SHA-256 of a key, hex encoded — what we store and look keys up by. */
export function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Mint a random key. Shown to its owner once and never stored in the clear. */
export function generateKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(KEY_BYTES).toString('hex')}`;
}

/**
 * Issue and persist a key for `username`.
 *
 * Callers MUST have already proven the requester owns that username — this
 * function does no authorization of its own.
 *
 * @returns {Promise<{ key: string, record: object }>} the plaintext key (once)
 *   plus the stored metadata.
 */
export async function issueKey(username, name = 'default') {
  const key = generateKey();

  const { data, error } = await getServiceClient()
    .from('api_keys')
    .insert({
      key_hash: hashKey(key),
      // Enough for an owner to tell their keys apart in a list, never enough to
      // reconstruct one.
      key_prefix: key.slice(0, KEY_PREFIX.length + 8),
      username,
      name,
    })
    .select('id, name, key_prefix, created_at')
    .single();

  if (error) throw new Error(error.message);

  return { key, record: data };
}

/** A user's active keys. Metadata only — the secrets are unrecoverable. */
export async function listKeys(username) {
  const { data, error } = await getServiceClient()
    .from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at')
    .eq('username', username)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data || [];
}

/**
 * Revoke one of `username`'s keys. Scoped by username as well as id, so a
 * caller can never revoke someone else's key by guessing its id.
 *
 * @returns {Promise<boolean>} whether a key was actually revoked.
 */
export async function revokeKey(username, id) {
  const { data, error } = await getServiceClient()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('username', username)
    .is('revoked_at', null)
    .select('id');

  if (error) throw new Error(error.message);

  return (data || []).length > 0;
}

/**
 * Authenticate a request via `Authorization: Bearer <api key>`.
 *
 * @returns {Promise<{ username: string, keyId: string } | null>}
 */
export async function authenticate(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const key = authHeader.slice(7).trim();
  if (!API_KEY_PATTERN.test(key)) return null;

  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    // Misconfigured server: fail closed rather than authenticate anyone.
    return null;
  }

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, username, revoked_at')
    .eq('key_hash', hashKey(key))
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  touchKey(supabase, data.id);

  return { username: data.username, keyId: data.id };
}

function noop() {}

/** Best-effort `last_used_at` bookkeeping; never blocks or fails a request. */
function touchKey(supabase, id) {
  try {
    const pending = supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);

    if (pending && typeof pending.then === 'function') {
      pending.then(noop, noop);
    }
  } catch {
    // Recording when a key was last used is a convenience, not part of auth.
  }
}
