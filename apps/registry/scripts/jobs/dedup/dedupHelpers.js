/**
 * Pure logic for repost-family dedup over the HN "Who is Hiring" corpus.
 *
 * Companies repost the same ad in every monthly thread; these helpers turn
 * that into a signal instead of noise. dedup-jobs.js blocks jobs by
 * normalized company name (companyBlocking.js), compares embedding_v5
 * vectors pairwise within a block (cosine > SAME_THRESHOLD => same family;
 * the borderline band gets a gpt-4.1-mini adjudication), union-finds ids
 * into families, and derives per-row repost metadata: family_id, months
 * (distinct thread months), first_posted, is_latest.
 */

const SAME_THRESHOLD = 0.92;
const BORDERLINE_THRESHOLD = 0.8;

/**
 * Parse a pgvector value as returned by the Supabase REST API — either an
 * array already, or the '[0.1,0.2,...]' text form. Returns null when the
 * value is missing or unparseable.
 */
function parseVector(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value : null;
  }
  if (typeof value === 'string') {
    try {
      const arr = JSON.parse(value);
      return Array.isArray(arr) && arr.length > 0 ? arr : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Cosine similarity; 0 for invalid or mismatched vectors. */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Classify a within-block pair by cosine: 'same' above SAME_THRESHOLD,
 * 'borderline' in [BORDERLINE_THRESHOLD, SAME_THRESHOLD] (LLM adjudicates),
 * 'different' below.
 */
function classifyPair(cos) {
  if (cos > SAME_THRESHOLD) {
    return 'same';
  }
  if (cos >= BORDERLINE_THRESHOLD) {
    return 'borderline';
  }
  return 'different';
}

/** Union-find over job ids with path compression. */
function createUnionFind() {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) {
      parent.set(x, x);
    }
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root);
    }
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
    }
  };
  const groups = () => {
    const byRoot = new Map();
    for (const key of parent.keys()) {
      const root = find(key);
      if (!byRoot.has(root)) {
        byRoot.set(root, []);
      }
      byRoot.get(root).push(key);
    }
    return [...byRoot.values()];
  };
  return { find, union, groups };
}

/** 'YYYY-MM' (UTC) thread-month for an ISO date, or null. */
function threadMonth(iso) {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return null;
  }
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${month}`;
}

/**
 * Derive per-row repost metadata for one family.
 * @param {Array<{id: number, posted_at?: string, created_at?: string}>} members
 * @returns {Map<number, {family_id, months, first_posted, is_latest}>}
 *   family_id: smallest job id; months: distinct thread-months; is_latest:
 *   true only for the newest post (ties broken by higher id).
 */
function buildRepostRecords(members) {
  const dated = members
    .map((m) => ({ id: m.id, when: m.posted_at || m.created_at || null }))
    .sort(
      (a, b) => new Date(a.when || 0) - new Date(b.when || 0) || a.id - b.id
    );
  const familyId = Math.min(...dated.map((m) => m.id));
  const months =
    new Set(dated.map((m) => threadMonth(m.when)).filter(Boolean)).size || 1;
  const firstPosted = dated[0].when;
  const latestId = dated[dated.length - 1].id;
  const out = new Map();
  for (const m of dated) {
    out.set(m.id, {
      family_id: familyId,
      months,
      first_posted: firstPosted,
      is_latest: m.id === latestId,
    });
  }
  return out;
}

/** Field-wise equality of two repost records (idempotent nightly writes). */
function repostEquals(a, b) {
  if (!a || !b) {
    return false;
  }
  return (
    a.family_id === b.family_id &&
    a.months === b.months &&
    a.first_posted === b.first_posted &&
    a.is_latest === b.is_latest
  );
}

module.exports = {
  SAME_THRESHOLD,
  BORDERLINE_THRESHOLD,
  parseVector,
  cosineSimilarity,
  classifyPair,
  createUnionFind,
  threadMonth,
  buildRepostRecords,
  repostEquals,
};
