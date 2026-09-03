-- Harden api_keys: random, hashed, revocable, owner-bound API keys.
--
-- Before this migration the v1 API used stateless HMAC keys of the form
-- jr_{username}_{HMAC(SUPABASE_KEY, username)}. POST /api/v1/keys handed one to
-- any anonymous caller for any username, so anyone could mint a working key for
-- anyone else. Because the key was a pure function of a public username it also
-- could never be rotated or revoked.
--
-- Keys are now 256-bit random secrets stored only as SHA-256 hashes, owned by
-- the GitHub account that was signed in when they were issued.
--
-- Written to be idempotent and to work whether or not the original
-- 20260312000000_create_api_keys migration was ever applied.

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  name TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Any pre-existing row predates hashing and describes a forgeable, unrevocable
-- HMAC key. Drop them rather than migrate them; affected users re-issue a key
-- from https://jsonresume.org/api-keys.
DELETE FROM api_keys WHERE key_hash IS NULL;

-- Plaintext keys are never stored again.
ALTER TABLE api_keys DROP COLUMN IF EXISTS key;

ALTER TABLE api_keys ALTER COLUMN key_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_username_active
  ON api_keys(username) WHERE revoked_at IS NULL;

-- The anon key is public (it ships in the client bundle), so the table must not
-- be reachable through PostgREST at all. RLS with no policies denies anon and
-- authenticated everything; the server-only service-role key bypasses RLS.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON api_keys FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON api_keys FROM authenticated;
  END IF;
END
$$;
