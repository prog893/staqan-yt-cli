import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_DIR, debug, warning, loadJsonIfPresent, unlinkIfPresent } from './utils';
import { CacheIndex, CacheIndexEntry, ReportMetadata, CacheCoverage } from '../types';

// Base data directory
/**
 * Root of the on-disk report archive.
 *
 * Resolved per call rather than captured once at import, and overridable via
 * `STAQAN_YT_DATA_DIR`. The override exists so the filesystem-dependent cache
 * layer can be tested against a temp directory instead of the real archive:
 * the module-level constant this replaced was baked in at import time, which
 * made redirecting it from a test impossible once any other module had loaded
 * it. Not intended for normal use; unset, behaviour is unchanged.
 */
export function getDataDir(): string {
  return process.env.STAQAN_YT_DATA_DIR || path.join(CONFIG_DIR, 'data');
}

// Cache index version
const CACHE_INDEX_VERSION = '2.0';

// ─── Per-channel path helpers ──────────────────────────────────────────────────

function getChannelReportsDir(channelId: string): string {
  return path.join(getDataDir(), channelId, 'reports');
}

function getChannelCacheIndexPath(channelId: string): string {
  return path.join(getDataDir(), channelId, 'reports', 'cache-index.json');
}

/**
 * Ensure per-channel cache directory structure exists
 *
 * Note: mkdir with { recursive: true } is idempotent — it succeeds
 * if the directory already exists, so we call it directly without
 * an access check. This avoids the TOCTOU window and is more efficient.
 */
export async function ensureCacheDir(channelId: string): Promise<void> {
  const reportsDir = getChannelReportsDir(channelId);
  await fs.mkdir(reportsDir, { recursive: true });
  debug(`Ensured cache directory exists: ${reportsDir}`);
}

// ─── Cache index ──────────────────────────────────────────────────────────────

/**
 * Whether a parsed index member carries the fields consumers read off it.
 *
 * Only the required fields are checked. `createTime` and `row_count` are
 * optional by design, and `fileSize` is not read on any path that a damaged
 * index would reach first.
 */
function isCacheIndexEntry(entry: unknown): entry is CacheIndexEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.reportId === 'string' &&
    typeof e.reportTypeId === 'string' &&
    typeof e.channelId === 'string' &&
    typeof e.startTime === 'string' &&
    typeof e.endTime === 'string' &&
    typeof e.downloadedAt === 'string' &&
    typeof e.expiresAt === 'string'
  );
}

/**
 * Load per-channel cache index
 */
export async function loadCacheIndex(channelId: string, channelHandle?: string): Promise<CacheIndex> {
  await ensureCacheDir(channelId);

  const indexPath = getChannelCacheIndexPath(channelId);
  const channelArg = channelHandle ?? channelId;
  const freshIndex = (): CacheIndex => ({
    version: CACHE_INDEX_VERSION,
    lastUpdated: new Date().toISOString(),
    entries: [],
  });

  // Absence is the normal first run for a channel and stays silent. Damage
  // warns: the archive files remain on disk, but an empty index hides them, so
  // the next fetch re-downloads reports already held locally.
  let index: CacheIndex | null;
  try {
    index = await loadJsonIfPresent<CacheIndex>(indexPath, 'cache index');
  } catch (err) {
    warning(`Cache index unreadable, treating the archive as empty: ${(err as Error).message}`);
    warning(`  To rebuild: staqan-yt fetch-reports --channel ${channelArg}`);
    warning(`  Index file: ${indexPath}`);
    return freshIndex();
  }

  if (!index) {
    debug(`No cache index for channel ${channelId}, starting a new one`);
    return freshIndex();
  }

  // Parsed, but not the shape an index has. Same class as a parse failure:
  // the file exists and cannot be used, so it is reported the same way.
  // Entries are checked individually, not just the array: consumers read
  // fields off each one, so a single malformed member would otherwise get past
  // here and throw somewhere with no mention of the index at all.
  if (!index.version || !Array.isArray(index.entries) || !index.entries.every(isCacheIndexEntry)) {
    warning(`Cache index has an unexpected structure, treating the archive as empty.`);
    warning(`  To rebuild: staqan-yt fetch-reports --channel ${channelArg}`);
    warning(`  Index file: ${indexPath}`);
    return freshIndex();
  }

  if (index.version !== CACHE_INDEX_VERSION) {
    warning(`Cache index is outdated (v${index.version} → v${CACHE_INDEX_VERSION}). Cached report data cleared.`);
    warning(`  To rebuild: staqan-yt fetch-reports --channel ${channelArg}`);
    warning(`  To delete:  ${indexPath}`);
    return freshIndex();
  }

  return index;
}

/**
 * Save per-channel cache index
 */
export async function saveCacheIndex(channelId: string, index: CacheIndex): Promise<void> {
  await ensureCacheDir(channelId);
  index.lastUpdated = new Date().toISOString();
  await fs.writeFile(getChannelCacheIndexPath(channelId), JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Add entry to cache index
 */
export async function addCacheEntry(channelId: string, entry: CacheIndexEntry): Promise<void> {
  const index = await loadCacheIndex(channelId);

  const existingIndex = index.entries.findIndex(e => e.reportId === entry.reportId);
  if (existingIndex >= 0) {
    index.entries[existingIndex] = entry;
  } else {
    index.entries.push(entry);
  }

  await saveCacheIndex(channelId, index);
  debug(`Added cache entry: ${entry.reportId}`);
}

/**
 * Remove entry from cache index
 */
export async function removeCacheEntry(channelId: string, reportId: string): Promise<void> {
  const index = await loadCacheIndex(channelId);
  index.entries = index.entries.filter(e => e.reportId !== reportId);
  await saveCacheIndex(channelId, index);
  debug(`Removed cache entry: ${reportId}`);
}

/**
 * Find cached reports for a type and date range (filtered by channelId)
 */
/**
 * Check if a specific report (by reportId) is already cached.
 * Each YouTube Reporting API report has a unique ID — matching by ID
 * avoids false-positive overlap when adjacent reports share a boundary
 * date (e.g. 04-20→04-21 and 04-21→04-22 both contain "04-21").
 */
export async function isReportCached(
  channelId: string,
  reportId: string
): Promise<boolean> {
  const index = await loadCacheIndex(channelId);
  return index.entries.some(entry => entry.reportId === reportId);
}

/**
 * Collapse cached reports to one per API window, keeping the newest.
 *
 * YouTube reissues a report for the same [startTime, endTime] window when it
 * has corrected figures, so the cache legitimately accumulates several
 * reportIds per window (58% of windows for channel_reach_basic_a1 on a real
 * archive). Loading all of them returns both the stale and the corrected rows:
 * same date and video_id, different metric values, which silently double-counts
 * any aggregation. The API path has always collapsed these via createTime;
 * this is the cache-side equivalent.
 *
 * Recency key, in order of preference:
 *  1. `createTime` from the API, persisted since this was fixed.
 *  2. `expiresAt`, for entries archived before createTime was stored. Expiry is
 *     createTime plus 30 days (backfill reports, created within ~4 days of the
 *     job) or 60 days (regular). Within one job createTime only increases and
 *     the added window never shrinks, so ordering by expiresAt agrees with
 *     ordering by createTime.
 *  3. `downloadedAt`, as a last resort if expiry is missing or equal.
 */
export function pickNewestPerWindow(entries: CacheIndexEntry[]): CacheIndexEntry[] {
  const newest = new Map<string, CacheIndexEntry>();

  for (const entry of entries) {
    const key = `${entry.startTime}|${entry.endTime}`;
    const prev = newest.get(key);
    if (!prev || isNewerReport(entry, prev)) {
      newest.set(key, entry);
    }
  }

  return [...newest.values()];
}

/**
 * Compare two ISO 8601 instants chronologically. Returns a negative number
 * when `a` is earlier, positive when later, 0 when equal or incomparable.
 *
 * String comparison is NOT safe here. The Reporting API returns createTime
 * with microsecond precision (2026-07-26T13:23:08.447428Z), and any variation
 * in that precision breaks lexical ordering: "…08Z" sorts after "…08.000001Z"
 * because "." (0x2E) is below "Z" (0x5A), and "…08.447428Z" sorts after
 * "…08.45Z" even though it is 3ms earlier. Parsing to epoch milliseconds is
 * exact for every format the API emits.
 *
 * Date.parse truncates to milliseconds, which would tie two instants that
 * differ only in microseconds, so sub-millisecond digits are compared
 * separately to keep the ordering exact at the precision the API actually
 * emits.
 */
export function compareInstants(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    // Unparseable timestamp: fall back to byte order so behaviour stays
    // deterministic rather than silently treating everything as equal.
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (ta !== tb) return ta - tb;
  // Same millisecond: break the tie on the remaining fractional digits.
  return fractionalNanoseconds(a) - fractionalNanoseconds(b);
}

/**
 * Fractional seconds of an ISO timestamp as nanoseconds, zero-padded so
 * ".45" and ".450000" compare equal and ".000001" is distinguishable from "".
 */
function fractionalNanoseconds(ts: string): number {
  const match = /\.(\d+)/.exec(ts);
  if (!match) return 0;
  return Number(match[1].padEnd(9, '0').slice(0, 9));
}

/** True when `a` is a later reissue than `b`. See pickNewestPerWindow. */
function isNewerReport(a: CacheIndexEntry, b: CacheIndexEntry): boolean {
  if (a.createTime && b.createTime) {
    const byCreate = compareInstants(a.createTime, b.createTime);
    if (byCreate !== 0) return byCreate > 0;
  }
  // Prefer an entry that knows its createTime over one that does not: it was
  // archived after the fix, so it is at least as trustworthy.
  if (Boolean(a.createTime) !== Boolean(b.createTime)) {
    return Boolean(a.createTime);
  }
  if (a.expiresAt && b.expiresAt) {
    const byExpiry = compareInstants(a.expiresAt, b.expiresAt);
    if (byExpiry !== 0) return byExpiry > 0;
  }
  return compareInstants(a.downloadedAt || '', b.downloadedAt || '') > 0;
}

export async function findCachedReports(
  channelId: string,
  reportTypeId: string,
  startDate: string,
  endDate: string
): Promise<CacheIndexEntry[]> {
  const index = await loadCacheIndex(channelId);

  return index.entries.filter(entry => {
    if (entry.channelId !== channelId) return false;
    if (entry.reportTypeId !== reportTypeId) return false;

    const overlap = computeDateRangeOverlap(
      entry.startTime,
      entry.endTime,
      startDate,
      endDate
    );

    return overlap !== null;
  });
}

// ─── Report file paths ────────────────────────────────────────────────────────

function getReportTypeDir(channelId: string, reportTypeId: string): string {
  return path.join(getChannelReportsDir(channelId), reportTypeId);
}

function getReportPaths(channelId: string, reportId: string, reportTypeId: string) {
  const reportTypeDir = getReportTypeDir(channelId, reportTypeId);
  return {
    csv: path.join(reportTypeDir, `${reportId}.csv`),
    metadata: path.join(reportTypeDir, `${reportId}.metadata.json`),
  };
}

// ─── Metadata ────────────────────────────────────────────────────────────────

/**
 * Why a sidecar could not be returned as-is.
 *
 * `absent` is an older or interrupted write and implies nothing is wrong with
 * the report. `damaged` implies the opposite, and the two need different
 * responses, so they are not collapsed into a single null.
 */
export type ReportMetadataLoad =
  | { status: 'ok'; metadata: ReportMetadata }
  | { status: 'absent' }
  | { status: 'damaged'; error: Error };

/**
 * Whether a parsed sidecar carries the fields its consumers read off it.
 *
 * Syntax is not shape. `{}` is valid JSON, and accepting it hands
 * `readCachedReport` a record whose `columns` is undefined: it throws on
 * `.join()`, the surrounding catch turns that into null, and the report drops
 * out of every query with its sidecar left broken. Checking the shape here is
 * what routes that file to the rebuild instead.
 */
function isReportMetadata(value: unknown): value is ReportMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;

  const requiredStrings = [
    'reportId', 'reportTypeId', 'channelId', 'startTime', 'endTime',
    'startTimeActual', 'endTimeActual', 'downloadedAt', 'expiresAt',
  ];
  if (!requiredStrings.every((k) => typeof m[k] === 'string')) return false;
  if (!Array.isArray(m.columns) || !m.columns.every((c) => typeof c === 'string')) return false;
  if (typeof m.fileSize !== 'number') return false;

  // Optional fields are absent or correctly typed, never junk. A rebuilt
  // sidecar legitimately omits jobId, downloadUrl and isComplete.
  const optional: [string, string][] = [
    ['createTime', 'string'], ['jobId', 'string'], ['downloadUrl', 'string'],
    ['isComplete', 'boolean'], ['rebuiltAt', 'string'], ['row_count', 'number'],
  ];
  return optional.every(([k, t]) => m[k] === undefined || typeof m[k] === t);
}

/**
 * Load report metadata, reporting absence and damage separately.
 *
 * A file that parses but is not a metadata record counts as damaged, not ok:
 * it exists and cannot be used, which is the same situation as a syntax error
 * and gets the same repair.
 */
export async function loadReportMetadataResult(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<ReportMetadataLoad> {
  const { metadata: metadataPath } = getReportPaths(channelId, reportId, reportTypeId);

  let parsed: unknown;
  try {
    parsed = await loadJsonIfPresent<unknown>(metadataPath, 'report metadata');
  } catch (err) {
    return { status: 'damaged', error: err as Error };
  }

  if (parsed === null) return { status: 'absent' };
  if (!isReportMetadata(parsed)) {
    return {
      status: 'damaged',
      error: new Error(
        `report metadata (${metadataPath}) parsed but is not a metadata record. ` +
        `Fix the file, or delete it to start over.`
      ),
    };
  }
  return { status: 'ok', metadata: parsed };
}

/**
 * Reconstruct a sidecar for a report whose own sidecar is unreadable.
 *
 * Two sources, both trustworthy, and nothing else:
 *
 * - the **index entry**, which is authoritative for the identity and window
 *   fields and is already held in memory during any query;
 * - the **CSV on disk**, re-measured for `columns` and the actual date range,
 *   rather than inferred from anything.
 *
 * `jobId`, `downloadUrl` and `isComplete` came from an API response that is
 * gone, so they are left absent. Returns null when the rebuild cannot be
 * grounded in both sources, which keeps the caller's fallback explicit instead
 * of handing back a half-populated record.
 *
 * Re-measuring `columns` makes the header check tautological for this one
 * report, which is the honest outcome: the check compares a file against a
 * record of what it was at download time, and once that record is lost it
 * cannot be resurrected, only the current schema recorded afresh.
 */
export async function rebuildReportMetadata(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<ReportMetadata | null> {
  const index = await loadCacheIndex(channelId);
  const entry = index.entries.find(
    (e) => e.reportId === reportId && e.reportTypeId === reportTypeId
  );
  if (!entry) {
    debug(`Cannot rebuild metadata for ${reportId}: no index entry`);
    return null;
  }

  const { csv: csvPath } = getReportPaths(channelId, reportId, reportTypeId);
  let parsed: ReturnType<typeof parseCsvAndExtractRange>;
  try {
    parsed = parseCsvAndExtractRange(await fs.readFile(csvPath, 'utf-8'));
  } catch (err) {
    debug(`Cannot rebuild metadata for ${reportId}: ${(err as Error).message}`);
    return null;
  }

  const rebuilt: ReportMetadata = {
    reportId: entry.reportId,
    reportTypeId: entry.reportTypeId,
    channelId: entry.channelId,
    startTime: entry.startTime,
    endTime: entry.endTime,
    createTime: entry.createTime,
    downloadedAt: entry.downloadedAt,
    expiresAt: entry.expiresAt,
    fileSize: entry.fileSize,
    row_count: entry.row_count,
    columns: parsed.headers,
    startTimeActual: parsed.minDate,
    endTimeActual: parsed.maxDate,
    rebuiltAt: new Date().toISOString(),
  };

  await saveReportMetadata(channelId, rebuilt);
  return rebuilt;
}

/**
 * Load report metadata, rebuilding it if the file on disk is damaged.
 *
 * Absence stays silent and returns null, which every caller already treats as
 * "no record". Damage is reported and repaired where possible, because the
 * alternative is what #192 describes: the sidecar is the only thing standing
 * between a corrupted CSV and its consumer, and returning null for a damaged
 * one disables that check exactly when a second corruption has occurred.
 */
export async function loadReportMetadata(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<ReportMetadata | null> {
  const result = await loadReportMetadataResult(channelId, reportId, reportTypeId);

  if (result.status === 'ok') return result.metadata;
  if (result.status === 'absent') return null;

  warning(`Report metadata unreadable, rebuilding it: ${result.error.message}`);
  const rebuilt = await rebuildReportMetadata(channelId, reportId, reportTypeId);
  if (!rebuilt) {
    warning(`  Rebuild failed for ${reportId}. Its cached CSV cannot be validated.`);
    return null;
  }

  warning(`  Rebuilt ${reportId} from the cache index and the CSV on disk.`);
  warning(`  Completeness was not recorded at download time and is not inferred.`);
  return rebuilt;
}

/**
 * Save report metadata
 */
export async function saveReportMetadata(channelId: string, metadata: ReportMetadata): Promise<void> {
  const reportTypeDir = getReportTypeDir(channelId, metadata.reportTypeId);
  await fs.mkdir(reportTypeDir, { recursive: true });

  const { metadata: metadataPath } = getReportPaths(channelId, metadata.reportId, metadata.reportTypeId);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  debug(`Saved metadata for: ${metadata.reportId}`);
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

/**
 * Parse CSV line properly handling quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Parse CSV and extract date range
 */
export function parseCsvAndExtractRange(csvData: string): {
  headers: string[];
  data: Record<string, string>[];
  minDate: string;
  maxDate: string;
} {
  const lines = csvData.trim().split('\n');
  const headers = parseCsvLine(lines[0]);

  const data = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = values[i] || '';
    });
    return obj;
  });

  const dates = data
    .map(row => row.date)
    .filter(date => date)
    .sort();

  const minDate = dates[0] || '';
  const maxDate = dates[dates.length - 1] || '';

  return { headers, data, minDate, maxDate };
}

// ─── Report cache operations ──────────────────────────────────────────────────

/**
 * Read cached report CSV data
 */
export async function readCachedReport(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<{
  headers: string[];
  data: Record<string, string>[];
} | null> {
  const { csv: csvPath } = getReportPaths(channelId, reportId, reportTypeId);

  try {
    const csvData = await fs.readFile(csvPath, 'utf-8');
    const parsed = parseCsvAndExtractRange(csvData);

    const metadata = await loadReportMetadata(channelId, reportId, reportTypeId);

    if (metadata) {
      if (parsed.headers.join(',') !== metadata.columns.join(',')) {
        debug(`Column mismatch for ${reportId}, expected: ${metadata.columns.join(',')}, got: ${parsed.headers.join(',')}`);
        return null;
      }

      // `=== false`, not falsiness: absent means completeness was never
      // recorded, which is the state of a rebuilt sidecar, and rejecting it
      // would discard a CSV that is almost certainly fine.
      if (metadata.isComplete === false) {
        debug(`Report ${reportId} marked as incomplete`);
        return null;
      }
    }

    return parsed;
  } catch (err) {
    debug(`Failed to read cached report ${reportId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Save report to cache
 */
export async function saveReportToCache(
  channelId: string,
  reportId: string,
  reportTypeId: string,
  csvData: string,
  metadata: ReportMetadata
): Promise<void> {
  const reportTypeDir = getReportTypeDir(channelId, reportTypeId);
  await fs.mkdir(reportTypeDir, { recursive: true });

  const { csv: csvPath } = getReportPaths(channelId, reportId, reportTypeId);

  await fs.writeFile(csvPath, csvData, 'utf-8');
  await saveReportMetadata(channelId, metadata);

  await addCacheEntry(channelId, {
    reportId,
    reportTypeId,
    channelId,
    startTime: metadata.startTime,
    endTime: metadata.endTime,
    // Carried into the index so pickNewestPerWindow can order reissues of the
    // same window without opening every metadata file.
    createTime: metadata.createTime,
    downloadedAt: metadata.downloadedAt,
    expiresAt: metadata.expiresAt,
    fileSize: metadata.fileSize,
    row_count: metadata.row_count,
  });

  debug(`Saved report to cache: ${reportId}`);
}

/**
 * Delete report from cache
 */
export async function deleteReportFromCache(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<void> {
  const { csv: csvPath, metadata: metadataPath } = getReportPaths(channelId, reportId, reportTypeId);

  // Either file already being gone is fine. Anything else leaves the payload on
  // disk, and dropping the index entry below would orphan it: the archive would
  // still hold the bytes while nothing could find or re-download them. Throw
  // before the index is touched so the two stay consistent.
  await unlinkIfPresent(csvPath);
  await unlinkIfPresent(metadataPath);

  await removeCacheEntry(channelId, reportId);
  debug(`Deleted report from cache: ${reportId}`);
}

// ─── Date range utilities ─────────────────────────────────────────────────────

/**
 * Compute overlap between two date ranges
 * Normalizes all inputs to date-only (YYYY-MM-DD) before comparison
 * Returns null if no overlap
 */
export function computeDateRangeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { start: string; end: string } | null {
  // Normalize to date-only strings (handle both YYYY-MM-DD and ISO timestamps)
  const d1 = start1.split('T')[0];
  const d2 = end1.split('T')[0];
  const d3 = start2.split('T')[0];
  const d4 = end2.split('T')[0];

  const s1 = new Date(d1).getTime();
  const e1 = new Date(d2).getTime();
  const s2 = new Date(d3).getTime();
  const e2 = new Date(d4).getTime();

  const overlapStart = Math.max(s1, s2);
  const overlapEnd = Math.min(e1, e2);

  if (overlapStart > overlapEnd) {
    return null;
  }

  return {
    start: new Date(overlapStart).toISOString().split('T')[0],
    end: new Date(overlapEnd).toISOString().split('T')[0],
  };
}

/**
 * Merge overlapping/adjacent date ranges.
 *
 * Returns fresh objects and never mutates the caller's input. `[...ranges]`
 * is only a shallow copy, so the previous implementation wrote through to the
 * caller's own range objects: it seeded `merged` with `sorted[0]` and then
 * extended `last.end` in place. `analyzeCacheCoverage` hit this
 * directly: it passes the same `{start,end}` objects to `findDateGaps` that
 * it afterwards classifies as fully/partially covered, so merging two
 * adjacent cached reports silently widened the first report's end date and
 * mis-classified its coverage (loading the same cached report twice and
 * inflating the reported cached-report count).
 */
export function mergeDateRanges(
  ranges: { start: string; end: string }[]
): { start: string; end: string }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const merged: { start: string; end: string }[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    const lastEnd = new Date(last.end).getTime();
    const currentStart = new Date(current.start).getTime();

    if (currentStart <= lastEnd + 86400000) {
      const currentEnd = new Date(current.end).getTime();
      if (currentEnd > lastEnd) {
        last.end = current.end;
      }
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Find gaps in date coverage
 */
export function findDateGaps(
  ranges: { start: string; end: string }[],
  requestedStart: string,
  requestedEnd: string
): { start: string; end: string }[] {
  const merged = mergeDateRanges(ranges);
  const gaps: { start: string; end: string }[] = [];
  let current = new Date(requestedStart);

  for (const range of merged) {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);

    if (current < rangeStart) {
      gaps.push({
        start: current.toISOString().split('T')[0],
        end: new Date(rangeStart.getTime() - 86400000).toISOString().split('T')[0],
      });
    }

    const afterRange = new Date(rangeEnd.getTime() + 86400000);
    if (afterRange > current) {
      current = afterRange;
    }
  }

  const requestedEndDate = new Date(requestedEnd);
  if (current <= requestedEndDate) {
    gaps.push({
      start: current.toISOString().split('T')[0],
      end: requestedEnd,
    });
  }

  return gaps;
}

/**
 * Convert YYYYMMDD string to YYYY-MM-DD for consistent date handling
 */
export function normalizeDate(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}\d{2}\d{2}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  // Handle ISO timestamps
  return d.split('T')[0];
}

/**
 * Get actual data dates for a cached report by reading its metadata file.
 * The metadata file always stores startTimeActual/endTimeActual (parsed from CSV).
 * We use these instead of the API report time windows for gap analysis,
 * because API windows span 2 calendar days and overlap with adjacent reports.
 */
export async function getActualDates(
  entry: CacheIndexEntry,
  channelId: string
): Promise<{ start: string; end: string }> {
  const metadata = await loadReportMetadata(channelId, entry.reportId, entry.reportTypeId);
  if (metadata?.startTimeActual && metadata?.endTimeActual) {
    return {
      start: normalizeDate(metadata.startTimeActual),
      end: normalizeDate(metadata.endTimeActual),
    };
  }

  // Last resort: use API time windows (may have overlap issues)
  return {
    start: entry.startTime.split('T')[0],
    end: entry.endTime.split('T')[0],
  };
}

/**
 * Analyze cache coverage for requested date range
 */
export async function analyzeCacheCoverage(
  channelId: string,
  reportTypeId: string,
  requestedStart: string,
  requestedEnd: string
): Promise<CacheCoverage> {
  const cachedReports = await findCachedReports(
    channelId,
    reportTypeId,
    requestedStart,
    requestedEnd
  );

  if (cachedReports.length === 0) {
    return { missingRanges: [{ start: requestedStart, end: requestedEnd }] };
  }

  // Collapse reissues first so coverage reflects the reports that will
  // actually be loaded, then subtract their real data windows from the
  // request. findDateGaps handles sorting, merging and adjacency.
  const cachedRanges = await Promise.all(
    pickNewestPerWindow(cachedReports).map((entry) => getActualDates(entry, channelId))
  );

  return { missingRanges: findDateGaps(cachedRanges, requestedStart, requestedEnd) };
}
