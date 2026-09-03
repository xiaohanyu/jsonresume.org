import { useState, useRef, useCallback } from 'react';

/**
 * Triage state machine (pure) + thin hook wrapper.
 *
 * State shape:
 *   { jobs, index, counts: { interested, passed, skipped }, done }
 * Decisions: 'interested' | 'passed' | 'skipped'.
 * The job list is snapshotted at start so marking a job (which mutates the
 * live list) never shifts the deck mid-triage.
 */

/** Decision → job state for the existing mark/persistence path. */
export const DECISION_TO_STATE = {
  interested: 'interested',
  passed: 'not_interested',
};

export function createTriage(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  return {
    jobs: list,
    index: 0,
    counts: { interested: 0, passed: 0, skipped: 0 },
    done: list.length === 0,
  };
}

/** Apply one decision to the current card; no-op when already done. */
export function advanceTriage(state, decision) {
  if (!state || state.done || !(decision in state.counts)) return state;
  const counts = { ...state.counts, [decision]: state.counts[decision] + 1 };
  const index = state.index + 1;
  return { ...state, counts, index, done: index >= state.jobs.length };
}

/** Total decisions made so far. */
export function triagedCount(state) {
  if (!state) return 0;
  const { interested, passed, skipped } = state.counts;
  return interested + passed + skipped;
}

/** One-line toast: '9 triaged: 4 interested, 3 passed, 2 skipped'. */
export function triageSummary(state) {
  const total = triagedCount(state);
  if (total === 0) return '0 triaged';
  const parts = [];
  const { interested, passed, skipped } = state.counts;
  if (interested) parts.push(`${interested} interested`);
  if (passed) parts.push(`${passed} passed`);
  if (skipped) parts.push(`${skipped} skipped`);
  return `${total} triaged: ${parts.join(', ')}`;
}

/**
 * Hook wrapper. `onMark(jobId, state)` runs the existing mark path for
 * y/n decisions; `onFinish(finalState)` fires once the last card is decided.
 * A ref mirrors state so rapid keypresses within one render can't double-
 * apply a decision to the same card.
 */
export function useTriage({ onMark, onFinish } = {}) {
  const [state, setState] = useState(null);
  const stateRef = useRef(null);

  const start = useCallback((jobs) => {
    const s = createTriage(jobs);
    stateRef.current = s;
    setState(s);
    return s;
  }, []);

  const stop = useCallback(() => {
    stateRef.current = null;
    setState(null);
  }, []);

  const decide = useCallback(
    (decision) => {
      const s = stateRef.current;
      if (!s || s.done) return;
      const next = advanceTriage(s, decision);
      if (next === s) return;
      const job = s.jobs[s.index];
      const markState = DECISION_TO_STATE[decision];
      if (markState && onMark && job) onMark(job.id, markState);
      stateRef.current = next;
      setState(next);
      if (next.done && onFinish) onFinish(next);
    },
    [onMark, onFinish]
  );

  return { state, active: !!state, start, stop, decide };
}
