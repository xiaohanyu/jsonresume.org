import { NextResponse } from 'next/server';
import { issueKey, listKeys, revokeKey } from '../auth';
import { getSessionUsername } from '../session';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = {
  error:
    'Unauthorized — sign in with GitHub at https://jsonresume.org/api-keys to manage API keys',
};

async function readJson(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

/**
 * POST /api/v1/keys — issue an API key for the signed-in user.
 * Body (optional): { "name": "laptop" }
 *
 * The key is always minted for the session's own GitHub username. A `username`
 * in the body is only ever checked against the session, never trusted: this
 * endpoint previously handed a working key for ANY username to any anonymous
 * caller, which was full takeover of the /api/v1 surface.
 */
export async function POST(request) {
  const username = await getSessionUsername(request);
  if (!username) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  const body = await readJson(request);

  if (
    typeof body.username === 'string' &&
    body.username.trim().toLowerCase() !== username
  ) {
    return NextResponse.json(
      { error: 'You can only create API keys for your own account' },
      { status: 403 }
    );
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 64)
      : 'default';

  try {
    const { key, record } = await issueKey(username, name);
    logger.info({ username, keyId: record.id }, 'Issued API key');

    return NextResponse.json({
      key,
      username,
      id: record.id,
      name: record.name,
      key_prefix: record.key_prefix,
      created_at: record.created_at,
    });
  } catch (err) {
    logger.error({ error: err.message, username }, 'Failed to issue API key');
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/keys — list the signed-in user's active keys.
 * Metadata only; the secrets themselves are unrecoverable by design.
 */
export async function GET(request) {
  const username = await getSessionUsername(request);
  if (!username) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  try {
    return NextResponse.json({ username, keys: await listKeys(username) });
  } catch (err) {
    logger.error({ error: err.message, username }, 'Failed to list API keys');
    return NextResponse.json(
      { error: 'Failed to list API keys' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/keys — revoke one of the signed-in user's keys.
 * Body: { "id": "<key id>" }
 */
export async function DELETE(request) {
  const username = await getSessionUsername(request);
  if (!username) {
    return NextResponse.json(UNAUTHORIZED, { status: 401 });
  }

  const { id } = await readJson(request);
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const revoked = await revokeKey(username, id);
    if (!revoked) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    logger.info({ username, keyId: id }, 'Revoked API key');
    return NextResponse.json({ revoked: true, id });
  } catch (err) {
    logger.error({ error: err.message, username }, 'Failed to revoke API key');
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}
