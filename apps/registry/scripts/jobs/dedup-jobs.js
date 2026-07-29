/**
 * Repost dedup — collapses monthly "Who is Hiring" reposts into families and
 * stamps repost metadata into gpt_content (no DDL):
 *   repost: { family_id, months, first_posted, is_latest }
 * Blocks by normalized company name, pairwise cosine over embedding_v5
 * within a block (cos > 0.92 => same family; 0.80-0.92 => one gpt-4.1-mini
 * structured call per borderline pair), union-find into families. Only the
 * newest member keeps is_latest=true — the matcher drops the rest, and
 * clients can show "still hiring · Nth month" from `months`.
 *
 * Usage:
 *   node scripts/jobs/dedup-jobs.js [--days=150] [--limit=N] [--dry-run] [--max-llm=1000]
 *
 * Nightly (after salary normalization) + backfill. Idempotent: only rewrites
 * rows whose computed repost differs from the stored one. --dry-run runs the
 * full computation (including LLM adjudication) but skips DB writes.
 */
const { createClient } = require('@supabase/supabase-js');
const {
  cosineSimilarity,
  classifyPair,
  createUnionFind,
  buildRepostRecords,
  repostEquals,
} = require('./dedup/dedupHelpers');
const { normalizeCompany } = require('./dedup/companyBlocking');
const {
  fetchWindow,
  fetchVectors,
  adjudicatePair,
} = require('./dedup/dedupIo');

const SUPABASE_URL = 'https://itxuhvvwryeuzuyihpkp.supabase.co';
const LLM_BATCH = 8; // concurrent adjudication calls

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : dflt;
};
const DAYS = parseInt(getArg('days', '150'));
const LIMIT = parseInt(getArg('limit', '20000'));
// Adjudication cap per run — keep ABOVE the typical borderline count
// (~700 per 150d window, ~$0.10/run) or nightly families churn vs backfill.
const MAX_LLM = parseInt(getArg('max-llm', '1000'));
const DRY = args.includes('--dry-run');

/** Parse window rows and group them into normalized-company blocks. */
function buildBlocks(rows) {
  const jobs = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.gpt_content);
      const block = normalizeCompany(parsed?.company);
      if (parsed?.title && block) {
        jobs.push({ ...row, parsed, block });
      }
    } catch {
      // unparseable gpt_content — not dedupable
    }
  }
  const blocks = new Map();
  for (const j of jobs) {
    if (!blocks.has(j.block)) {
      blocks.set(j.block, []);
    }
    blocks.get(j.block).push(j);
  }
  return { jobs, blocks };
}

async function main() {
  if (!process.env.SUPABASE_KEY) {
    console.error('Missing SUPABASE_KEY environment variable');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_KEY);
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const rows = await fetchWindow(supabase, since, LIMIT);
  const { jobs, blocks } = buildBlocks(rows);
  const multi = [...blocks.values()].filter((b) => b.length > 1);
  console.log(
    `Window (${DAYS}d): ${rows.length} rows, ${jobs.length} parsed, ` +
      `${blocks.size} companies, ${multi.length} blocks with 2+ posts` +
      (DRY ? ' (dry run)' : '')
  );

  const vecIds = multi.flat().map((j) => j.id);
  const vectors = await fetchVectors(supabase, vecIds);
  const missing = vecIds.filter((id) => !vectors.has(id)).length;

  const uf = createUnionFind();
  const borderline = [];
  let autoSame = 0;
  for (const block of multi) {
    for (let i = 0; i < block.length; i++) {
      for (let k = i + 1; k < block.length; k++) {
        const va = vectors.get(block[i].id);
        const vb = vectors.get(block[k].id);
        if (!va || !vb) {
          continue;
        }
        const verdict = classifyPair(cosineSimilarity(va, vb));
        if (verdict === 'same') {
          uf.union(block[i].id, block[k].id);
          autoSame++;
        } else if (verdict === 'borderline') {
          borderline.push([block[i], block[k]]);
        }
      }
    }
  }

  let llmSame = 0;
  let llmDiff = 0;
  let llmFail = 0;
  let llmSkipped = borderline.length - Math.min(borderline.length, MAX_LLM);
  const toJudge = borderline.slice(0, MAX_LLM);
  for (let i = 0; i < toJudge.length; i += LLM_BATCH) {
    const batch = toJudge.slice(i, i + LLM_BATCH).filter(([a, b]) => {
      // already unioned transitively — no LLM call needed
      if (uf.find(a.id) === uf.find(b.id)) {
        llmSkipped++;
        return false;
      }
      return true;
    });
    await Promise.all(
      batch.map(async ([a, b]) => {
        try {
          if (await adjudicatePair(a, b)) {
            uf.union(a.id, b.id);
            llmSame++;
          } else {
            llmDiff++;
          }
        } catch (e) {
          llmFail++;
          console.error(
            `  ✗ adjudicate #${a.id}/#${b.id}: ${e.message.slice(0, 80)}`
          );
        }
      })
    );
  }

  const byId = new Map(jobs.map((j) => [j.id, j]));
  const families = uf
    .groups()
    .map((ids) => ids.map((id) => byId.get(id)))
    .filter((fam) => fam.length > 1);
  const repostById = new Map();
  for (const fam of families) {
    for (const [id, repost] of buildRepostRecords(fam)) {
      repostById.set(id, repost);
    }
  }

  let marked = 0;
  let unchanged = 0;
  let failed = 0;
  for (const [id, repost] of repostById) {
    const job = byId.get(id);
    if (repostEquals(job.parsed.repost, repost)) {
      unchanged++;
      continue;
    }
    if (!DRY) {
      const { error } = await supabase
        .from('jobs')
        .update({ gpt_content: JSON.stringify({ ...job.parsed, repost }) })
        .eq('id', id);
      if (error) {
        failed++;
        console.error(`  ✗ update #${id}: ${error.message.slice(0, 80)}`);
        continue;
      }
    }
    marked++;
  }

  console.log(
    `Pairs: ${autoSame} auto-same (cos>0.92), ${borderline.length} borderline; ` +
      `LLM: ${llmSame} same / ${llmDiff} different / ${llmSkipped} skipped / ${llmFail} failed`
  );
  console.log(`Missing embeddings: ${missing}`);
  console.log(`Families found: ${families.length}`);
  console.log(
    `Rows in families: ${repostById.size} (${unchanged} already current)`
  );
  console.log(`Rows marked: ${marked}${DRY ? ' (dry run, no writes)' : ''}`);
  if (failed) {
    console.log(`Update failures: ${failed}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
