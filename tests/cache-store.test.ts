/**
 * Filesystem-backed tests for the report cache.
 *
 * The pure date helpers are covered in cache.test.ts. These exercise the parts
 * that actually touch disk (index, dedup, coverage), which is where the bugs
 * that unit tests missed on PR #158 lived. `STAQAN_YT_DATA_DIR` redirects the
 * archive root at call time so nothing here can reach the real archive.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  analyzeCacheCoverage,
  compareInstants,
  findCachedReports,
  getDataDir,
  loadCacheIndex,
  pickNewestPerWindow,
  readCachedReport,
  saveReportToCache,
} from '../lib/cache';
import type { CacheIndexEntry, ReportMetadata } from '../types';

const CHANNEL = 'UCtesttesttesttesttest0';
const TYPE = 'channel_reach_basic_a1';

let tmpRoot: string;
let previousDataDir: string | undefined;

beforeEach(async () => {
  previousDataDir = process.env.STAQAN_YT_DATA_DIR;
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'staqan-cache-test-'));
  process.env.STAQAN_YT_DATA_DIR = tmpRoot;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.STAQAN_YT_DATA_DIR;
  else process.env.STAQAN_YT_DATA_DIR = previousDataDir;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

/** Build a report CSV whose rows land on the given YYYYMMDD dates. */
function csvFor(dates: string[], impressions: string): string {
  const header = 'date,channel_id,video_id,video_thumbnail_impressions';
  const rows = dates.map((d) => `${d},${CHANNEL},vid00000001,${impressions}`);
  return [header, ...rows].join('\n');
}

function metadataFor(over: Partial<ReportMetadata> & { reportId: string }): ReportMetadata {
  return {
    reportTypeId: TYPE,
    channelId: CHANNEL,
    jobId: 'job-1',
    startTime: '2026-03-01T08:00:00Z',
    endTime: '2026-03-02T08:00:00Z',
    startTimeActual: '20260301',
    endTimeActual: '20260301',
    downloadedAt: '2026-03-03T00:00:00Z',
    expiresAt: '2026-05-01T00:00:00Z',
    downloadUrl: 'https://example.invalid/report',
    columns: ['date', 'channel_id', 'video_id', 'video_thumbnail_impressions'],
    isComplete: true,
    fileSize: 100,
    row_count: 1,
    ...over,
  } as ReportMetadata;
}

async function store(meta: ReportMetadata, csv: string) {
  await saveReportToCache(CHANNEL, meta.reportId, TYPE, csv, meta);
}

describe('data dir redirection', () => {
  it('resolves the archive root from STAQAN_YT_DATA_DIR at call time', () => {
    expect(getDataDir()).toBe(tmpRoot);
  });
});

describe('save/read round trip', () => {
  it('stores a report and reads its rows back', async () => {
    await store(
      metadataFor({ reportId: 'r1' }),
      csvFor(['20260301'], '10'),
    );
    const read = await readCachedReport(CHANNEL, 'r1', TYPE);
    expect(read).not.toBeNull();
    expect(read!.data).toHaveLength(1);
    expect(read!.data[0].video_thumbnail_impressions).toBe('10');
  });

  it('persists createTime into the index entry', async () => {
    await store(
      metadataFor({ reportId: 'r1', createTime: '2026-03-02T10:00:00Z' }),
      csvFor(['20260301'], '10'),
    );
    const found = await findCachedReports(CHANNEL, TYPE, '2026-03-01', '2026-03-05');
    expect(found).toHaveLength(1);
    expect(found[0].createTime).toBe('2026-03-02T10:00:00Z');
  });
});

describe('pickNewestPerWindow', () => {
  const base = (over: Partial<CacheIndexEntry>): CacheIndexEntry => ({
    reportId: 'x',
    reportTypeId: TYPE,
    channelId: CHANNEL,
    startTime: '2026-03-01T08:00:00Z',
    endTime: '2026-03-02T08:00:00Z',
    downloadedAt: '2026-03-03T00:00:00Z',
    expiresAt: '2026-05-01T00:00:00Z',
    fileSize: 10,
    ...over,
  });

  it('keeps one entry per window', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'old', createTime: '2026-03-02T00:00:00Z' }),
      base({ reportId: 'new', createTime: '2026-03-05T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].reportId).toBe('new');
  });

  it('orders by createTime when both have it', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'new', createTime: '2026-03-09T00:00:00Z', expiresAt: '2026-04-01T00:00:00Z' }),
      base({ reportId: 'old', createTime: '2026-03-02T00:00:00Z', expiresAt: '2026-09-01T00:00:00Z' }),
    ]);
    // createTime wins even though the older report has a later expiry.
    expect(out[0].reportId).toBe('new');
  });

  it('falls back to expiresAt for legacy entries without createTime', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'older', expiresAt: '2026-05-01T00:00:00Z' }),
      base({ reportId: 'newer', expiresAt: '2026-05-06T00:00:00Z' }),
    ]);
    expect(out[0].reportId).toBe('newer');
  });

  it('prefers an entry that knows its createTime over one that does not', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'legacy', expiresAt: '2026-09-01T00:00:00Z' }),
      base({ reportId: 'known', createTime: '2026-03-02T00:00:00Z', expiresAt: '2026-04-01T00:00:00Z' }),
    ]);
    expect(out[0].reportId).toBe('known');
  });

  it('orders createTime chronologically, not lexically', () => {
    // "…00Z" sorts AFTER "…00.000001Z" byte-wise, because "." (0x2E) is below
    // "Z" (0x5A), so string comparison picks the earlier report as newest.
    const out = pickNewestPerWindow([
      base({ reportId: 'earlier', createTime: '2026-03-02T00:00:00Z' }),
      base({ reportId: 'later', createTime: '2026-03-02T00:00:00.000001Z' }),
    ]);
    expect(out[0].reportId).toBe('later');
  });

  it('orders createTime correctly across differing fractional precision', () => {
    // .447428 is 3ms BEFORE .45, but compares as greater byte-wise.
    const out = pickNewestPerWindow([
      base({ reportId: 'earlier', createTime: '2026-07-26T13:23:08.447428Z' }),
      base({ reportId: 'later', createTime: '2026-07-26T13:23:08.45Z' }),
    ]);
    expect(out[0].reportId).toBe('later');
  });

  it('handles the microsecond precision the Reporting API actually returns', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'older', createTime: '2026-07-26T13:23:08.447428Z' }),
      base({ reportId: 'newer', createTime: '2026-07-29T05:30:47.275044Z' }),
    ]);
    expect(out[0].reportId).toBe('newer');
  });

  it('distinguishes createTimes that differ only in microseconds', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'earlier', createTime: '2026-03-02T00:00:00.000001Z' }),
      base({ reportId: 'later', createTime: '2026-03-02T00:00:00.000002Z' }),
    ]);
    expect(out[0].reportId).toBe('later');
  });

  it('treats equivalent fractional spellings as equal', () => {
    // ".45" and ".450000" are the same instant, so neither supersedes the
    // other on createTime and the expiresAt tiebreak decides.
    const out = pickNewestPerWindow([
      base({
        reportId: 'loser',
        createTime: '2026-03-02T00:00:00.45Z',
        expiresAt: '2026-05-01T00:00:00Z',
      }),
      base({
        reportId: 'winner',
        createTime: '2026-03-02T00:00:00.450000Z',
        expiresAt: '2026-05-06T00:00:00Z',
      }),
    ]);
    expect(out[0].reportId).toBe('winner');
  });

  it('compares expiresAt chronologically too', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'earlier', expiresAt: '2026-05-01T00:00:00Z' }),
      base({ reportId: 'later', expiresAt: '2026-05-01T00:00:00.000001Z' }),
    ]);
    expect(out[0].reportId).toBe('later');
  });

  it('stays deterministic when a timestamp is unparseable', () => {
    // Byte-order fallback: "not-a-date" ("n" 0x6E) sorts after "2026-…"
    // ("2" 0x32), so the unparseable entry wins. Pinned rather than accepting
    // either value, so a comparator that returned 0 for unparseable input, or
    // reversed the fallback, would fail here.
    const out = pickNewestPerWindow([
      base({ reportId: 'bad', createTime: 'not-a-date' }),
      base({ reportId: 'good', createTime: '2026-03-02T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].reportId).toBe('bad');
  });

  it('leaves distinct windows untouched', () => {
    const out = pickNewestPerWindow([
      base({ reportId: 'a', startTime: '2026-03-01T08:00:00Z', endTime: '2026-03-02T08:00:00Z' }),
      base({ reportId: 'b', startTime: '2026-03-02T08:00:00Z', endTime: '2026-03-03T08:00:00Z' }),
    ]);
    expect(out.map((e) => e.reportId).sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array for no entries', () => {
    expect(pickNewestPerWindow([])).toEqual([]);
  });
});

describe('compareInstants', () => {
  // Shared by both dedup paths: the cache-side pickNewestPerWindow and the
  // API-side newestByWindow in lib/reports.ts.
  const sign = (n: number) => (n === 0 ? 0 : n > 0 ? 1 : -1);

  it('orders whole seconds against microseconds by time, not bytes', () => {
    expect(sign(compareInstants('2026-03-02T00:00:00.000001Z', '2026-03-02T00:00:00Z'))).toBe(1);
  });

  it('orders differing fractional precision by time, not bytes', () => {
    // .447428 is earlier than .45 despite comparing greater as a string.
    expect(sign(compareInstants('2026-07-26T13:23:08.447428Z', '2026-07-26T13:23:08.45Z'))).toBe(-1);
  });

  it('treats equivalent fractional spellings as equal', () => {
    expect(compareInstants('2026-03-02T00:00:00.45Z', '2026-03-02T00:00:00.450000Z')).toBe(0);
  });

  it('orders plain dates', () => {
    expect(sign(compareInstants('2026-07-29T05:30:47.275044Z', '2026-07-26T13:23:08.447428Z'))).toBe(1);
  });

  it('is antisymmetric', () => {
    const a = '2026-03-02T00:00:00.000001Z';
    const b = '2026-03-02T00:00:02Z';
    expect(sign(compareInstants(a, b))).toBe(-sign(compareInstants(b, a)));
  });

  it('falls back to byte order for unparseable input', () => {
    expect(sign(compareInstants('not-a-date', '2026-03-02T00:00:00Z'))).toBe(1);
    expect(compareInstants('not-a-date', 'not-a-date')).toBe(0);
  });
});

describe('analyzeCacheCoverage', () => {
  it('reports the whole range missing when the cache is empty', async () => {
    const coverage = await analyzeCacheCoverage(CHANNEL, TYPE, '2026-03-01', '2026-03-07');
    expect(coverage.missingRanges).toEqual([{ start: '2026-03-01', end: '2026-03-07' }]);
  });

  it('reports nothing missing when a single report spans the whole request', async () => {
    // The containment case that the old fullyCovered classification got wrong:
    // the request sits strictly inside the cached report's range.
    await store(
      metadataFor({
        reportId: 'wide',
        startTime: '2026-03-01T08:00:00Z',
        endTime: '2026-04-01T08:00:00Z',
        startTimeActual: '20260301',
        endTimeActual: '20260331',
      }),
      csvFor(['20260310', '20260315', '20260320'], '5'),
    );
    const coverage = await analyzeCacheCoverage(CHANNEL, TYPE, '2026-03-10', '2026-03-20');
    expect(coverage.missingRanges).toEqual([]);
  });

  it('reports the interior hole between two disjoint cached reports', async () => {
    await store(
      metadataFor({
        reportId: 'jan',
        startTime: '2026-01-01T08:00:00Z',
        endTime: '2026-02-01T08:00:00Z',
        startTimeActual: '20260101',
        endTimeActual: '20260131',
      }),
      csvFor(['20260101'], '1'),
    );
    await store(
      metadataFor({
        reportId: 'jun',
        startTime: '2026-06-01T08:00:00Z',
        endTime: '2026-07-01T08:00:00Z',
        startTimeActual: '20260601',
        endTimeActual: '20260630',
      }),
      csvFor(['20260601'], '1'),
    );
    const coverage = await analyzeCacheCoverage(CHANNEL, TYPE, '2026-01-01', '2026-06-30');
    expect(coverage.missingRanges).toEqual([{ start: '2026-02-01', end: '2026-05-31' }]);
  });

  it('ignores superseded reissues when computing coverage', async () => {
    // Two reports for the same window: coverage must not change.
    await store(
      metadataFor({ reportId: 'v1', expiresAt: '2026-05-01T00:00:00Z' }),
      csvFor(['20260301'], '5'),
    );
    await store(
      metadataFor({ reportId: 'v2', expiresAt: '2026-05-06T00:00:00Z' }),
      csvFor(['20260301'], '6'),
    );
    const coverage = await analyzeCacheCoverage(CHANNEL, TYPE, '2026-03-01', '2026-03-01');
    expect(coverage.missingRanges).toEqual([]);
  });
});

describe('findCachedReports', () => {
  it('returns reports whose window overlaps the query, including wider ones', async () => {
    await store(
      metadataFor({
        reportId: 'wide',
        startTime: '2026-03-01T08:00:00Z',
        endTime: '2026-04-01T08:00:00Z',
      }),
      csvFor(['20260315'], '5'),
    );
    const found = await findCachedReports(CHANNEL, TYPE, '2026-03-10', '2026-03-20');
    expect(found.map((e) => e.reportId)).toEqual(['wide']);
  });

  it('excludes reports outside the query window', async () => {
    await store(
      metadataFor({
        reportId: 'far',
        startTime: '2025-01-01T08:00:00Z',
        endTime: '2025-01-02T08:00:00Z',
      }),
      csvFor(['20250101'], '5'),
    );
    const found = await findCachedReports(CHANNEL, TYPE, '2026-03-01', '2026-03-07');
    expect(found).toEqual([]);
  });

  it('does not leak reports from another report type', async () => {
    await store(metadataFor({ reportId: 'mine' }), csvFor(['20260301'], '5'));
    const found = await findCachedReports(CHANNEL, 'channel_basic_a3', '2026-03-01', '2026-03-07');
    expect(found).toEqual([]);
  });
});

/**
 * Absence versus damage for the cache index (#195).
 *
 * A missing index is the normal first run for a channel and must stay silent.
 * A damaged one must not, because the archive files remain on disk while an
 * empty index hides every one of them: the next fetch re-downloads work
 * already held locally, then writes an index that no longer references the
 * old files.
 *
 * These assert on the returned value and on stderr, because the regression
 * this guards against was purely a stderr one. The index came back empty in
 * both cases; only the noise differed.
 */
describe('loadCacheIndex: absent vs damaged (#195)', () => {
  // `warning()` goes through console.warn, not process.stderr.write, so the
  // capture has to patch console.warn. Patching the stream instead silently
  // captures nothing and every assertion below passes vacuously.
  const captureWarnings = async (fn: () => Promise<unknown>) => {
    const written: string[] = [];
    const orig = console.warn;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    console.warn = (...args: any[]) => { written.push(args.map(String).join(' ')); };
    try {
      await fn();
    } finally {
      console.warn = orig;
    }
    return written.join('\n');
  };

  it('is silent when no index exists yet', async () => {
    // The cold-start path. Every channel hits this once, so a warning here
    // would fire for everyone on first use.
    const err = await captureWarnings(() => loadCacheIndex('UCcoldstart0000000000'));
    expect(err).toBe('');
  });

  it('returns a fresh empty index when none exists', async () => {
    const index = await loadCacheIndex('UCcoldstart0000000001');
    expect(index.entries).toEqual([]);
    expect(index.version).toBeTruthy();
  });

  it('warns when the index exists but does not parse', async () => {
    const channel = 'UCdamaged00000000000';
    const dir = path.join(tmpRoot, channel, 'reports');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'cache-index.json'), 'not json{', 'utf-8');

    const err = await captureWarnings(() => loadCacheIndex(channel));
    expect(err).toContain('unreadable');
    expect(err).toContain('To rebuild');
  });

  it('warns when the index parses but has the wrong shape', async () => {
    // Valid JSON, not an index. The file exists and cannot be used, which is
    // the same situation as a parse failure and is reported the same way.
    const channel = 'UCwrongshape000000000';
    const dir = path.join(tmpRoot, channel, 'reports');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'cache-index.json'), '{"nope":true}', 'utf-8');

    const err = await captureWarnings(() => loadCacheIndex(channel));
    expect(err).toContain('unexpected structure');
  });
});
