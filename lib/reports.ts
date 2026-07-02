/**
 * Shared report-download primitives used by both `fetch-reports` and
 * `get-report-data`. Centralizing these here eliminates the duplicated
 * HTTPS-download + CSV-parse code that previously lived in both commands
 * (issue #101).
 *
 * Public surface:
 *   - safeTmpReportPath(reportId)            — sanitize a report ID for /tmp
 *   - downloadOnce(url, token, dest)         — single HTTPS GET, no retry
 *   - downloadReport(report, auth, opts?)    — retry-wrapped download + CSV parse
 */

import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import https from 'https';
import path from 'path';
import { debug, progress } from './utils';
import { parseCsvAndExtractRange } from './cache';

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
        // the promise, surfaces the timeout as an error, and lets the
        // caller's retry loop run).
        req.destroy(new Error('Download request timed out after 30000ms'));
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