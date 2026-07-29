/**
 * Tests for the pure repost-dedup logic: company blocking key, cosine
 * classification, union-find, and family repost records.
 */

/* eslint-env jest */

const { normalizeCompany } = require('./companyBlocking');
const {
  SAME_THRESHOLD,
  BORDERLINE_THRESHOLD,
  parseVector,
  cosineSimilarity,
  classifyPair,
  createUnionFind,
  threadMonth,
  buildRepostRecords,
  repostEquals,
} = require('./dedupHelpers');

describe('normalizeCompany', () => {
  it('lowercases and trims', () => {
    expect(normalizeCompany('  Anthropic ')).toBe('anthropic');
  });

  it('strips legal suffixes and punctuation', () => {
    expect(normalizeCompany('Anthropic, Inc.')).toBe('anthropic');
    expect(normalizeCompany('Acme LLC')).toBe('acme');
    expect(normalizeCompany('Acme Co., Ltd.')).toBe('acme');
    expect(normalizeCompany('Datadog GmbH')).toBe('datadog');
  });

  it('groups month-to-month variants under one key', () => {
    const variants = ['Anthropic', 'Anthropic, Inc.', 'ANTHROPIC INC'];
    const keys = new Set(variants.map(normalizeCompany));
    expect(keys.size).toBe(1);
  });

  it('drops parenthesized asides like YC batches', () => {
    expect(normalizeCompany('Acme (YC W24)')).toBe('acme');
    expect(normalizeCompany('Acme (we are hiring!)')).toBe('acme');
  });

  it('drops a leading "the"', () => {
    expect(normalizeCompany('The Browser Company')).toBe('browser');
  });

  it('never strips a name down to nothing', () => {
    expect(normalizeCompany('Co')).toBe('co');
    expect(normalizeCompany('Ltd')).toBe('ltd');
  });

  it('does not strip suffix words from the middle of a name', () => {
    expect(normalizeCompany('Corp Finance Tools')).toBe('corp finance tools');
  });

  it('returns null for unusable input', () => {
    expect(normalizeCompany('')).toBeNull();
    expect(normalizeCompany(null)).toBeNull();
    expect(normalizeCompany(undefined)).toBeNull();
    expect(normalizeCompany('  --  ')).toBeNull();
    expect(normalizeCompany(42)).toBeNull();
  });

  it('normalizes symbols to spaces deterministically', () => {
    expect(normalizeCompany('AT&T')).toBe('at t');
    expect(normalizeCompany('one.two/three')).toBe('one two three');
  });
});

describe('parseVector', () => {
  it('passes arrays through', () => {
    expect(parseVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('parses the pgvector text form', () => {
    expect(parseVector('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
  });

  it('returns null for empty or invalid values', () => {
    expect(parseVector([])).toBeNull();
    expect(parseVector('not json')).toBeNull();
    expect(parseVector('{}')).toBeNull();
    expect(parseVector(null)).toBeNull();
    expect(parseVector(undefined)).toBeNull();
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal ones', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('is scale-invariant', () => {
    expect(cosineSimilarity([1, 2], [10, 20])).toBeCloseTo(1, 10);
  });

  it('returns 0 for invalid or mismatched inputs', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity(null, [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('classifyPair', () => {
  it('uses > 0.92 for same and [0.80, 0.92] for borderline', () => {
    expect(classifyPair(0.95)).toBe('same');
    expect(classifyPair(SAME_THRESHOLD)).toBe('borderline'); // boundary
    expect(classifyPair(0.85)).toBe('borderline');
    expect(classifyPair(BORDERLINE_THRESHOLD)).toBe('borderline'); // boundary
    expect(classifyPair(0.799)).toBe('different');
    expect(classifyPair(0)).toBe('different');
  });
});

describe('createUnionFind', () => {
  it('unions transitively and reports groups', () => {
    const uf = createUnionFind();
    uf.union(1, 2);
    uf.union(2, 3);
    uf.union(10, 11);
    expect(uf.find(1)).toBe(uf.find(3));
    expect(uf.find(1)).not.toBe(uf.find(10));
    const groups = uf
      .groups()
      .map((g) => g.sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);
    expect(groups).toEqual([
      [1, 2, 3],
      [10, 11],
    ]);
  });

  it('singletons only appear once touched', () => {
    const uf = createUnionFind();
    expect(uf.groups()).toEqual([]);
    uf.find(7);
    expect(uf.groups()).toEqual([[7]]);
  });
});

describe('threadMonth', () => {
  it('extracts the UTC YYYY-MM', () => {
    expect(threadMonth('2026-06-02T15:00:00+00:00')).toBe('2026-06');
    expect(threadMonth('2026-01-01T00:00:00Z')).toBe('2026-01');
  });

  it('returns null for missing or invalid dates', () => {
    expect(threadMonth(null)).toBeNull();
    expect(threadMonth('nope')).toBeNull();
  });
});

describe('buildRepostRecords', () => {
  const fam = [
    { id: 30, posted_at: '2026-07-01T12:00:00Z' },
    { id: 10, posted_at: '2026-05-01T12:00:00Z' },
    { id: 20, posted_at: '2026-06-01T12:00:00Z' },
  ];

  it('marks only the newest post as latest', () => {
    const records = buildRepostRecords(fam);
    expect(records.get(30).is_latest).toBe(true);
    expect(records.get(10).is_latest).toBe(false);
    expect(records.get(20).is_latest).toBe(false);
  });

  it('uses the smallest id as family_id and earliest date as first_posted', () => {
    const records = buildRepostRecords(fam);
    for (const id of [10, 20, 30]) {
      expect(records.get(id).family_id).toBe(10);
      expect(records.get(id).first_posted).toBe('2026-05-01T12:00:00Z');
      expect(records.get(id).months).toBe(3);
    }
  });

  it('counts distinct thread-months, not posts', () => {
    const records = buildRepostRecords([
      { id: 1, posted_at: '2026-07-01T09:00:00Z' },
      { id: 2, posted_at: '2026-07-01T10:00:00Z' }, // same thread, double post
      { id: 3, posted_at: '2026-08-01T10:00:00Z' },
    ]);
    expect(records.get(3).months).toBe(2);
  });

  it('breaks date ties by higher id and falls back to created_at', () => {
    const records = buildRepostRecords([
      { id: 5, posted_at: '2026-07-01T10:00:00Z' },
      { id: 6, posted_at: '2026-07-01T10:00:00Z' },
      { id: 7, posted_at: null, created_at: '2026-06-01T10:00:00Z' },
    ]);
    expect(records.get(6).is_latest).toBe(true);
    expect(records.get(5).is_latest).toBe(false);
    expect(records.get(7).is_latest).toBe(false);
    expect(records.get(7).first_posted).toBe('2026-06-01T10:00:00Z');
  });
});

describe('repostEquals', () => {
  const rec = {
    family_id: 10,
    months: 3,
    first_posted: '2026-05-01T12:00:00Z',
    is_latest: true,
  };

  it('is true for identical records', () => {
    expect(repostEquals(rec, { ...rec })).toBe(true);
  });

  it('is false when any field differs or a side is missing', () => {
    expect(repostEquals(rec, { ...rec, months: 4 })).toBe(false);
    expect(repostEquals(rec, { ...rec, is_latest: false })).toBe(false);
    expect(repostEquals(undefined, rec)).toBe(false);
    expect(repostEquals(rec, null)).toBe(false);
  });
});
