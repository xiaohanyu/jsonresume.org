/**
 * Company-name blocking key for repost dedup. Reposts are only compared
 * within a company block, so the key must survive month-to-month drift in
 * how a company writes its own name ("Acme", "Acme Inc.", "Acme (YC W24)").
 */

/** Legal-entity suffix tokens stripped (repeatedly) from company names. */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'bv',
  'ab',
  'ag',
  'plc',
  'pty',
  'sa',
  'sarl',
  'srl',
  'oy',
  'aps',
  'kk',
]);

/**
 * Normalize a company name into a blocking key: lowercase, drop
 * parenthesized asides ("(YC W24)"), strip punctuation, a leading "the",
 * and trailing legal suffixes ("Acme Co., Ltd." -> "acme").
 * Returns null when there is nothing usable to block on.
 */
function normalizeCompany(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }
  const tokens = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens[0] === 'the') {
    tokens.shift();
  }
  const stripped = [...tokens];
  while (
    stripped.length > 1 &&
    LEGAL_SUFFIXES.has(stripped[stripped.length - 1])
  ) {
    stripped.pop();
  }
  // Never strip a name down to nothing ("Co" stays "co").
  const kept = stripped.length > 0 ? stripped : tokens;
  return kept.length > 0 ? kept.join(' ') : null;
}

module.exports = { LEGAL_SUFFIXES, normalizeCompany };
