import { Box, Text, useInput } from 'ink';
import { h } from './h.js';
import { formatSalary, truncate } from '../formatters.js';
import { tierOf, tierChip, TIER_LABELS } from './tierHelpers.js';
import { buildFacetChips } from './facetChips.js';

const EXCERPT_LINES = 6;

/** First few non-empty lines of the description, width-trimmed. */
function excerptLines(description, width) {
  if (!description) return [];
  return description
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, EXCERPT_LINES)
    .map((l) => truncate(l, width));
}

/**
 * Full-screen card-by-card triage over new (unmarked) jobs.
 * y = interested · n = pass · s = skip · Esc/q = exit early.
 */
export default function TriageCard({ triage, onDecide, onExit }) {
  useInput((input, key) => {
    if (key.escape || input === 'q') onExit();
    if (input === 'y') onDecide('interested');
    if (input === 'n') onDecide('passed');
    if (input === 's') onDecide('skipped');
  });

  const { jobs, index } = triage;
  const job = jobs[index];
  if (!job) return null;

  const cols = process.stdout.columns || 80;
  const width = Math.min(90, cols - 4);
  const inner = width - 6;

  const tier = tierOf(job);
  const chip = tierChip(tier);
  const chips = buildFacetChips(job, formatSalary(job.salary, job.salary_usd));
  const excerpt = excerptLines(job.description, inner);

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'cyan',
      paddingX: 2,
      paddingY: 1,
      width,
      alignSelf: 'center',
    },
    // Header: progress + tier
    h(
      Box,
      { justifyContent: 'space-between', marginBottom: 1 },
      h(
        Text,
        { bold: true, color: 'cyan' },
        `Triage · ${index + 1}/${jobs.length}`
      ),
      tier !== 'other'
        ? h(
            Text,
            { color: chip.color, bold: true },
            `${chip.char} ${TIER_LABELS[tier]}`
          )
        : null
    ),
    // Title / company
    h(Text, { bold: true, color: 'white', wrap: 'truncate' }, job.title || '—'),
    h(Text, { color: 'cyan', wrap: 'truncate' }, `at ${job.company || '—'}`),
    // Rerank reason
    job.reason
      ? h(
          Text,
          { dimColor: true, italic: true, wrap: 'truncate' },
          `Why: ${truncate(job.reason, inner - 5)}`
        )
      : null,
    // Facet chips
    chips.length
      ? h(
          Box,
          { marginTop: 1, flexWrap: 'wrap' },
          ...chips.map((c, i) =>
            h(
              Text,
              { key: i, color: c.color, dimColor: c.dim },
              `${i > 0 ? '  ·  ' : ''}${c.text}`
            )
          )
        )
      : null,
    // Description excerpt
    excerpt.length
      ? h(
          Box,
          { flexDirection: 'column', marginTop: 1 },
          ...excerpt.map((l, i) => h(Text, { key: i, dimColor: true }, l))
        )
      : null,
    // Key hints
    h(
      Box,
      { marginTop: 1, justifyContent: 'center', gap: 2 },
      h(
        Text,
        null,
        h(Text, { color: 'green', bold: true }, 'y'),
        ' interested'
      ),
      h(Text, null, h(Text, { color: 'red', bold: true }, 'n'), ' pass'),
      h(Text, null, h(Text, { color: 'yellow', bold: true }, 's'), ' skip'),
      h(Text, { dimColor: true }, 'esc exit')
    )
  );
}
