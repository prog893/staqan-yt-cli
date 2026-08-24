/**
 * Pure helpers from the bulk Reporting API data layer.
 *
 * The filesystem-backed cache behaviour lives in cache-store.test.ts; this
 * covers logic that needs no disk and no network.
 */
import { describe, it, expect } from 'bun:test';
import { findSchemaMismatch } from '../lib/reports';

/**
 * Schema agreement across the reports merged into one result (#177).
 *
 * Measured against the local archive on 2026-08-24 (3,683 reports across 20
 * report types, 2026-01-22 to 2026-08-22): every type had exactly one column
 * set, so this returns undefined on all of today's real data. It guards a
 * future report-type revision, which is why the cases below are synthetic.
 *
 * YouTube versions a report type in its own ID (`channel_basic_a3`), so a
 * column set is not supposed to change under a fixed `--type`. If it ever
 * does, the formatters union the keys and emit a column populated for some
 * dates and blank for others, and nothing distinguishes that blank from a
 * genuine empty value.
 */
describe('findSchemaMismatch (#177)', () => {
  const cols = (...columns: string[]) => ({ source: columns.join('|'), columns });

  it('returns undefined when every report has the same columns', () => {
    expect(findSchemaMismatch([
      { source: 'a', columns: ['date', 'views', 'engaged_views'] },
      { source: 'b', columns: ['date', 'views', 'engaged_views'] },
    ])).toBeUndefined();
  });

  it('ignores column order', () => {
    // The header row order is YouTube's, and a reordering is not a schema
    // change: the rows are keyed by name, so the merged output is unaffected.
    expect(findSchemaMismatch([
      { source: 'a', columns: ['date', 'views', 'engaged_views'] },
      { source: 'b', columns: ['engaged_views', 'date', 'views'] },
    ])).toBeUndefined();
  });

  it('returns undefined for a single report', () => {
    // One report cannot disagree with itself, and this is the common case:
    // a narrow date range served by exactly one archived report.
    expect(findSchemaMismatch([cols('date', 'views')])).toBeUndefined();
  });

  it('returns undefined for no reports', () => {
    expect(findSchemaMismatch([])).toBeUndefined();
  });

  it('reports a column missing from one of several reports', () => {
    const m = findSchemaMismatch([
      { source: 'old', columns: ['date', 'views'] },
      { source: 'new', columns: ['date', 'views', 'engaged_views'] },
      { source: 'new2', columns: ['date', 'views', 'engaged_views'] },
    ]);
    expect(m?.totalReports).toBe(3);
    expect(m?.inconsistentColumns).toEqual([{ column: 'engaged_views', presentIn: 2 }]);
    expect(m?.message).toContain('engaged_views (in 2/3)');
  });

  it('reports columns unique to either side, not just additions', () => {
    // A revision can drop a column as well as add one, and both directions
    // produce the same ambiguous blank cell.
    const m = findSchemaMismatch([
      { source: 'a', columns: ['date', 'dropped'] },
      { source: 'b', columns: ['date', 'added'] },
    ]);
    expect(m?.inconsistentColumns).toEqual([
      { column: 'added', presentIn: 1 },
      { column: 'dropped', presentIn: 1 },
    ]);
  });

  it('lists inconsistent columns alphabetically', () => {
    // Stable order so the warning text does not churn with report load order.
    const m = findSchemaMismatch([
      { source: 'a', columns: ['date'] },
      { source: 'b', columns: ['date', 'zeta', 'alpha', 'mid'] },
    ]);
    expect(m?.inconsistentColumns.map(c => c.column)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('does not let a duplicated header hide a real gap', () => {
    // A column repeated within one report must count once. Counting it twice
    // would reach the report total and classify a genuinely missing column as
    // present everywhere.
    const m = findSchemaMismatch([
      { source: 'a', columns: ['date', 'views', 'views'] },
      { source: 'b', columns: ['date'] },
    ]);
    expect(m?.inconsistentColumns).toEqual([{ column: 'views', presentIn: 1 }]);
  });

  it('explains that a blank cell is not a zero', () => {
    const m = findSchemaMismatch([
      { source: 'a', columns: ['date', 'views'] },
      { source: 'b', columns: ['date'] },
    ]);
    expect(m?.message).toContain('indistinguishable');
  });
});
