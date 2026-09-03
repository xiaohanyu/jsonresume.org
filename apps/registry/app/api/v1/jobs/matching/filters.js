/**
 * Pure candidate-side filters for the jobs matcher.
 *
 * Extracted from matchJobs.js so the predicates are unit-testable and the
 * fixes from the 2026-07 ranking eval are explicit:
 *  - keyword search used to be `JSON.stringify(job).includes(q)`, which made
 *    "ai" match 98/100 jobs via "maintain"/"available" and JSON keys. It now
 *    word-boundary-matches against real text fields only.
 *  - min_salary used to fail OPEN on null salary_usd (the field was never
 *    populated), making the filter a no-op headed by sub-$50k gigs. It now
 *    fails CLOSED unless the caller opts into unknown salaries.
 */

const HIDDEN_STATES = new Set(['not_interested', 'dismissed']);

/** Flatten the human-readable text of a job row for keyword matching. */
export function jobSearchText(job) {
  const skills = (job.skills || [])
    .map((s) => {
      const name = s?.name || s || '';
      const kws = (s?.keywords || []).join(' ');
      return `${name} ${kws}`;
    })
    .join(' ');
  return [
    job.title,
    job.company,
    job.location,
    job.description,
    skills,
    (job.qualifications || []).join(' '),
    (job.responsibilities || []).join(' '),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

/**
 * Build a keyword predicate. Plain alphanumeric queries match on word
 * boundaries ("ai" no longer matches "maintain"); queries with symbols
 * (e.g. "c++", ".net") fall back to substring over the same text fields.
 */
export function buildKeywordPredicate(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return () => true;
  }

  if (/^[a-z0-9 ]+$/.test(q)) {
    const escaped = q.replace(/ +/g, '\\s+');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    return (job) => re.test(jobSearchText(job));
  }

  return (job) => jobSearchText(job).includes(q);
}

/**
 * Remote predicate. Prefers the ingest-time facets (strict provenance:
 * remote_scope is only "remote_global"/"remote_region" when the post says
 * so) and falls back to the legacy coarse `remote` enum for rows that
 * predate facet extraction.
 */
export function isRemoteJob(job) {
  const scope = job.facets?.remote_scope;
  if (scope && scope !== 'unspecified') {
    return scope === 'remote_global' || scope === 'remote_region';
  }
  return job.remote === 'Full';
}

/**
 * Repost-family dedup: keep only the newest instance of each family.
 * scripts/jobs/dedup-jobs.js stamps `repost: { family_id, months,
 * first_posted, is_latest }` into gpt_content; superseded instances
 * (is_latest === false) are dropped here so the same ad reposted monthly
 * surfaces once, carrying its months count ("still hiring · 3rd month").
 * Rows WITHOUT repost metadata (pre-dedup corpus, eval fixtures) are
 * treated as latest and kept.
 */
export function dropSupersededReposts(rows) {
  return rows.filter((job) => job.repost?.is_latest !== false);
}

/**
 * Combined row filter for parsed job rows.
 * @param {Object} opts
 * @param {Object|null} opts.stateMap - job_id -> sentiment
 * @param {boolean} opts.remote - require a remote role (facet-aware)
 * @param {number} opts.minSalary - minimum salary in $k; fails closed on
 *   unknown salary unless includeUnknownSalary is set
 * @param {boolean} opts.includeUnknownSalary
 * @param {string} opts.search - keyword query
 */
export function buildJobFilter({
  stateMap,
  remote,
  minSalary,
  includeUnknownSalary = false,
  search,
}) {
  const matchesKeyword = buildKeywordPredicate(search);

  return (job) => {
    if (stateMap && HIDDEN_STATES.has(job.state)) {
      return false;
    }
    if (remote && !isRemoteJob(job)) {
      return false;
    }
    if (minSalary) {
      if (job.salary_usd == null) {
        if (!includeUnknownSalary) {
          return false;
        }
      } else if (job.salary_usd < minSalary * 1000) {
        return false;
      }
    }
    return matchesKeyword(job);
  };
}
