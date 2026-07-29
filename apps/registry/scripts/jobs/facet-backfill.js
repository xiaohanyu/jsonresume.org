/**
 * Facet backfill — adds the `facets` object (remote_scope, remote_regions,
 * timezone_range, seniority, salary_provenance, visa_sponsorship,
 * employment_type) to existing jobs' gpt_content without re-running the full
 * parse pipeline. One cheap gpt-4.1-mini structured-output call per job over
 * the raw post content; merges into the stored JSON.
 *
 * Usage:
 *   node scripts/jobs/facet-backfill.js [--days=120] [--limit=N] [--dry-run]
 *
 * Idempotent: skips jobs whose gpt_content already has a facets object.
 * Nightly: new jobs get facets from the main parser (jobSchema facets);
 * this script is for the historical corpus + as a safety sweep.
 */
const { createClient } = require('@supabase/supabase-js');
const { generateObject } = require('ai');
const { openai } = require('@ai-sdk/openai');
const { facetsOnlySchema } = require('./job-parser/openaiFunction');

const SUPABASE_URL = 'https://itxuhvvwryeuzuyihpkp.supabase.co';
const BATCH = 10; // concurrent LLM calls

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : dflt;
};
const DAYS = parseInt(getArg('days', '120'));
const LIMIT = parseInt(getArg('limit', '10000'));
const DRY = args.includes('--dry-run');

const FACET_PROMPT = `Extract ONLY the facets object from this Hacker News job posting. STRICT PROVENANCE DISCIPLINE — these power hard filters, so precision beats coverage; use "unspecified"/"absent" when the post does not say:
- remote_scope: "remote_global" ONLY if explicitly worldwide/anywhere/global. Geo-fenced remote (US-only, EU, "US timezones") = "remote_region" with remote_regions listed (e.g. ["US"]). Office required = "onsite"; mixed = "hybrid"; not stated = "unspecified".
- timezone_range: only when stated (e.g. "UTC-8 to UTC-5", "US timezones"); else null.
- seniority: intern/junior/mid/senior/staff_plus (staff, principal)/lead_management (EM, head of, VP, CTO); multiple levels = most senior IC level; not stated = "unspecified".
- salary_provenance: "stated" ONLY if concrete numbers appear; "inferred" if estimable from strong context; "absent" otherwise.
- visa_sponsorship: "yes"/"no" only when explicit; else "unspecified".
- employment_type: "cofounder" for equity-only founding roles; else what is stated; not stated = "unspecified".`;

async function extractFacets(content) {
  const { object } = await generateObject({
    model: openai('gpt-4.1-mini'),
    system: FACET_PROMPT,
    prompt: content.slice(0, 6000),
    schema: facetsOnlySchema,
    temperature: 0,
  });
  return object.facets;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY);
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, content, gpt_content')
    .gte('created_at', since)
    .not('gpt_content', 'is', null)
    .neq('gpt_content', 'FAILED')
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) throw new Error(error.message);

  const pending = (jobs || []).filter((j) => {
    try {
      const parsed = JSON.parse(j.gpt_content);
      return parsed && parsed.title && !parsed.facets;
    } catch {
      return false;
    }
  });
  console.log(
    `Jobs in window: ${jobs.length}; needing facets: ${pending.length}${
      DRY ? ' (dry run)' : ''
    }`
  );
  if (DRY) return;

  let done = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (job) => {
        try {
          const facets = await extractFacets(job.content || '');
          const parsed = JSON.parse(job.gpt_content);
          parsed.facets = facets;
          const { error: upErr } = await supabase
            .from('jobs')
            .update({ gpt_content: JSON.stringify(parsed) })
            .eq('id', job.id);
          if (upErr) throw new Error(upErr.message);
          done++;
        } catch (e) {
          failed++;
          console.error(`  ✗ #${job.id}: ${e.message.slice(0, 80)}`);
        }
      })
    );
    console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
  }
  console.log(`Facet backfill complete: ${done} updated, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
