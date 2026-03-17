import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_DIR, debug, warning } from './utils';
import { CacheIndex, CacheIndexEntry, ReportMetadata, CacheCoverage } from '../types';

// Base data directory
const DATA_DIR = path.join(CONFIG_DIR, 'data');

// Cache index version
const CACHE_INDEX_VERSION = '2.0';

// ─── Per-channel path helpers ──────────────────────────────────────────────────

function getChannelDataDir(channelId: string): string {
  return path.join(DATA_DIR, channelId);
}

function getChannelReportsDir(channelId: string): string {
  return path.join(DATA_DIR, channelId, 'reports');
}

function getChannelCacheIndexPath(channelId: string): string {
  return path.join(DATA_DIR, channelId, 'reports', 'cache-index.json');
}

/**
 * Ensure per-channel cache directory structure exists
 */
export async function ensureCacheDir(channelId: string): Promise<void> {
  const channelDir = getChannelDataDir(channelId);
  const reportsDir = getChannelReportsDir(channelId);

  // Check if new channel directory is being created
  let isNew = false;
  try {
    await fs.access(channelDir);
  } catch {
    isNew = true;
  }

  await fs.mkdir(reportsDir, { recursive: true });

  if (isNew) {
    debug(`Created new channel directory: ${channelDir}`);
  }
}

// ─── Cache index ──────────────────────────────────────────────────────────────

/**
 * Load per-channel cache index
 */
export async function loadCacheIndex(channelId: string): Promise<CacheIndex> {
  try {
    await ensureCacheDir(channelId);
    const data = await fs.readFile(getChannelCacheIndexPath(channelId), 'utf-8');
    const index = JSON.parse(data) as CacheIndex;

    if (!index.version || !Array.isArray(index.entries)) {
      throw new Error('Invalid cache index structure');
    }

    // Validate version matches expected format
    if (index.version !== CACHE_INDEX_VERSION) {
      const indexPath = getChannelCacheIndexPath(channelId);
      warning(`Cache index is outdated (v${index.version} → v${CACHE_INDEX_VERSION}). Cached report data cleared.`);
      warning(`  To rebuild: staqan-yt fetch-reports --channel ${channelId}`);
      warning(`  To delete:  ${indexPath}`);
      return {
        version: CACHE_INDEX_VERSION,
        lastUpdated: new Date().toISOString(),
        entries: [],
      };
    }

    return index;
  } catch {
    debug(`Cache index not found or invalid for channel ${channelId}, creating new one`);
    return {
      version: CACHE_INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }
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
 * Load report metadata
 */
export async function loadReportMetadata(
  channelId: string,
  reportId: string,
  reportTypeId: string
): Promise<ReportMetadata | null> {
  const { metadata: metadataPath } = getReportPaths(channelId, reportId, reportTypeId);

  try {
    const data = await fs.readFile(metadataPath, 'utf-8');
    return JSON.parse(data) as ReportMetadata;
  } catch {
    return null;
  }
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
        debug(`Column mismatch for ${reportId}`);
        return null;
      }

      if (!metadata.isComplete) {
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

  try {
    await fs.unlink(csvPath);
  } catch {
    // Ignore if file doesn't exist
  }

  try {
    await fs.unlink(metadataPath);
  } catch {
    // Ignore if file doesn't exist
  }

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
 * Merge overlapping/adjacent date ranges
 */
export function mergeDateRanges(
  ranges: { start: string; end: string }[]
): { start: string; end: string }[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const merged: { start: string; end: string }[] = [sorted[0]];

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
      merged.push(current);
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
    return {
      fullyCovered: [],
      partiallyCovered: [],
      notCovered: [`${requestedStart}/${requestedEnd}`],
    };
  }

  const fullyCovered: string[] = [];
  const partiallyCovered: CacheCoverage['partiallyCovered'] = [];
  const notCovered: string[] = [];

  const cachedRanges = cachedReports.map(r => ({
    start: r.startTime.split('T')[0],
    end: r.endTime.split('T')[0],
  }));

  const gaps = findDateGaps(cachedRanges, requestedStart, requestedEnd);

  for (const cachedReport of cachedReports) {
    const cachedStart = cachedReport.startTime.split('T')[0];
    const cachedEnd = cachedReport.endTime.split('T')[0];

    const overlap = computeDateRangeOverlap(
      cachedStart,
      cachedEnd,
      requestedStart,
      requestedEnd
    );

    if (!overlap) continue;

    if (overlap.start === cachedStart && overlap.end === cachedEnd) {
      fullyCovered.push(`${cachedStart}/${cachedEnd}`);
    } else {
      const missingStart = overlap.start < cachedStart
        ? overlap.start
        : new Date(new Date(cachedEnd).getTime() + 86400000).toISOString().split('T')[0];

      const missingEnd = overlap.end > cachedEnd
        ? overlap.end
        : new Date(new Date(cachedStart).getTime() - 86400000).toISOString().split('T')[0];

      partiallyCovered.push({
        range: { start: requestedStart, end: requestedEnd },
        cached: { start: overlap.start, end: overlap.end },
        missing: { start: missingStart, end: missingEnd },
      });
    }
  }

  for (const gap of gaps) {
    notCovered.push(`${gap.start}/${gap.end}`);
  }

  return { fullyCovered, partiallyCovered, notCovered };
}
