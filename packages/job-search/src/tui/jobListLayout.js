import { Box, Text, useStdout } from 'ink';
import { h } from './h.js';

// Column gap between each column
export const GAP = 2;

export function useColumns(hasRerank, compact, hasFacets) {
  const { stdout } = useStdout();
  const cols = stdout?.columns || 120;
  const available = compact ? Math.floor(cols * 0.4) : cols;

  const dossierW = 2;

  if (compact) {
    // Compact mode: just score, title, dossier, status
    const scoreW = 5;
    const statusW = 2;
    const gaps = GAP * 2;
    const titleW = Math.max(
      10,
      available - scoreW - dossierW - statusW - gaps - 2
    );
    return {
      cols: available,
      titleW,
      compW: 0,
      locW: 0,
      scoreW,
      statusW,
      dossierW,
      facetW: 0,
    };
  }

  const scoreW = 5;
  const aiW = hasRerank ? 3 : 0;
  const salaryW = 12;
  const statusW = 2;
  const cursorW = 2;
  // Compact facet chips column only when data exists and width allows.
  const facetW = hasFacets && available >= 110 ? 11 : 0;
  const gapCount = 6 + (hasRerank ? 1 : 0) + (facetW ? 1 : 0);
  const gaps = GAP * gapCount;
  const fixed =
    cursorW + scoreW + aiW + salaryW + facetW + dossierW + statusW + gaps + 2;
  const flex = Math.max(30, available - fixed);
  const titleW = Math.max(12, Math.floor(flex * 0.35));
  const compW = Math.max(10, Math.floor(flex * 0.3));
  const locW = Math.max(8, flex - titleW - compW);
  return {
    cols: available,
    titleW,
    compW,
    locW,
    scoreW,
    salaryW,
    statusW,
    dossierW,
    aiW,
    facetW,
  };
}

export function HeaderRow({
  hasRerank,
  hasTiers,
  titleW,
  compW,
  locW,
  facetW,
  compact,
}) {
  const scoreLabel = hasTiers ? 'Tier' : 'Score';

  if (compact) {
    return h(
      Box,
      { paddingX: 1 },
      h(Box, { width: 2 }),
      h(
        Box,
        { width: 5, marginRight: GAP },
        h(Text, { bold: true, dimColor: true }, scoreLabel)
      ),
      h(Box, { flexGrow: 1 }, h(Text, { bold: true, dimColor: true }, 'Title'))
    );
  }

  return h(
    Box,
    { paddingX: 1 },
    h(Box, { width: 2 }),
    h(
      Box,
      { width: 5, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, scoreLabel)
    ),
    hasRerank
      ? h(
          Box,
          { width: 3, marginRight: GAP },
          h(Text, { bold: true, dimColor: true }, 'AI')
        )
      : null,
    h(
      Box,
      { width: titleW, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, 'Title')
    ),
    h(
      Box,
      { width: compW, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, 'Company')
    ),
    h(
      Box,
      { width: locW, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, 'Location')
    ),
    h(
      Box,
      { width: 12, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, 'Salary')
    ),
    facetW
      ? h(
          Box,
          { width: facetW, marginRight: GAP },
          h(Text, { bold: true, dimColor: true }, 'Facets')
        )
      : null,
    h(
      Box,
      { width: 2, marginRight: GAP },
      h(Text, { bold: true, dimColor: true }, '📋')
    ),
    h(Box, { width: 2 }, h(Text, { bold: true, dimColor: true }, '  '))
  );
}
