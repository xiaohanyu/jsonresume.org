import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSessionUsername, mockIssueKey, mockListKeys, mockRevokeKey } =
  vi.hoisted(() => ({
    mockGetSessionUsername: vi.fn(),
    mockIssueKey: vi.fn(),
    mockListKeys: vi.fn(),
    mockRevokeKey: vi.fn(),
  }));

vi.mock('../session', () => ({
  getSessionUsername: mockGetSessionUsername,
}));

vi.mock('../auth', () => ({
  issueKey: mockIssueKey,
  listKeys: mockListKeys,
  revokeKey: mockRevokeKey,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST, GET, DELETE } from './route';

function request(method, body) {
  return new Request('http://localhost/api/v1/keys', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ISSUED = {
  key: `jr_${'a'.repeat(64)}`,
  record: {
    id: 'key-1',
    name: 'default',
    key_prefix: 'jr_aaaaaaaa',
    created_at: '2026-09-02T00:00:00Z',
  },
};

describe('POST /api/v1/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIssueKey.mockResolvedValue(ISSUED);
  });

  it('refuses to mint a key for an anonymous caller', async () => {
    // The original bug: this returned a working key for any username to anyone.
    mockGetSessionUsername.mockResolvedValue(null);

    const res = await POST(request('POST', { username: 'thomasdavis' }));
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.key).toBeUndefined();
    expect(mockIssueKey).not.toHaveBeenCalled();
  });

  it('refuses to mint a key for someone else while signed in', async () => {
    mockGetSessionUsername.mockResolvedValue('attacker');

    const res = await POST(request('POST', { username: 'thomasdavis' }));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.key).toBeUndefined();
    expect(mockIssueKey).not.toHaveBeenCalled();
  });

  it('issues a key for the signed-in user', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');

    const res = await POST(request('POST', {}));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.key).toBe(ISSUED.key);
    expect(data.username).toBe('thomasdavis');
    expect(mockIssueKey).toHaveBeenCalledWith('thomasdavis', 'default');
  });

  it('takes the username from the session, never from the body', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');

    await POST(request('POST', { username: 'ThomasDavis', name: 'laptop' }));

    expect(mockIssueKey).toHaveBeenCalledWith('thomasdavis', 'laptop');
  });

  it('works with no body at all', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');

    const res = await POST(request('POST'));

    expect(res.status).toBe(200);
    expect(mockIssueKey).toHaveBeenCalledWith('thomasdavis', 'default');
  });

  it('does not leak internals when issuing fails', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');
    mockIssueKey.mockRejectedValue(
      new Error('duplicate key value in api_keys')
    );

    const res = await POST(request('POST', {}));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error).toBe('Failed to create API key');
  });
});

describe('GET /api/v1/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a session', async () => {
    mockGetSessionUsername.mockResolvedValue(null);

    const res = await GET(request('GET'));

    expect(res.status).toBe(401);
    expect(mockListKeys).not.toHaveBeenCalled();
  });

  it('lists only the signed-in user’s keys', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');
    mockListKeys.mockResolvedValue([{ id: 'key-1', name: 'default' }]);

    const res = await GET(request('GET'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.keys).toHaveLength(1);
    expect(mockListKeys).toHaveBeenCalledWith('thomasdavis');
  });
});

describe('DELETE /api/v1/keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a session', async () => {
    mockGetSessionUsername.mockResolvedValue(null);

    const res = await DELETE(request('DELETE', { id: 'key-1' }));

    expect(res.status).toBe(401);
    expect(mockRevokeKey).not.toHaveBeenCalled();
  });

  it('revokes scoped to the signed-in user', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');
    mockRevokeKey.mockResolvedValue(true);

    const res = await DELETE(request('DELETE', { id: 'key-1' }));

    expect(res.status).toBe(200);
    expect(mockRevokeKey).toHaveBeenCalledWith('thomasdavis', 'key-1');
  });

  it('404s on someone else’s key rather than revoking it', async () => {
    mockGetSessionUsername.mockResolvedValue('attacker');
    mockRevokeKey.mockResolvedValue(false);

    const res = await DELETE(request('DELETE', { id: 'victims-key' }));

    expect(res.status).toBe(404);
  });

  it('requires an id', async () => {
    mockGetSessionUsername.mockResolvedValue('thomasdavis');

    const res = await DELETE(request('DELETE', {}));

    expect(res.status).toBe(400);
    expect(mockRevokeKey).not.toHaveBeenCalled();
  });
});
