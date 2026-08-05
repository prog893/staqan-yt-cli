import { describe, it, expect } from 'bun:test';
import {
  computeDateRangeOverlap,
  findDateGaps,
  mergeDateRanges,
  normalizeDate,
} from '../lib/cache';

describe('normalizeDate', () => {
  it('passes YYYY-MM-DD through unchanged', () => {
    expect(normalizeDate('2026-03-04')).toBe('2026-03-04');
  });

  it('converts the YYYYMMDD row-date format used in report CSVs', () => {
    expect(normalizeDate('20260304')).toBe('2026-03-04');
  });

  it('truncates ISO timestamps to their date portion', () => {
    expect(normalizeDate('2026-03-04T00:00:00Z')).toBe('2026-03-04');
  });
});

describe('mergeDateRanges', () => {
  it('returns an empty array for no input', () => {
    expect(mergeDateRanges([])).toEqual([]);
  });

  it('merges adjacent ranges (gapless across the day boundary)', () => {
    expect(mergeDateRanges([
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-01-11', end: '2026-01-20' },
    ])).toEqual([{ start: '2026-01-01', end: '2026-01-20' }]);
  });

  it('merges overlapping ranges', () => {
    expect(mergeDateRanges([
      { start: '2026-01-01', end: '2026-01-15' },
      { start: '2026-01-10', end: '2026-01-20' },
    ])).toEqual([{ start: '2026-01-01', end: '2026-01-20' }]);
  });

  it('keeps disjoint ranges separate', () => {
    expect(mergeDateRanges([
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-06-01', end: '2026-06-10' },
    ])).toEqual([
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-06-01', end: '2026-06-10' },
    ]);
  });

  it('sorts unordered input before merging', () => {
    expect(mergeDateRanges([
      { start: '2026-06-01', end: '2026-06-10' },
      { start: '2026-01-01', end: '2026-01-10' },
    ])).toEqual([
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-06-01', end: '2026-06-10' },
    ]);
  });

  it('does not mutate the caller\'s range objects', () => {
    // Regression: `[...ranges]` is a shallow copy, so seeding the accumulator
    // with `sorted[0]` and extending `last.end` in place wrote through to the
    // caller. analyzeCacheCoverage passes the same objects to findDateGaps
    // that it afterwards classifies, so this silently widened a cached
    // report's end date and mis-classified its coverage.
    const ranges = [
      { start: '2026-01-01', end: '2026-01-10' },
      { start: '2026-01-11', end: '2026-01-20' },
    ];
    const before = structuredClone(ranges);
    mergeDateRanges(ranges);
    expect(ranges).toEqual(before);
  });
});

describe('findDateGaps', () => {
  it('reports the whole window when nothing is covered', () => {
    expect(findDateGaps([], '2026-01-01', '2026-01-31')).toEqual([
      { start: '2026-01-01', end: '2026-01-31' },
    ]);
  });

  it('reports no gaps when coverage spans the window', () => {
    expect(findDateGaps(
      [{ start: '2026-01-01', end: '2026-01-31' }],
      '2026-01-01',
      '2026-01-31',
    )).toEqual([]);
  });

  it('finds an interior gap between disjoint coverage islands', () => {
    // The #155 case: cache holds January, API holds June. The outer bounds
    // look continuous, but February through May is missing.
    expect(findDateGaps(
      [
        { start: '2026-01-01', end: '2026-01-31' },
        { start: '2026-06-01', end: '2026-06-30' },
      ],
      '2026-01-01',
      '2026-06-30',
    )).toEqual([{ start: '2026-02-01', end: '2026-05-31' }]);
  });

  it('finds leading and trailing gaps', () => {
    expect(findDateGaps(
      [{ start: '2026-01-10', end: '2026-01-20' }],
      '2026-01-01',
      '2026-01-31',
    )).toEqual([
      { start: '2026-01-01', end: '2026-01-09' },
      { start: '2026-01-21', end: '2026-01-31' },
    ]);
  });

  it('treats adjacent coverage as gapless', () => {
    expect(findDateGaps(
      [
        { start: '2026-01-01', end: '2026-01-10' },
        { start: '2026-01-11', end: '2026-01-31' },
      ],
      '2026-01-01',
      '2026-01-31',
    )).toEqual([]);
  });

  it('finds a single-day gap', () => {
    expect(findDateGaps(
      [
        { start: '2026-01-01', end: '2026-01-10' },
        { start: '2026-01-12', end: '2026-01-31' },
      ],
      '2026-01-01',
      '2026-01-31',
    )).toEqual([{ start: '2026-01-11', end: '2026-01-11' }]);
  });

  it('ignores coverage entirely outside the requested window', () => {
    expect(findDateGaps(
      [{ start: '2025-01-01', end: '2025-12-31' }],
      '2026-01-01',
      '2026-01-31',
    )).toEqual([{ start: '2026-01-01', end: '2026-01-31' }]);
  });
});

describe('computeDateRangeOverlap', () => {
  it('returns the intersection when ranges overlap', () => {
    expect(computeDateRangeOverlap(
      '2026-01-01', '2026-01-20',
      '2026-01-10', '2026-01-31',
    )).toEqual({ start: '2026-01-10', end: '2026-01-20' });
  });

  it('returns null when ranges are disjoint', () => {
    expect(computeDateRangeOverlap(
      '2026-01-01', '2026-01-10',
      '2026-02-01', '2026-02-10',
    )).toBeNull();
  });

  it('returns a single day when ranges touch at one date', () => {
    expect(computeDateRangeOverlap(
      '2026-01-01', '2026-01-10',
      '2026-01-10', '2026-01-20',
    )).toEqual({ start: '2026-01-10', end: '2026-01-10' });
  });
});
