import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabaseServer';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabaseConfig';
import { auth as nextAuthSession } from '@/auth';
import { API_KEY_PATTERN } from './auth';

/**
 * Resolve the GitHub username of the human driving this request.
 *
 * This is the ownership proof that gates API key issuance: a key may only ever
 * be minted for the identity the caller is actually signed in as. An API key is
 * explicitly not a valid credential here — keys must not be able to mint more
 * keys, or a single leaked key would be as good as a session forever.
 *
 * The registry has more than one sign-in path, so all of them are accepted:
 *
 *   1. `Authorization: Bearer <Supabase access token>` — the browser keeps its
 *      Supabase session in localStorage rather than a cookie, so the /api-keys
 *      page sends the token explicitly. Validated against the Supabase auth
 *      server, and distinguishable from an API key by shape.
 *   2. The Supabase cookie session established by /auth/callback.
 *   3. The NextAuth GitHub session used by the editor.
 *
 * @param {Request} request
 * @returns {Promise<string|null>} lowercase GitHub username, or null.
 */
export async function getSessionUsername(request) {
  const fromToken = await usernameFromBearerToken(request);
  if (fromToken) return fromToken;

  const fromCookie = await usernameFromSupabaseCookie();
  if (fromCookie) return fromCookie;

  return usernameFromNextAuth();
}

function normalize(name) {
  return typeof name === 'string' && name.trim()
    ? name.trim().toLowerCase()
    : null;
}

/** GitHub OAuth lands the login under one of these metadata keys. */
function githubUsername(user) {
  return normalize(
    user?.user_metadata?.user_name ||
      user?.user_metadata?.preferred_username ||
      user?.user_metadata?.username
  );
}

async function usernameFromBearerToken(request) {
  const header = request?.headers?.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice(7).trim();
  // An API key is not a session. Bail out before it reaches Supabase so a key
  // can never be traded up into permission to issue another one.
  if (!token || API_KEY_PATTERN.test(token)) return null;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return null;
    return githubUsername(data?.user);
  } catch {
    return null;
  }
}

async function usernameFromSupabaseCookie() {
  try {
    const supabase = await createRouteHandlerClient();
    // getUser() revalidates the JWT with the auth server. getSession() would
    // trust whatever the cookie claims, which is not good enough to gate this.
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return githubUsername(data?.user);
  } catch {
    // No request scope, or no cookie store — fall through to the next path.
    return null;
  }
}

async function usernameFromNextAuth() {
  try {
    const session = await nextAuthSession();
    return normalize(session?.username);
  } catch {
    return null;
  }
}
