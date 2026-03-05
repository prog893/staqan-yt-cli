import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_DIR } from './utils';
import { CacheIndex, CacheIndexEntry, ReportMetadata, CacheCoverage } from '../types';
import { debug } from './utils';

// Cache directory structure
const DATA_DIR = path.join(CONFIG_DIR, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'reports');
const CACHE_INDEX_PATH = path.join(DATA_DIR, 'cache-index.json');

// Cache index version (for future migrations)
const CACHE_INDEX_VERSION = '1.0';

/**
 * Ensure cache directory structure exists
 */
export async function ensureCacheDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.access(CACHE_DIR);
  } catch {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cache directory path
 */
export function getCacheDir(): string {
  return CACHE_DIR;
}

/**
 * Get reports subdirectory path
 */
export function getReportsDir(): string {
  return CACHE_DIR;
}

/**
 * Load global cache index
 */
export async function loadCacheIndex(): Promise<CacheIndex> {
  try {
    await ensureCacheDir();
    const data = await fs.readFile(CACHE_INDEX_PATH, 'utf-8');
    const index = JSON.parse(data) as CacheIndex;

    // Validate structure
    if (!index.version || !Array.isArray(index.entries)) {
      throw new Error('Invalid cache index structure');
    }

    return index;
  } catch {
    // File doesn't exist or is invalid - return empty index
    debug('Cache index not found or invalid, creating new one');
    return {
      version: CACHE_INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      entries: [],
    };
  }
}

/**
 * Save global cache index
 */
export async function saveCacheIndex(index: CacheIndex): Promise<void> {
  await ensureCacheDir();
  index.lastUpdated = new Date().toISOString();
  await fs.writeFile(CACHE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Add entry to cache index
 */
export async function addCacheEntry(entry: CacheIndexEntry): Promise<void> {
  const index = await loadCacheIndex();

  // Check if entry already exists
  const existingIndex = index.entries.findIndex(e => e.reportId === entry.reportId);
  if (existingIndex >= 0) {
    // Update existing entry
    index.entries[existingIndex] = entry;
  } else {
    // Add new entry
    index.entries.push(entry);
  }

  await saveCacheIndex(index);
  debug(`Added cache entry: ${entry.reportId}`);
}

/**
 * Remove entry from cache index
 */
export async function removeCacheEntry(reportId: string): Promise<void> {
  const index = await loadCacheIndex();
  index.entries = index.entries.filter(e => e.reportId !== reportId);
  await saveCacheIndex(index);
  debug(`Removed cache entry: ${reportId}`);
}

/**
 * Find cached reports for a type and date range
 */
export async function findCachedReports(
  reportTypeId: string,
  startDate: string,
  endDate: string
): Promise<CacheIndexEntry[]> {
  const index = await loadCacheIndex();

  return index.entries.filter(entry => {
    if (entry.reportTypeId !== reportTypeId) {
      return false;
    }

    // Check for overlap with requested range
    const overlap = computeDateRangeOverlap(
      entry.startTime,
      entry.endTime,
      startDate,
      endDate
    );

    return overlap !== null;
  });
}

/**
 * Get report directory path
 */
function getReportTypeDir(reportTypeId: string): string {
  return path.join(CACHE_DIR, reportTypeId);
}

/**
 * Get report file paths
 */
function getReportPaths(reportId: string, reportTypeId: string) {
  const reportTypeDir = getReportTypeDir(reportTypeId);
  return {
    csv: path.join(reportTypeDir, `${reportId}.csv`),
    metadata: path.join(reportTypeDir, `${reportId}.metadata.json`),
  };
}

/**
 * Load report metadata
 */
export async function loadReportMetadata(
  reportId: string,
  reportTypeId: string
): Promise<ReportMetadata | null> {
  const { metadata: metadataPath } = getReportPaths(reportId, reportTypeId);

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
export async function saveReportMetadata(metadata: ReportMetadata): Promise<void> {
  const reportTypeDir = getReportTypeDir(metadata.reportTypeId);
  await fs.mkdir(reportTypeDir, { recursive: true });

  const { metadata: metadataPath } = getReportPaths(metadata.reportId, metadata.reportTypeId);
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  debug(`Saved metadata for: ${metadata.reportId}`);
}

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
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
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

  // Find date range (assuming 'date' column exists)
  const dates = data
    .map(row => row.date)
    .filter(date => date)
    .sort();

  const minDate = dates[0] || '';
  const maxDate = dates[dates.length - 1] || '';

  return { headers, data, minDate, maxDate };
}

/**
 * Read cached report CSV data
 */
export async function readCachedReport(
  reportId: string,
  reportTypeId: string
): Promise<{
  headers: string[];
  data: Record<string, string>[];
} | null> {
  const { csv: csvPath } = getReportPaths(reportId, reportTypeId);

  try {
    // Read CSV data
    const csvData = await fs.readFile(csvPath, 'utf-8');
    const parsed = parseCsvAndExtractRange(csvData);

    // Validate against metadata
    const metadata = await loadReportMetadata(reportId, reportTypeId);

    if (metadata) {
      // Check column match
      if (parsed.headers.join(',') !== metadata.columns.join(',')) {
        debug(`Column mismatch for ${reportId}, expected: ${metadata.columns.join(',')}, got: ${parsed.headers.join(',')}`);
        return null;
      }

      // Check completeness
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
  reportId: string,
  reportTypeId: string,
  csvData: string,
  metadata: ReportMetadata
): Promise<void> {
  const reportTypeDir = getReportTypeDir(reportTypeId);
  await fs.mkdir(reportTypeDir, { recursive: true });

  const { csv: csvPath } = getReportPaths(reportId, reportTypeId);

  // Save CSV file
  await fs.writeFile(csvPath, csvData, 'utf-8');

  // Save metadata
  await saveReportMetadata(metadata);

  // Add to cache index
  await addCacheEntry({
    reportId,
    reportTypeId,
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
  reportId: string,
  reportTypeId: string
): Promise<void> {
  const { csv: csvPath, metadata: metadataPath } = getReportPaths(reportId, reportTypeId);

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

  // Remove from cache index
  await removeCacheEntry(reportId);

  debug(`Deleted report from cache: ${reportId}`);
}

/**
 * Compute overlap between two date ranges
 * Returns null if no overlap
 */
export function computeDateRangeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { start: string; end: string } | null {
  const s1 = new Date(start1).getTime();
  const e1 = new Date(end1).getTime();
  const s2 = new Date(start2).getTime();
  const e2 = new Date(end2).getTime();

  const overlapStart = Math.max(s1, s2);
  const overlapEnd = Math.min(e1, e2);

  if (overlapStart > overlapEnd) {
    return null; // No overlap
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
  if (ranges.length === 0) {
    return [];
  }

  // Sort by start date
  const sorted = [...ranges].sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const merged: { start: string; end: string }[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    const lastEnd = new Date(last.end).getTime();
    const currentStart = new Date(current.start).getTime();

    // Check if ranges overlap or are adjacent (within 1 day)
    if (currentStart <= lastEnd + 86400000) {
      // Merge ranges
      const currentEnd = new Date(current.end).getTime();
      if (currentEnd > lastEnd) {
        last.end = current.end;
      }
    } else {
      // No overlap, add as new range
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
  // Sort and merge ranges
  const merged = mergeDateRanges(ranges);

  const gaps: { start: string; end: string }[] = [];
  let current = new Date(requestedStart);

  for (const range of merged) {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);

    // Gap exists if current is before range start
    if (current < rangeStart) {
      gaps.push({
        start: current.toISOString().split('T')[0],
        end: new Date(rangeStart.getTime() - 86400000).toISOString().split('T')[0],
      });
    }

    // Move current to after this range
    const afterRange = new Date(rangeEnd.getTime() + 86400000);
    if (afterRange > current) {
      current = afterRange;
    }
  }

  // Check for gap after last range
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
  reportTypeId: string,
  requestedStart: string,
  requestedEnd: string
): Promise<CacheCoverage> {
  const cachedReports = await findCachedReports(
    reportTypeId,
    requestedStart,
    requestedEnd
  );

  const fullyCovered: string[] = [];
  const partiallyCovered: CacheCoverage['partiallyCovered'] = [];
  const notCovered: string[] = [];

  // If no cached reports, entire range is not covered
  if (cachedReports.length === 0) {
    return {
      fullyCovered: [],
      partiallyCovered: [],
      notCovered: [`${requestedStart}/${requestedEnd}`],
    };
  }

  // Build cached ranges
  const cachedRanges = cachedReports.map(r => ({
    start: r.startTime,
    end: r.endTime,
  }));

  // Find gaps
  const gaps = findDateGaps(cachedRanges, requestedStart, requestedEnd);

  // Classify coverage
  for (const cachedReport of cachedReports) {
    const overlap = computeDateRangeOverlap(
      cachedReport.startTime,
      cachedReport.endTime,
      requestedStart,
      requestedEnd
    );

    if (!overlap) continue;

    // Check if fully covered
    if (overlap.start === cachedReport.startTime &&
        overlap.end === cachedReport.endTime) {
      fullyCovered.push(`${cachedReport.startTime}/${cachedReport.endTime}`);
    } else {
      // Partial coverage
      const missingStart = overlap.start < cachedReport.startTime
        ? overlap.start
        : new Date(new Date(cachedReport.endTime).getTime() + 86400000).toISOString().split('T')[0];

      const missingEnd = overlap.end > cachedReport.endTime
        ? overlap.end
        : new Date(new Date(cachedReport.startTime).getTime() - 86400000).toISOString().split('T')[0];

      partiallyCovered.push({
        range: { start: requestedStart, end: requestedEnd },
        cached: { start: overlap.start, end: overlap.end },
        missing: { start: missingStart, end: missingEnd },
      });
    }
  }

  // Add gaps to notCovered
  for (const gap of gaps) {
    notCovered.push(`${gap.start}/${gap.end}`);
  }

  return {
    fullyCovered,
    partiallyCovered,
    notCovered,
  };
}
