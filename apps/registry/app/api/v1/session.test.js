import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUserWithToken, mockGetUserFromCookie, mockNextAuth } =
  vi.hoisted(() => ({
    mockGetUserWithToken: vi.fn(),
    mockGetUserFromCookie: vi.fn(),
    mockNextAuth: vi.fn(),
  }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: { getUser: mockGetUserWithToken } })),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUserFromCookie },
  })),
}));

vi.mock('@/lib/supabaseConfig', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
}));

vi.mock('@/auth', () => ({ auth: mockNextAuth }));

import { getSessionUsername } from './session';

function request(headers = {}) {
  return new Request('http://localhost/api/v1/keys', {
    method: 'POST',
    headers,
  });
}

const noUser = { data: { user: null }, error: { message: 'no session' } };

describe('getSessionUsername', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserWithToken.mockResolvedValue(noUser);
    mockGetUserFromCookie.mockResolvedValue(noUser);
    mockNextAuth.mockResolvedValue(null);
  });

  it('returns null when the caller is not signed in at all', async () => {
    expect(await getSessionUsername(request())).toBeNull();
  });

  it('refuses to treat an API key as a session', async () => {
    // A key must never be able to mint another key, or one leaked key would be
    // as good as a permanent session.
    const apiKey = `jr_${'a'.repeat(64)}`;

    expect(
      await getSessionUsername(request({ Authorization: `Bearer ${apiKey}` }))
    ).toBeNull();
    expect(mockGetUserWithToken).not.toHaveBeenCalled();
  });

  it('accepts a validated Supabase access token', async () => {
    mockGetUserWithToken.mockResolvedValue({
      data: { user: { user_metadata: { user_name: 'ThomasDavis' } } },
      error: null,
    });

    expect(
      await getSessionUsername(
        request({ Authorization: 'Bearer supabase.jwt' })
      )
    ).toBe('thomasdavis');
    expect(mockGetUserWithToken).toHaveBeenCalledWith('supabase.jwt');
  });

  it('rejects a token the auth server does not recognise', async () => {
    mockGetUserWithToken.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    });

    expect(
      await getSessionUsername(request({ Authorization: 'Bearer forged.jwt' }))
    ).toBeNull();
  });

  it('falls back to the Supabase cookie session', async () => {
    mockGetUserFromCookie.mockResolvedValue({
      data: { user: { user_metadata: { preferred_username: 'someone' } } },
      error: null,
    });

    expect(await getSessionUsername(request())).toBe('someone');
  });

  it('falls back to the NextAuth GitHub session', async () => {
    mockNextAuth.mockResolvedValue({ username: 'EditorUser' });

    expect(await getSessionUsername(request())).toBe('editoruser');
  });

  it('verifies the cookie session with getUser, not getSession', async () => {
    // getSession() trusts the cookie's contents; getUser() revalidates it with
    // the auth server, which is what gating key issuance requires.
    const { createRouteHandlerClient } = await import('@/lib/supabaseServer');
    const client = await createRouteHandlerClient();

    await getSessionUsername(request());

    expect(client.auth.getUser).toHaveBeenCalled();
    expect(client.auth.getSession).toBeUndefined();
  });
});
