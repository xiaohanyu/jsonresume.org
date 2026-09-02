'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@repo/ui';
import { supabase } from '../lib/supabase';

const getAppUrl = () => {
  if (typeof window === 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
};

/**
 * Keys are issued for whoever is signed in, so every call carries the Supabase
 * access token. The browser keeps its session in localStorage rather than a
 * cookie, so the server cannot read it from the request on its own.
 */
async function authorizedFetch(options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error('Not signed in');

  const res = await fetch('/api/v1/keys', {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function ApiKeysPage() {
  const [username, setUsername] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshKeys = useCallback(async () => {
    try {
      const data = await authorizedFetch({ method: 'GET' });
      setKeys(data.keys || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const login =
        session?.user?.user_metadata?.user_name ||
        session?.user?.user_metadata?.preferred_username ||
        null;

      setUsername(login);
      setLoadingSession(false);

      if (login) await refreshKeys();
    };

    load();
  }, [refreshKeys]);

  async function handleSignIn() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'read:user gist',
        redirectTo: `${getAppUrl()}/api-keys`,
      },
    });
    if (signInError) setError(signInError.message);
  }

  async function handleCreate() {
    setError(null);
    setNewKey(null);
    setBusy(true);

    try {
      const data = await authorizedFetch({
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNewKey(data.key);
      await refreshKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id) {
    setError(null);
    setBusy(true);

    try {
      await authorizedFetch({ method: 'DELETE', body: JSON.stringify({ id }) });
      setNewKey(null);
      await refreshKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <Card className="max-w-lg w-full shadow-xl">
        <CardContent className="p-8 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-gray-500 mt-2">
              Create keys for the{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">
                @jsonresume/jobs
              </code>{' '}
              CLI and Claude Code skill.
            </p>
          </div>

          {loadingSession && (
            <p className="text-center text-sm text-gray-500">Loading…</p>
          )}

          {!loadingSession && !username && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">
                Sign in with GitHub to create an API key. Keys are only ever
                issued for the account you are signed in as.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full py-2 px-4 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                Sign in with GitHub
              </button>
            </div>
          )}

          {!loadingSession && username && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 text-center">
                Signed in as <strong>{username}</strong>
              </p>

              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="w-full py-2 px-4 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Working…' : 'Create API key'}
              </button>

              {newKey && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <p className="text-sm font-medium text-green-800 mb-2">
                      Copy this key now — it is not shown again.
                    </p>
                    <code className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all select-all">
                      {newKey}
                    </code>
                  </div>

                  <div className="bg-gray-50 border rounded-md p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-700">
                      Quick start
                    </p>
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">
                        1. Export your key:
                      </p>
                      <code className="block bg-white border rounded px-3 py-2 text-xs font-mono select-all">
                        export JSONRESUME_API_KEY={newKey}
                      </code>
                      <p className="text-xs text-gray-500">
                        2. Search for jobs:
                      </p>
                      <code className="block bg-white border rounded px-3 py-2 text-xs font-mono select-all">
                        npx @jsonresume/jobs search
                      </code>
                      <p className="text-xs text-gray-500">
                        3. Or use the Claude Code skill:
                      </p>
                      <code className="block bg-white border rounded px-3 py-2 text-xs font-mono select-all">
                        /jsonresume-hunt
                      </code>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Active keys</p>
                {keys.length === 0 ? (
                  <p className="text-xs text-gray-400">No keys yet.</p>
                ) : (
                  <ul className="divide-y border rounded-md">
                    {keys.map((key) => (
                      <li
                        key={key.id}
                        className="flex items-center justify-between px-3 py-2 gap-3"
                      >
                        <div className="min-w-0">
                          <code className="text-xs font-mono text-gray-700">
                            {key.key_prefix}…
                          </code>
                          <p className="text-xs text-gray-400 truncate">
                            {key.name} · created{' '}
                            {new Date(key.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRevoke(key.id)}
                          disabled={busy}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 shrink-0"
                        >
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-700 text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
