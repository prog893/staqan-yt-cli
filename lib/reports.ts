/**
 * YouTube Reporting API data layer.
 *
 * Download primitives shared by `fetch-reports` and `get-report-data`
 * (issue #101), plus the report-types/jobs/report-data query functions
 * consumed by both the CLI commands and the MCP tools (issue #102 phase 4 —
 * before this, commands/mcp.ts invoked the commands and monkey-patched
 * console.log/error to capture their formatted output).
 *
 * Public surface:
 *   - safeTmpReportPath(reportId)            — sanitize a report ID for /tmp
 *   - downloadOnce(url, token, dest)         — single HTTPS GET, no retry
 *   - downloadReport(report, auth, opts?)    — retry-wrapped download + CSV parse
 *   - fetchReportTypes()                     — list available report types
 *   - fetchReportJobs(params)                — list jobs + per-job report status
 *   - fetchReportData(params)                — cached+fresh report rows for a type
 */

import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import https from 'https';
import path from 'path';
import { google, youtubereporting_v1 } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { debug, progress, validateDateRange, withRateLimitRetry } from './utils';
import {
  analyzeCacheCoverage,
  ensureCacheDir,
  findCachedReports,
  findDateGaps,
  getActualDates,
  normalizeDate,
  parseCsvAndExtractRange,
  readCachedReport,
  saveReportToCache,
} from './cache';
import { getAuthenticatedChannelId, assertChannelMatchesAuthenticated } from './youtube';
import { getConfigValue } from './config';
import { acquireLock, getLockPath } from './lock';
import { CacheIndexEntry } from '../types';

/**
 * Bounds for an unbounded local-archive scan. Used when the Reporting API
 * lists no reports and the archive itself has to define what's available, so
 * there is no API window to anchor a range to (issue #154). YouTube's
 * Reporting API predates neither bound, so this is effectively "everything".
 */
const ARCHIVE_SCAN_START = '1970-01-01';
const ARCHIVE_SCAN_END = '9999-12-31';

/**
 * A minimal slice of `youtube.reports.jobs.list` report shape — both call
 * sites pass the same fields. Defined here so the consumer types are visible
 * without dragging in googleapis.
 */
export interface ReportDownloadInfo {
  id?: string | null;
  downloadUrl?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  createTime?: string | null;
}

/**
 * Anything that can hand back an OAuth access token. `getAuthenticatedClient()`
 * returns this shape, but keeping the parameter structural lets tests use a
 * stub without depending on the googleapis client.
 */
export interface TokenSource {
  getAccessToken(): Promise<{ token?: string | null }>;
}

/** Optional overrides for `downloadReport`. */
export interface DownloadReportOptions {
  /**
   * Override the temp path used for the downloaded CSV. Defaults to
   * `safeTmpReportPath(report.id)`.
   *
   * The path is used verbatim — `downloadReport` does NOT re-sanitize.
   * Callers MUST build the path via `safeReportPath(tmpDir, reportId)`
   * (or otherwise strip unsafe characters) to avoid path traversal. The
   * typical reason to override is to keep the temp file in a per-command
   * scratch dir (e.g. `get-report-data`) — use `safeReportPath` for that.
   */
  tmpPath?: string;
}

/**
 * Build a filesystem-safe temp path for a report download.
 *
 * `report.id` comes from an external API response and is interpolated into a
 * temp filename. Strip anything outside [A-Za-z0-9._-] so a malicious or
 * malformed ID (e.g. "../foo" or "id/with/slashes") can't escape /tmp.
 */
export function safeTmpReportPath(reportId: string | null | undefined): string {
  return safeReportPath('/tmp', reportId);
}

/**
 * Build a filesystem-safe temp path for a report download under a caller-
 * supplied directory. Same sanitization as `safeTmpReportPath` — strips
 * anything outside [A-Za-z0-9._-] from the report id so it can't escape
 * `tmpDir` or introduce path separators. This is the helper callers should
 * use when they want to control which directory the temp file lives in
 * (e.g. a per-command scratch dir), so they don't have to reimplement the
 * sanitization themselves.
 */
export function safeReportPath(tmpDir: string, reportId: string | null | undefined): string {
  const safeId = String(reportId ?? 'report').replace(/[^A-Za-z0-9._-]/g, '_');
  return path.join(tmpDir, `${safeId}.csv`);
}

/**
 * Single-attempt HTTPS GET that streams the response body into `dest`.
 * Resolves with the final HTTP status code (200 = success). Caller decides
 * whether to retry based on the status.
 *
 * The YouTube Reporting download host doesn't return structured JSON errors,
 * so we can't use isRateLimitError() here — we have to inspect
 * `response.statusCode` and `response.headers['retry-after']` directly.
 */
export function downloadOnce(
  downloadUrl: string,
  accessToken: string,
  dest: string,
): Promise<{ statusCode: number; retryAfterSec: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(downloadUrl);
    debug(`Downloading from: ${downloadUrl}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      // 30s request timeout. Without this, a stalled server connection
      // would hang forever — `https.get` does NOT time out on its own and
      // would never produce the ECONNRESET/ETIMEDOUT signals the retry
      // loop in `downloadReport` is watching for. (CodeRabbit #118 review.)
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    const req = https
      .get(options, (response) => {
        debug(`Response status: ${response.statusCode}`);

        // 429 = RPM limit. Surface the status + Retry-After header so the
        // retry loop can decide. Drain the body so the socket closes cleanly.
        if (response.statusCode === 429) {
          response.resume();
          unlink(dest).catch(() => {});
          resolve({
            statusCode: 429,
            retryAfterSec: Number(response.headers['retry-after']) || 0,
          });
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          unlink(dest).catch(() => {});
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const file = createWriteStream(dest);
        // Use pipeline (not .pipe) so a read-side error mid-stream rejects
        // cleanly and tears down both ends — otherwise a partial file can
        // survive and skip the retry path. See nodejs stream docs:
        //   https://nodejs.org/api/stream.html#streamstreampipelinesource-transforms-destination-options
        pipeline(response, file).then(
          () => resolve({ statusCode: 200, retryAfterSec: 0 }),
          (err) => {
            unlink(dest).catch(() => {});
            reject(err);
          },
        );
      })
      .on('timeout', () => {
        // Socket-level timeout — destroy the request so the underlying
        // socket closes and the error handler below fires (which rejects
        // the promise, surfaces the timeout as a typed error, and lets
        // the caller's retry loop recognize it via `code === 'ETIMEDOUT'`
        // and back off + retry like any other transient network error).
        const timeoutErr: NodeJS.ErrnoException = new Error('Download request timed out after 30000ms');
        timeoutErr.code = 'ETIMEDOUT';
        req.destroy(timeoutErr);
      })
      .on('error', (err) => {
        unlink(dest).catch(() => {});
        reject(err);
      });
  });
}

/**
 * Download a report from YouTube with retry/backoff and parse the CSV.
 *
 * Retries on HTTP 429 (RPM/minute quota) with exponential backoff: 5s → 10s
 * → 20s → 40s → 80s, capped at 90s. If the server provides a Retry-After
 * header, the larger of (header, exponential) is used. After 5 failed
 * attempts we bail with a clear message instead of looping forever — daily
 * quota exhaustion looks like the same 429 with a multi-thousand-second
 * Retry-After, and the user should see that immediately rather than wait.
 *
 * Also retries on transient network errors (ECONNRESET / ETIMEDOUT / EAI_AGAIN)
 * with a fixed 5s wait between attempts.
 *
 * Temp file is cleaned up before returning. To keep the file (e.g. for
 * debugging), pass a `tmpPath` you own — the function will still try to
 * remove it on success.
 */
export async function downloadReport(
  report: ReportDownloadInfo,
  auth: TokenSource,
  options: DownloadReportOptions = {},
): Promise<{
  csvData: string;
  headers: string[];
  data: Record<string, string>[];
  minDate: string;
  maxDate: string;
}> {
  const tmpPath = options.tmpPath ?? safeTmpReportPath(report.id);
  const credentials = await auth.getAccessToken();
  const accessToken = credentials.token || '';

  const maxRetries = 5;
  const baseDelaySec = 5;
  const maxDelaySec = 90;

  let success = false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await downloadOnce(report.downloadUrl!, accessToken, tmpPath);
      if (result.statusCode === 200) {
        success = true;
        break;
      }
      // 429 from download host — exponential backoff, honoring Retry-After.
      //
      // Daily-quota exhaustion manifests as a 429 with a multi-thousand-second
      // Retry-After (often ~86400s). Sleeping and retrying just hides the real
      // problem, so abort immediately when the header says the wait is more
      // than 30 minutes — that's clearly not an RPM hiccup.
      if (result.retryAfterSec >= 30 * 60) {
        throw new Error(
          `YouTube Reporting download quota appears exhausted for ${report.id}. ` +
          `Server Retry-After is ${result.retryAfterSec}s; aborting instead of retrying.`,
        );
      }
      const expSec = Math.min(baseDelaySec * 2 ** (attempt - 1), maxDelaySec);
      const waitSec = result.retryAfterSec > 0
        ? Math.min(Math.max(result.retryAfterSec, expSec), maxDelaySec)
        : expSec;
      if (attempt >= maxRetries) {
        throw new Error(
          `YouTube Reporting download quota exhausted after ${maxRetries} retries ` +
          `(last wait: ${waitSec}s) for ${report.id}. Aborting.`,
        );
      }
      progress(`Download RPM 429 for ${report.id}, backing off ${waitSec}s (attempt ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if ((code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') && attempt < maxRetries) {
        progress(`Download network error (${code}) for ${report.id}, retrying in 5s (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      // Non-retriable — bubble up so the caller logs it.
      throw err;
    }
  }

  if (!success) {
    throw new Error(`Download failed for ${report.id} after ${maxRetries} attempts`);
  }

  const csvData = await fs.readFile(tmpPath, 'utf-8');
  const parsed = parseCsvAndExtractRange(csvData);

  // Cleanup
  try {
    await unlink(tmpPath);
  } catch {
    // Ignore cleanup errors
  }

  return {
    csvData,
    headers: parsed.headers,
    data: parsed.data,
    minDate: parsed.minDate,
    maxDate: parsed.maxDate,
  };
}

// ─── Reporting API queries (report types, jobs, report data) — #102 phase 4 ──

export interface ReportTypeInfo {
  id: string;
  name: string;
}

/** List available YouTube Reporting API report types. */
export async function fetchReportTypes(): Promise<ReportTypeInfo[]> {
  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  // All list endpoints here are paginated — reading only the first page can
  // silently miss entries (CodeRabbit on #152).
  const reportTypes: ReportTypeInfo[] = [];
  let pageToken: string | undefined;
  do {
    const response = await withRateLimitRetry(
      () => youtubeReporting.reportTypes.list({ onBehalfOfContentOwner: undefined, pageToken }),
      { label: 'reportTypes.list' }
    );
    for (const rt of response.data.reportTypes || []) {
      reportTypes.push({ id: rt.id || '', name: rt.name || '' });
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return reportTypes;
}

/**
 * All pages of `jobs.list`. First-page-only reads could miss a job and make
 * fetchReportData create a duplicate for a type that already has one.
 */
async function listAllJobs(youtubeReporting: youtubereporting_v1.Youtubereporting): Promise<youtubereporting_v1.Schema$Job[]> {
  const jobs: youtubereporting_v1.Schema$Job[] = [];
  let pageToken: string | undefined;
  do {
    const response = await withRateLimitRetry(
      () => youtubeReporting.jobs.list({ onBehalfOfContentOwner: undefined, pageToken }),
      { label: 'jobs.list' }
    );
    jobs.push(...(response.data.jobs || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return jobs;
}

export interface ReportJobInfo {
  jobId: string;
  reportTypeId: string;
  name: string;
  created: string;
  daysSinceCreation: number;
  /** 'Active', or 'Unknown (report listing failed)' when reports couldn't be listed. */
  status: string;
  /** Set when jobs.reports.list failed for this job — reportsCount 0 is then unreliable. */
  reportsListError?: string;
  reportsCount: number;
  /** ISO start/end of the newest report, or null when the job has none yet. */
  latestReport: { startTime: string; endTime: string } | null;
  /** ISO start/end of the oldest report, or null when the job has none yet. */
  oldestReport: { startTime: string; endTime: string } | null;
  expiringReportsCount: number;
  expirationWarnings: { startTime: string; endTime: string; expiresAt: string; daysUntilExpiration: number }[];
  expirationCriticals: { startTime: string; endTime: string; expiresAt: string; daysUntilExpiration: number }[];
}

export interface ReportJobsResult {
  /** Job count before the type filter — lets callers tell "no jobs at all" from "filter matched none". */
  totalJobs: number;
  jobs: ReportJobInfo[];
}

/**
 * List Reporting API jobs with per-job report counts and expiration analysis.
 * Reports created within ~4 days of the job are historical backfills and
 * expire after 30 days; regular reports expire after 60.
 */
export async function fetchReportJobs(params: {
  /** Filter by report type ID. */
  type?: string;
  onProgress?: (message: string) => void;
} = {}): Promise<ReportJobsResult> {
  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  const allJobs = await listAllJobs(youtubeReporting);
  const jobs = params.type ? allJobs.filter(job => job.reportTypeId === params.type) : allJobs;

  const now = new Date();
  const jobsData: ReportJobInfo[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    params.onProgress?.(`Fetching job ${i + 1}/${jobs.length}`);

    const jobCreated = new Date(job.createTime || '');
    const daysSinceCreation = Math.floor((now.getTime() - jobCreated.getTime()) / (1000 * 60 * 60 * 24));

    let reportsCount = 0;
    let latestReport: ReportJobInfo['latestReport'] = null;
    let oldestReport: ReportJobInfo['oldestReport'] = null;
    let expiringReportsCount = 0;
    let reportsListError: string | undefined;
    const warnings: ReportJobInfo['expirationWarnings'] = [];
    const criticals: ReportJobInfo['expirationCriticals'] = [];

    try {
      const reports: youtubereporting_v1.Schema$Report[] = [];
      let reportsPageToken: string | undefined;
      do {
        const reportsResponse = await withRateLimitRetry(
          () => youtubeReporting.jobs.reports.list({
            jobId: job.id!,
            onBehalfOfContentOwner: undefined,
            pageToken: reportsPageToken,
          }),
          { label: `jobs.reports.list(${job.reportTypeId})` }
        );
        reports.push(...(reportsResponse.data.reports || []));
        reportsPageToken = reportsResponse.data.nextPageToken || undefined;
      } while (reportsPageToken);
      reportsCount = reports.length;

      if (reports.length > 0) {
        latestReport = {
          startTime: reports[0].startTime || '',
          endTime: reports[0].endTime || '',
        };
        oldestReport = {
          startTime: reports[reports.length - 1].startTime || '',
          endTime: reports[reports.length - 1].endTime || '',
        };

        for (const report of reports) {
          const reportCreated = new Date(report.createTime || '');
          const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
          const expirationDays = isHistorical ? 30 : 60;
          const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
          const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

          const entry = {
            startTime: report.startTime || '',
            endTime: report.endTime || '',
            expiresAt: expiresAt.toISOString().split('T')[0],
            daysUntilExpiration,
          };
          if (daysUntilExpiration <= 3) {
            criticals.push(entry);
          } else if (daysUntilExpiration <= 7) {
            warnings.push(entry);
          }

          if (daysUntilExpiration <= 7) {
            expiringReportsCount++;
          }
        }
      }
    } catch (err) {
      // Keep listing the remaining jobs, but don't present this one as a
      // healthy zero-report job — record the failure (CodeRabbit on #152).
      reportsListError = (err as Error).message;
      debug(`Failed to fetch reports for job ${job.id}: ${err}`);
    }

    jobsData.push({
      jobId: job.id || '',
      reportTypeId: job.reportTypeId || '',
      name: job.name || '',
      created: job.createTime || '',
      daysSinceCreation,
      status: reportsListError ? 'Unknown (report listing failed)' : 'Active',
      reportsListError,
      reportsCount,
      latestReport,
      oldestReport,
      expiringReportsCount,
      expirationWarnings: warnings,
      expirationCriticals: criticals,
    });
  }

  return { totalJobs: allJobs.length, jobs: jobsData };
}

export interface ReportDataParams {
  /** Report type ID (e.g. channel_reach_basic_a1). */
  type: string;
  /** Channel handle/ID; falls back to `default.channel` config. */
  channel?: string;
  /** Filter rows by video ID; throws (listing available IDs) when nothing matches. */
  videoId?: string;
  /** YYYY-MM-DD; defaults to the oldest available data. */
  startDate?: string;
  /** YYYY-MM-DD; defaults to the newest available data. */
  endDate?: string;
  /** Progress hook — commands wire this to the spinner; MCP omits it. */
  onProgress?: (message: string) => void;
}

/** A report fetched fresh from the API in this run (for expiration display). */
export interface FetchedReportInfo {
  id: string;
  startTime: string;
  endTime: string;
  createTime: string;
}

export type ReportDataResult =
  /** No job existed — one was created; data arrives after the 48h window. */
  | {
      status: 'job-created';
      jobId: string;
      jobCreateTime: string;
      readyAt: string;
    }
  /**
   * Job exists, the API has produced no reports yet, AND the local archive is
   * empty. Only returned when neither source can supply data. An old job
   * whose API reports have expired still serves from cache (issue #154).
   */
  | {
      status: 'no-reports-yet';
      jobId: string;
      jobCreateTime: string;
      readyAt: string;
    }
  | {
      status: 'ok';
      jobId: string;
      jobCreateTime: string;
      rows: Record<string, string>[];
      requestedRange: { startDate: string; endDate: string };
      /** Requested range clamped to what the API + local cache can cover. */
      adjustedRange: { startDate: string; endDate: string };
      /**
       * Outer bounds of available data across the API and the local cache.
       *
       * These are bounds, NOT a guarantee of continuous coverage: when the two
       * sources are disjoint (cache holds January, API holds June) the range
       * spans both islands. Read `uncoveredRanges` to find the holes inside it
       * (issue #155).
       */
      availableRange: { startDate: string; endDate: string };
      /**
       * Sub-ranges of `adjustedRange` that no source could cover, derived from
       * the actual data windows of the cached and freshly-downloaded reports.
       * Empty when coverage is continuous. Both the CLI warning and MCP
       * consumers read this, so gaps are reported from one source of truth.
       */
      uncoveredRanges: { startDate: string; endDate: string }[];
      cachedReports: CacheIndexEntry[];
      fetchedReports: FetchedReportInfo[];
    };

/**
 * Fetch Reporting API rows for a report type, merging the local cache with
 * fresh downloads (issue #101 pipeline). Finds or creates the reporting job,
 * clamps the requested date range to available data (API + cache), loads
 * covered ranges from cache, downloads only the missing reports, caches them
 * (skipping the write when the lock is busy), and deduplicates rows by
 * (date, video_id).
 */
export async function fetchReportData(params: ReportDataParams): Promise<ReportDataResult> {
  // Resolve the cache namespace from the AUTHENTICATED channel. The Reporting
  // API always returns data for whoever's authenticated — there's no channel
  // parameter and `onBehalfOfContentOwner` is always undefined in this CLI —
  // so the cache has to be keyed by the same channel or we silently write
  // the authed account's data under another channel's path (issue #153).
  //
  // `params.channel` (and the `default.channel` config fallback) is accepted
  // only for validation: today it can only name the authed channel (no
  // multi-account auth-swap yet, see #153), so we validate any supplied
  // value against the authed channel and fail loudly on mismatch. That
  // surfaces stale `default.channel` config or a wrong `--channel` instead
  // of letting the bug recur.
  const channelId = await getAuthenticatedChannelId();
  const requestedChannel = params.channel || await getConfigValue('default.channel');
  await assertChannelMatchesAuthenticated(requestedChannel, channelId);
  debug(`Using authenticated channel ID for cache namespace: ${channelId}`);

  // Ensure cache directory exists before attempting lock
  try {
    await ensureCacheDir(channelId);
  } catch (err) {
    throw new Error(`Failed to create cache directory: ${(err as Error).message}`);
  }

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  // Step 1: Find or create reporting job
  const jobs = await listAllJobs(youtubeReporting);
  const matchingJob = jobs.find((job) => job.reportTypeId === params.type);

  if (!matchingJob) {
    params.onProgress?.(`Creating new reporting job for type: ${params.type}...`);

    const createResponse = await withRateLimitRetry(
      () => youtubeReporting.jobs.create({
        requestBody: {
          reportTypeId: params.type,
          name: `${params.type} Report Job`,
        },
      }),
      { label: `jobs.create(${params.type})` }
    );

    const jobCreateTime = createResponse.data.createTime || '';
    const readyAt = new Date(new Date(jobCreateTime).getTime() + 48 * 60 * 60 * 1000);
    return {
      status: 'job-created',
      jobId: createResponse.data.id!,
      jobCreateTime,
      readyAt: readyAt.toISOString(),
    };
  }

  const jobId = matchingJob.id!;
  const jobCreateTime = matchingJob.createTime || '';
  debug(`Found existing job: ${jobId}`);

  // Step 2: Check if reports are available
  params.onProgress?.('Fetching available reports...');

  const allFetchedReports: FetchedReportInfo[] = [];
  const reportsById = new Map<string, { downloadUrl?: string | null }>();
  let reportsPageToken: string | undefined;
  do {
    const reportsResponse = await withRateLimitRetry(
      () => youtubeReporting.jobs.reports.list({
        jobId,
        onBehalfOfContentOwner: undefined,
        pageToken: reportsPageToken,
      }),
      { label: `jobs.reports.list(${params.type})` }
    );
    for (const report of reportsResponse.data.reports || []) {
      allFetchedReports.push({
        id: report.id || '',
        startTime: report.startTime || '',
        endTime: report.endTime || '',
        createTime: report.createTime || '',
      });
      reportsById.set(report.id || '', { downloadUrl: report.downloadUrl });
    }
    reportsPageToken = reportsResponse.data.nextPageToken || undefined;
  } while (reportsPageToken);

  // YouTube can reissue a report for the same window with a newer createTime
  // (e.g. corrected data). Keep only the newest per window so two versions of
  // the same window never both contribute rows (CodeRabbit on #152).
  const newestByWindow = new Map<string, FetchedReportInfo>();
  for (const report of allFetchedReports) {
    const key = `${report.startTime}|${report.endTime}`;
    const prev = newestByWindow.get(key);
    if (!prev || report.createTime > prev.createTime) {
      newestByWindow.set(key, report);
    }
  }
  let reports = [...newestByWindow.values()];

  // The API expires reports after 30-60 days, but `fetch-reports` keeps a
  // local archive that outlives them. An empty API listing therefore does NOT
  // mean "no data". Scan the archive before giving up, and only report
  // no-reports-yet when neither source holds anything (issue #154).
  //
  // The scan is unbounded because at this point there is no API window to
  // anchor a range to: the archive itself defines what is available.
  const archivedReports = reports.length === 0
    ? await findCachedReports(channelId, params.type, ARCHIVE_SCAN_START, ARCHIVE_SCAN_END)
    : [];

  if (reports.length === 0 && archivedReports.length === 0) {
    // Genuinely nothing anywhere: the job is new and still inside its 48h window.
    const readyAt = new Date(new Date(jobCreateTime).getTime() + 48 * 60 * 60 * 1000);
    return {
      status: 'no-reports-yet',
      jobId,
      jobCreateTime,
      readyAt: readyAt.toISOString(),
    };
  }

  if (reports.length === 0) {
    params.onProgress?.(
      `No reports available from the API; serving ${archivedReports.length} archived report(s) from cache`
    );
    debug(`API returned no reports for ${params.type}; falling back to ${archivedReports.length} cached report(s)`);
  }

  // Step 3: Validate date range (API returns timestamps, compare date portions
  // only). Computed over all reports rather than relying on response order.
  // With an expired-out API listing the bounds come from the archive instead.
  let minDate: string;
  let maxDate: string;
  if (reports.length > 0) {
    minDate = reports.reduce((min, r) => {
      const d = r.startTime.split('T')[0];
      return d < min ? d : min;
    }, '9999-99-99');
    maxDate = reports.reduce((max, r) => {
      const d = r.endTime.split('T')[0];
      return d > max ? d : max;
    }, '');
  } else {
    const archivedDates = await Promise.all(
      archivedReports.map((entry) => getActualDates(entry, channelId))
    );
    minDate = archivedDates.reduce((min, d) => (d.start < min ? d.start : min), '9999-99-99');
    maxDate = archivedDates.reduce((max, d) => (d.end > max ? d.end : max), '');
  }

  const requestedStart = params.startDate || minDate;
  const requestedEnd = params.endDate || maxDate;

  if (!minDate || !maxDate || !requestedStart || !requestedEnd) {
    throw new Error('Unable to determine date range');
  }

  try {
    validateDateRange(requestedStart, requestedEnd);
  } catch (e) {
    throw new Error(`${(e as Error).message}\nProvided: start-date=${requestedStart}, end-date=${requestedEnd}`);
  }

  // Adjust date range to available data if needed.
  // Consider both API range and local cache — cache may contain data that
  // has expired from the API, or may be the only source if API returns nothing.
  // Use actual CSV data dates (from metadata) rather than API report windows
  // which span 2 calendar days and would overstate coverage.
  const cacheEntries = await findCachedReports(channelId, params.type, requestedStart, requestedEnd);
  let effectiveMinDate = minDate;
  let effectiveMaxDate = maxDate;
  if (cacheEntries.length > 0) {
    // getActualDates applies the same metadata-first, API-window-fallback rule
    // the cache layer uses for coverage analysis. Previously reimplemented
    // inline here, which risked the two drifting apart.
    const cacheDates = await Promise.all(
      cacheEntries.map((entry) => getActualDates(entry, channelId))
    );
    const cacheEarliest = cacheDates.reduce((min, d) => d.start < min ? d.start : min, '9999-99-99');
    const cacheLatest = cacheDates.reduce((max, d) => d.end > max ? d.end : max, '');
    if (cacheEarliest < effectiveMinDate) effectiveMinDate = cacheEarliest;
    if (cacheLatest > effectiveMaxDate) effectiveMaxDate = cacheLatest;
  }

  const adjustedStart = requestedStart < effectiveMinDate ? effectiveMinDate : requestedStart;
  const adjustedEnd = requestedEnd > effectiveMaxDate ? effectiveMaxDate : requestedEnd;

  // Validate that adjusted range has overlap (i.e., requested range is not entirely before/after available data)
  if (adjustedStart > adjustedEnd) {
    throw new Error(
      'Requested date range has no overlap with available data\n' +
      `Requested: ${requestedStart} to ${requestedEnd}\n` +
      `Available: ${effectiveMinDate} to ${effectiveMaxDate}`
    );
  }

  // Step 4: Filter reports by date range (compare date portions only)
  // These are API reports — used for fetching data not yet in cache.
  reports = reports.filter((report) => {
    const reportStart = report.startTime.split('T')[0];
    const reportEnd = report.endTime.split('T')[0];
    return reportStart <= adjustedEnd && reportEnd >= adjustedStart;
  });

  // It's okay if no API reports match — data may still be available from cache
  // (e.g. expired from API but present in local archive).
  if (reports.length === 0 && cacheEntries.length === 0) {
    throw new Error('No reports match the specified date range.');
  }

  // Step 5: Analyze cache coverage
  params.onProgress?.('Analyzing cache coverage...');
  const coverage = await analyzeCacheCoverage(channelId, params.type, adjustedStart, adjustedEnd);
  debug('Cache coverage:', coverage);

  // Step 6: Load every cached report whose window overlaps the adjusted range.
  //
  // NOT driven by `coverage.fullyCovered`: analyzeCacheCoverage calls a report
  // "fully covered" only when the report sits entirely inside the requested
  // range, so the reverse case (one archived report spanning a narrower
  // request, e.g. a Jan 1-31 report for a Jan 10-20 query) is classified
  // partial and would never be loaded. That returned zero rows while claiming
  // the range was uncovered, which the #154 archive-only path made reachable
  // with no API reports to fall back on. Rows are clamped to the adjusted
  // range further down, so loading a wider report is safe.
  //
  // `coverage` is still used below to decide which API reports to download.
  const cachedData: Record<string, string>[] = [];
  const cachedReports: CacheIndexEntry[] = [];

  const overlappingCached = await findCachedReports(channelId, params.type, adjustedStart, adjustedEnd);
  const loadedReportIds = new Set<string>();
  for (const cachedReport of overlappingCached) {
    // findCachedReports can return the same report once per overlapping
    // window; loading it twice would duplicate rows and inflate the count.
    if (loadedReportIds.has(cachedReport.reportId)) continue;
    loadedReportIds.add(cachedReport.reportId);

    const reportData = await readCachedReport(channelId, cachedReport.reportId, params.type);
    if (reportData) {
      cachedData.push(...reportData.data);
      cachedReports.push(cachedReport);
      debug(`Loaded from cache: ${cachedReport.reportId}`);
    }
  }

  if (cachedReports.length > 0) {
    params.onProgress?.(`Loaded ${cachedReports.length} report(s) from cache`);
  }

  // Step 7: Fetch missing data
  const reportsToFetch: FetchedReportInfo[] = [];

  // Build list of missing date ranges
  const missingRanges = [
    ...coverage.partiallyCovered.map(p => p.missing),
    ...coverage.notCovered.map(r => {
      const [start, end] = r.split('/');
      return { start, end };
    }),
  ];

  // Filter reports to only fetch those covering missing ranges. Compare date
  // portions: the report bounds are full timestamps while the range bounds
  // are YYYY-MM-DD, and lexical comparison on an equal-day boundary would
  // skip a report covering a single-day gap (CodeRabbit on #152).
  for (const report of reports) {
    const reportStart = report.startTime.split('T')[0];
    const reportEnd = report.endTime.split('T')[0];
    const coversMissing = missingRanges.some(range => {
      return reportStart <= range.end && reportEnd >= range.start;
    });

    if (coversMissing) {
      reportsToFetch.push(report);
    }
  }

  const tmpDir = '/tmp';

  // NOTE: the write lock is acquired and released per-iteration around the
  // cache write, NOT held across the whole download loop. `downloadReport`
  // can retry/backoff for minutes on HTTP 429 or transient network errors,
  // and holding the lock that long would block concurrent `fetch-reports` /
  // `get-report-data` runs from the same channel. The lock guards the cache
  // index write only.

  const jobCreated = new Date(jobCreateTime);
  const fetchedData: Record<string, string>[] = [];
  // Actual data windows (YYYYMMDD row dates) of the fresh downloads, used to
  // drop overlapping cached rows below. Only populated for downloads that
  // actually carried rows: an empty download must not supersede real cached
  // data for the same window.
  const fetchedWindows: { min: string; max: string }[] = [];
  // Windows the downloads are known to COVER (YYYYMMDD), which is a different
  // question from which rows they carried. A report can legitimately cover a
  // period and contain zero rows because nothing happened, and treating that
  // as absent coverage would make uncoveredRanges report a phantom gap, the
  // exact false positive #155 exists to remove. Falls back to the report's
  // own window, mirroring getActualDates' fallback for a cached entry whose
  // metadata has no parsed row dates.
  const fetchedCoverage: { min: string; max: string }[] = [];

  for (let i = 0; i < reportsToFetch.length; i++) {
    const report = reportsToFetch[i];
    // Use the shared sanitizer so a malicious report.id can't escape
    // `tmpDir` (path-traversal hardening). Append pid + timestamp to keep
    // the path unique per process — the reports lock is scoped to just the
    // cache write, so two concurrent runs on the same channel would
    // otherwise clobber each other's temp CSV (CodeRabbit round 2).
    const tmpPath = safeReportPath(tmpDir, `${report.id || 'report'}-${process.pid}-${Date.now()}`);

    params.onProgress?.(`Downloading report ${i + 1}/${reportsToFetch.length}...`);

    const downloadUrl = reportsById.get(report.id)?.downloadUrl;
    const { csvData, headers, data, minDate: dataMinDate, maxDate: dataMaxDate } =
      await downloadReport({ ...report, downloadUrl }, auth, { tmpPath });

    // Calculate expiration date
    const reportCreated = new Date(report.createTime);
    const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
    const expirationDays = isHistorical ? 30 : 60;
    const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);

    // Acquire the write lock just long enough to update the cache index.
    // If the lock is busy, skip the cache write (the run still returns data)
    // rather than queueing behind a possibly-slow download backoff.
    let writeRelease: (() => Promise<void>) | null = null;
    try {
      writeRelease = await acquireLock(getLockPath('reports', channelId), { timeout: 1000 });
    } catch {
      // progress() routes to stderr: stdout carries the machine-readable
      // data output and interleaving would break downstream parsing.
      progress(`Info: cache lock busy, skipping cache write for ${report.id}`);
    }

    if (writeRelease) {
      // Save to cache (non-fatal: warn on failure so API data is still returned)
      try {
        await saveReportToCache(channelId, report.id, params.type, csvData, {
          reportId: report.id,
          reportTypeId: params.type,
          channelId,
          jobId,
          startTime: report.startTime,
          endTime: report.endTime,
          startTimeActual: dataMinDate,
          endTimeActual: dataMaxDate,
          downloadedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          downloadUrl: downloadUrl || '',
          columns: headers,
          isComplete: true,
          fileSize: csvData.length,
          row_count: data.length,
        });
      } catch (cacheErr) {
        progress(`Warning: cache save failed for ${report.id}: ${(cacheErr as Error).message} — data will be re-fetched on next run`);
      } finally {
        await writeRelease();
      }
    }

    fetchedData.push(...data);
    if (dataMinDate && dataMaxDate) {
      fetchedWindows.push({ min: dataMinDate, max: dataMaxDate });
      fetchedCoverage.push({ min: dataMinDate, max: dataMaxDate });
    } else {
      // Downloaded successfully but parsed no row dates (empty report). It
      // still covers its window, so record that for gap analysis only.
      fetchedCoverage.push({
        min: report.startTime.split('T')[0].replace(/-/g, ''),
        max: report.endTime.split('T')[0].replace(/-/g, ''),
      });
      debug(`Report ${report.id} had no row dates; recording its API window as covered`);
    }

    debug(`Downloaded: ${report.startTime} to ${report.endTime}`);
  }

  // Merge cached + fresh rows. Fresh downloads win where their actual data
  // window overlaps cached rows (a reissued report can carry corrected
  // values), then byte-identical duplicate rows are dropped. The previous
  // dedup keyed on (date, video_id) alone, which collapsed distinct rows in
  // report types with more dimensions — demographics, traffic sources, etc.
  // (CodeRabbit on #152, critical).
  const cachedSurviving = cachedData.filter(row =>
    !row.date || !fetchedWindows.some(w => row.date >= w.min && row.date <= w.max)
  );
  let allData = [...cachedSurviving, ...fetchedData];
  const seenRows = new Set<string>();
  allData = allData.filter(row => {
    const key = JSON.stringify(row);
    if (seenRows.has(key)) return false;
    seenRows.add(key);
    return true;
  });

  // Clamp to the adjusted range: report files span whole windows, so rows
  // just outside the requested range would otherwise leak into a result that
  // claims a narrower dateRange (CodeRabbit on #152). Row dates are YYYYMMDD.
  const startKey = adjustedStart.replace(/-/g, '');
  const endKey = adjustedEnd.replace(/-/g, '');
  allData = allData.filter(row => !row.date || (row.date >= startKey && row.date <= endKey));

  // Step 8: Filter by video ID if specified
  let rows = allData;
  if (params.videoId) {
    rows = allData.filter(row => row.video_id === params.videoId);

    if (rows.length === 0) {
      const uniqueVideoIds = [...new Set(allData.map(row => row.video_id))];
      const shown = uniqueVideoIds.slice(0, 10).map(vid => `  ${vid}`).join('\n');
      const more = uniqueVideoIds.length > 10 ? `\n  ... and ${uniqueVideoIds.length - 10} more` : '';
      throw new Error(
        `No data found for video ID: ${params.videoId}\n` +
        `Available video IDs in this date range:\n${shown}${more}`
      );
    }
  }

  // Coverage gaps (issue #155). `availableRange` is only an outer bound: when
  // the cache and the API cover disjoint islands (cache holds January, API
  // holds June) it spans both and implies a continuity that doesn't exist.
  // Derive the real holes from the actual data windows of the reports that
  // contributed rows (the cached ones that were read, plus the freshly
  // downloaded ones), so the CLI warning and MCP consumers read one signal
  // instead of each inferring gaps their own way.
  const cachedCoveredRanges = await Promise.all(
    cachedReports.map((entry) => getActualDates(entry, channelId))
  );
  const coveredRanges = [
    ...cachedCoveredRanges,
    // fetchedCoverage carries YYYYMMDD dates; the gap helpers work in
    // YYYY-MM-DD.
    ...fetchedCoverage.map((w) => ({ start: normalizeDate(w.min), end: normalizeDate(w.max) })),
  ];
  const uncoveredRanges = findDateGaps(coveredRanges, adjustedStart, adjustedEnd)
    .map((gap) => ({ startDate: gap.start, endDate: gap.end }));

  return {
    status: 'ok',
    jobId,
    jobCreateTime,
    rows,
    requestedRange: { startDate: requestedStart, endDate: requestedEnd },
    adjustedRange: { startDate: adjustedStart, endDate: adjustedEnd },
    availableRange: { startDate: effectiveMinDate, endDate: effectiveMaxDate },
    uncoveredRanges,
    cachedReports,
    fetchedReports: reportsToFetch,
  };
}