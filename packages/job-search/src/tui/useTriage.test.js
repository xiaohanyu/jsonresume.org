import { describe, it, expect } from 'vitest';
import {
  createTriage,
  advanceTriage,
  triagedCount,
  triageSummary,
  DECISION_TO_STATE,
} from './useTriage.js';

const jobs = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('createTriage', () => {
  it('starts at the first card with zeroed counts', () => {
    const s = createTriage(jobs(3));
    expect(s.index).toBe(0);
    expect(s.counts).toEqual({ interested: 0, passed: 0, skipped: 0 });
    expect(s.done).toBe(false);
  });
  it('is immediately done for empty/missing lists', () => {
    expect(createTriage([]).done).toBe(true);
    expect(createTriage(undefined).done).toBe(true);
  });
});

describe('advanceTriage', () => {
  it('counts each decision and moves to the next card', () => {
    let s = createTriage(jobs(3));
    s = advanceTriage(s, 'interested');
    expect(s.index).toBe(1);
    expect(s.counts.interested).toBe(1);
    s = advanceTriage(s, 'skipped');
    expect(s.index).toBe(2);
    expect(s.counts.skipped).toBe(1);
    expect(s.done).toBe(false);
  });

  it('finishes after the last card', () => {
    let s = createTriage(jobs(2));
    s = advanceTriage(s, 'passed');
    s = advanceTriage(s, 'passed');
    expect(s.done).toBe(true);
    expect(s.counts.passed).toBe(2);
  });

  it('ignores decisions once done and unknown decisions', () => {
    let s = createTriage(jobs(1));
    s = advanceTriage(s, 'interested');
    expect(advanceTriage(s, 'interested')).toBe(s);
    const fresh = createTriage(jobs(1));
    expect(advanceTriage(fresh, 'yolo')).toBe(fresh);
    expect(advanceTriage(null, 'interested')).toBe(null);
  });
});

describe('triagedCount / triageSummary', () => {
  it('sums decisions and formats the summary toast', () => {
    let s = createTriage(jobs(9));
    for (let i = 0; i < 4; i++) s = advanceTriage(s, 'interested');
    for (let i = 0; i < 3; i++) s = advanceTriage(s, 'passed');
    for (let i = 0; i < 2; i++) s = advanceTriage(s, 'skipped');
    expect(triagedCount(s)).toBe(9);
    expect(triageSummary(s)).toBe(
      '9 triaged: 4 interested, 3 passed, 2 skipped'
    );
  });

  it('omits zero-count segments', () => {
    let s = createTriage(jobs(2));
    s = advanceTriage(s, 'skipped');
    s = advanceTriage(s, 'skipped');
    expect(triageSummary(s)).toBe('2 triaged: 2 skipped');
  });

  it('handles nothing triaged', () => {
    expect(triagedCount(null)).toBe(0);
    expect(triageSummary(createTriage(jobs(3)))).toBe('0 triaged');
  });
});

describe('DECISION_TO_STATE', () => {
  it('maps to the existing mark states; skip persists nothing', () => {
    expect(DECISION_TO_STATE.interested).toBe('interested');
    expect(DECISION_TO_STATE.passed).toBe('not_interested');
    expect(DECISION_TO_STATE.skipped).toBeUndefined();
  });
});
