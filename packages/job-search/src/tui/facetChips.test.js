import { describe, it, expect } from 'vitest';
import {
  ordinal,
  formatRemoteScope,
  formatSeniority,
  formatSalaryProvenance,
  formatRepost,
  buildFacetChips,
  formatRowChips,
} from './facetChips.js';

describe('ordinal', () => {
  it('handles standard suffixes', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(22)).toBe('22nd');
  });
  it('handles the 11/12/13 exceptions', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });
});

describe('formatRemoteScope', () => {
  it('shows the globe for global remote', () => {
    expect(formatRemoteScope({ remote_scope: 'remote_global' })).toBe(
      '🌍 global'
    );
  });
  it('builds a geo chip from remote_regions', () => {
    expect(
      formatRemoteScope({
        remote_scope: 'remote_region',
        remote_regions: ['US'],
      })
    ).toBe('US-remote');
    expect(
      formatRemoteScope({
        remote_scope: 'remote_region',
        remote_regions: ['US', 'EU'],
      })
    ).toBe('US/EU-remote');
  });
  it('falls back to plain "remote" when regions are missing', () => {
    expect(
      formatRemoteScope({ remote_scope: 'remote_region', remote_regions: null })
    ).toBe('remote');
    expect(formatRemoteScope({ remote_scope: 'remote_region' })).toBe('remote');
  });
  it('labels hybrid and onsite', () => {
    expect(formatRemoteScope({ remote_scope: 'hybrid' })).toBe('hybrid');
    expect(formatRemoteScope({ remote_scope: 'onsite' })).toBe('onsite');
  });
  it('returns null for unspecified/missing facets', () => {
    expect(formatRemoteScope({ remote_scope: 'unspecified' })).toBe(null);
    expect(formatRemoteScope({})).toBe(null);
    expect(formatRemoteScope(undefined)).toBe(null);
  });
});

describe('formatSeniority', () => {
  it('maps known levels to labels', () => {
    expect(formatSeniority({ seniority: 'intern' })).toBe('intern');
    expect(formatSeniority({ seniority: 'senior' })).toBe('senior');
    expect(formatSeniority({ seniority: 'staff_plus' })).toBe('staff+');
    expect(formatSeniority({ seniority: 'lead_management' })).toBe('lead/mgmt');
  });
  it('returns null for unspecified/missing', () => {
    expect(formatSeniority({ seniority: 'unspecified' })).toBe(null);
    expect(formatSeniority({})).toBe(null);
    expect(formatSeniority(null)).toBe(null);
  });
});

describe('formatSalaryProvenance', () => {
  it('annotates stated and inferred salaries', () => {
    expect(
      formatSalaryProvenance('$180k', { salary_provenance: 'stated' })
    ).toBe('$180k (stated)');
    expect(
      formatSalaryProvenance('$180k', { salary_provenance: 'inferred' })
    ).toBe('$180k (est.)');
  });
  it('returns plain text without provenance data', () => {
    expect(formatSalaryProvenance('$180k', {})).toBe('$180k');
    expect(formatSalaryProvenance('$180k', undefined)).toBe('$180k');
    expect(
      formatSalaryProvenance('$180k', { salary_provenance: 'absent' })
    ).toBe('$180k');
  });
  it('returns null when there is no salary text', () => {
    expect(formatSalaryProvenance('', { salary_provenance: 'stated' })).toBe(
      null
    );
    expect(formatSalaryProvenance('—', { salary_provenance: 'stated' })).toBe(
      null
    );
    expect(formatSalaryProvenance(null, undefined)).toBe(null);
  });
});

describe('formatRepost', () => {
  it('shows a still-hiring chip from 2 months on', () => {
    expect(formatRepost({ months: 2 })).toBe('still hiring · 2nd month');
    expect(formatRepost({ months: 3 })).toBe('still hiring · 3rd month');
  });
  it('returns null for fresh posts and missing data', () => {
    expect(formatRepost({ months: 1 })).toBe(null);
    expect(formatRepost({ months: 0 })).toBe(null);
    expect(formatRepost({})).toBe(null);
    expect(formatRepost(undefined)).toBe(null);
  });
});

describe('buildFacetChips', () => {
  it('builds the full chip set with colors, repost dim', () => {
    const job = {
      facets: {
        remote_scope: 'remote_global',
        seniority: 'senior',
        salary_provenance: 'stated',
      },
      repost: { months: 3, is_latest: true },
    };
    expect(buildFacetChips(job, '$185k')).toEqual([
      { text: '🌍 global', color: 'cyan', dim: false },
      { text: 'senior', color: 'magenta', dim: false },
      { text: '$185k (stated)', color: 'green', dim: false },
      { text: 'still hiring · 3rd month', color: 'yellow', dim: true },
    ]);
  });
  it('returns an empty list for jobs without facet data', () => {
    expect(buildFacetChips({}, '—')).toEqual([]);
    expect(buildFacetChips(null, null)).toEqual([]);
  });
});

describe('formatRowChips', () => {
  it('builds a compact row string', () => {
    expect(
      formatRowChips({
        facets: { remote_scope: 'remote_global', seniority: 'senior' },
        repost: { months: 3 },
      })
    ).toBe('🌍 sr ↻3');
    expect(
      formatRowChips({
        facets: { remote_scope: 'remote_region', remote_regions: ['US'] },
      })
    ).toBe('US');
    expect(formatRowChips({ facets: { remote_scope: 'hybrid' } })).toBe('hyb');
  });
  it('returns an empty string without facet data', () => {
    expect(formatRowChips({})).toBe('');
    expect(formatRowChips(undefined)).toBe('');
  });
});
