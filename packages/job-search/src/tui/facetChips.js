/**
 * Pure facet-chip formatters for the TUI.
 * Servers may or may not send `job.facets` / `job.repost` — every function
 * here accepts missing/partial data and returns null (or '') when there is
 * nothing meaningful to show.
 *
 * facets: { remote_scope, remote_regions, timezone_range, seniority,
 *           salary_provenance, visa_sponsorship, employment_type }
 * repost: { months, is_latest }
 */

const SENIORITY_LABELS = {
  intern: 'intern',
  junior: 'junior',
  mid: 'mid',
  senior: 'senior',
  staff_plus: 'staff+',
  lead_management: 'lead/mgmt',
};

const SENIORITY_SHORT = {
  intern: 'int',
  junior: 'jr',
  mid: 'mid',
  senior: 'sr',
  staff_plus: 'st+',
  lead_management: 'ldr',
};

/** '2' → '2nd', '3' → '3rd', '11' → '11th', … */
export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
  return `${n}${suffix}`;
}

/** Remote-scope chip text, or null when unspecified/absent. */
export function formatRemoteScope(facets) {
  const scope = facets?.remote_scope;
  if (scope === 'remote_global') return '🌍 global';
  if (scope === 'remote_region') {
    const regions = Array.isArray(facets.remote_regions)
      ? facets.remote_regions.filter(Boolean)
      : [];
    return regions.length ? `${regions.join('/')}-remote` : 'remote';
  }
  if (scope === 'hybrid') return 'hybrid';
  if (scope === 'onsite') return 'onsite';
  return null;
}

/** Seniority chip text, or null when unspecified/absent. */
export function formatSeniority(facets) {
  return SENIORITY_LABELS[facets?.seniority] || null;
}

/**
 * Salary text annotated with provenance: '(stated)' for stated,
 * '(est.)' for inferred, plain text otherwise. Returns null when there is
 * no salary text to annotate (salary absent).
 */
export function formatSalaryProvenance(salaryText, facets) {
  if (!salaryText || salaryText === '—') return null;
  const prov = facets?.salary_provenance;
  if (prov === 'stated') return `${salaryText} (stated)`;
  if (prov === 'inferred') return `${salaryText} (est.)`;
  return salaryText;
}

/** 'still hiring · 3rd month' when reposted for 2+ months, else null. */
export function formatRepost(repost) {
  const months = repost?.months;
  if (typeof months !== 'number' || months < 2) return null;
  return `still hiring · ${ordinal(months)} month`;
}

/**
 * Chip list for the detail pane / triage card:
 *   [{ text, color, dim }]
 * Salary text is derived by the caller (formatSalary) and passed in so this
 * module stays free of salary parsing.
 */
export function buildFacetChips(job, salaryText) {
  const facets = job?.facets;
  const chips = [];
  const remote = formatRemoteScope(facets);
  if (remote) chips.push({ text: remote, color: 'cyan', dim: false });
  const seniority = formatSeniority(facets);
  if (seniority) chips.push({ text: seniority, color: 'magenta', dim: false });
  const salary = formatSalaryProvenance(salaryText, facets);
  if (salary) chips.push({ text: salary, color: 'green', dim: false });
  const repost = formatRepost(job?.repost);
  if (repost) chips.push({ text: repost, color: 'yellow', dim: true });
  return chips;
}

/**
 * Ultra-compact chip string for a list row (fits a ~12-char column), e.g.
 * '🌍 sr ↻3'. Empty string when the job has no facet data.
 */
export function formatRowChips(job) {
  const facets = job?.facets;
  const parts = [];
  const scope = facets?.remote_scope;
  if (scope === 'remote_global') parts.push('🌍');
  else if (scope === 'remote_region') {
    const regions = Array.isArray(facets.remote_regions)
      ? facets.remote_regions.filter(Boolean)
      : [];
    parts.push(regions.length ? regions.join('/') : 'rmt');
  } else if (scope === 'hybrid') parts.push('hyb');
  else if (scope === 'onsite') parts.push('ons');
  const seniority = SENIORITY_SHORT[facets?.seniority];
  if (seniority) parts.push(seniority);
  const months = job?.repost?.months;
  if (typeof months === 'number' && months >= 2) parts.push(`↻${months}`);
  return parts.join(' ');
}
