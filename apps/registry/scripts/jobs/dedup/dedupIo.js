/**
 * Supabase + LLM I/O for repost dedup (dedup-jobs.js). Pure decision logic
 * lives in dedupHelpers.js / companyBlocking.js.
 */
const { generateObject } = require('ai');
const { openai } = require('@ai-sdk/openai');
const { z } = require('zod');
const { parseVector } = require('./dedupHelpers');

const PAGE = 1000; // window fetch page size
const VEC_CHUNK = 60; // ids per embedding fetch (~60KB/vector as text)

const adjudicationSchema = z.object({ same_job: z.boolean() });

/** Fetch id/gpt_content/dates for the dedup window (created_at >= since). */
async function fetchWindow(supabase, since, limit) {
  const rows = [];
  for (let from = 0; rows.length < limit; from += PAGE) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, gpt_content, posted_at, created_at')
      .gte('created_at', since)
      .not('gpt_content', 'is', null)
      .neq('gpt_content', 'FAILED')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) {
      break;
    }
  }
  return rows.slice(0, limit);
}

/** Fetch embedding_v5 for the given ids in chunks; Map id -> vector. */
async function fetchVectors(supabase, ids) {
  const vectors = new Map();
  for (let i = 0; i < ids.length; i += VEC_CHUNK) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, embedding_v5')
      .in('id', ids.slice(i, i + VEC_CHUNK));
    if (error) {
      throw new Error(error.message);
    }
    for (const row of data || []) {
      const vec = parseVector(row.embedding_v5);
      if (vec) {
        vectors.set(row.id, vec);
      }
    }
  }
  return vectors;
}

/**
 * One structured gpt-4.1-mini call for a borderline (0.80-0.92 cosine)
 * pair: same job reposted, or genuinely different roles?
 */
async function adjudicatePair(a, b) {
  const snippet = (j) =>
    `Title: ${j.parsed.title}\nDescription: ${(
      j.parsed.description || ''
    ).slice(0, 1500)}`;
  const { object } = await generateObject({
    model: openai('gpt-4.1-mini'),
    schema: adjudicationSchema,
    temperature: 0,
    system:
      'You compare two Hacker News "Who is Hiring" posts from the same company, posted in different monthly threads. Decide if they advertise the SAME job — a monthly repost of one role (same role, level, and location; wording may drift between months) — or genuinely DIFFERENT jobs (different role, level, team, or location).',
    prompt: `POST A (job #${a.id}):\n${snippet(a)}\n\nPOST B (job #${
      b.id
    }):\n${snippet(b)}`,
  });
  return object.same_job;
}

module.exports = { fetchWindow, fetchVectors, adjudicatePair };
