import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, debug, success, warning, progress, initCommand, withSpinner, formatTimestampWithTimezone, validateDateOption, validateDateRange, withRateLimitRetry } from '../lib/utils';
import {
  isReportCached,
  saveReportToCache,
  loadCacheIndex,
  loadReportMetadata,
  parseCsvAndExtractRange,
  ensureCacheDir,
} from '../lib/cache';
import { getChannelId } from '../lib/youtube';
import { getConfigValue, getLockTimeout } from '../lib/config';
import { acquireLock, getLockPath } from '../lib/lock';
import https from 'https';
import { createWriteStream, unlinkSync } from 'fs';
import { promises as fs } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

interface FetchReportsOptions {
  channel?: string;
  type?: string;
  types?: string;
  startDate?: string;
  endDate?: string;
  force?: boolean;
  verify?: boolean;
  verbose?: boolean;
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
function downloadOnce(
  downloadUrl: string,
  accessToken: string,
  dest: string
): Promise<{ statusCode: number; retryAfterSec: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(downloadUrl);
    debug(`Downloading from: ${downloadUrl}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    https
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
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ statusCode: 200, retryAfterSec: 0 });
        });
        file.on('error', (err) => {
          unlink(dest).catch(() => {});
          reject(err);
        });
      })
      .on('error', (err) => {
        unlink(dest).catch(() => {});
        reject(err);
      });
  });
}

/**
 * Download a report from YouTube.
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
 */
async function downloadReport(
  report: { id?: string | null; downloadUrl?: string | null; startTime?: string | null; endTime?: string | null; createTime?: string | null },
  auth: { getAccessToken(): Promise<{ token?: string | null }> }
): Promise<{ csvData: string; headers: string[]; data: Record<string, string>[]; minDate: string; maxDate: string }> {
  const tmpPath = path.join('/tmp', `${report.id}.csv`);
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
      const expSec = Math.min(baseDelaySec * 2 ** (attempt - 1), maxDelaySec);
      const waitSec = result.retryAfterSec > 0
        ? Math.min(Math.max(result.retryAfterSec, expSec), maxDelaySec)
        : expSec;
      if (attempt >= maxRetries) {
        throw new Error(
          `YouTube Reporting download quota exhausted after ${maxRetries} retries ` +
          `(last wait: ${waitSec}s) for ${report.id}. Aborting.`
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
    unlinkSync(tmpPath);
  } catch {
    // Ignore cleanup errors
  }

  return { csvData, headers: parsed.headers, data: parsed.data, minDate: parsed.minDate, maxDate: parsed.maxDate };
}

/**
 * Fetch and archive all available report data
 */
async function fetchReportsCommand(options: FetchReportsOptions): Promise<void> {
  initCommand(options);
  try { if (options.startDate) validateDateOption('--start-date', options.startDate); } catch (e) { error((e as Error).message); process.exit(1); }
  try { if (options.endDate) validateDateOption('--end-date', options.endDate); } catch (e) { error((e as Error).message); process.exit(1); }
  try { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); } catch (e) { error((e as Error).message); process.exit(1); }

  await withSpinner('Initializing...', 'Failed to fetch reports', async (spinner) => {
    // Resolve channel handle → canonical channel ID for cache namespacing
    const channelHandle = options.channel || await getConfigValue('default.channel');
    if (!channelHandle) {
      spinner.fail('No channel configured');
      console.log('');
      error('No channel specified. Set a default channel:\n  staqan-yt config set default.channel @yourchannel\nor pass --channel @yourchannel');
      process.exit(1);
    }

    spinner.text = `Resolving channel ID for ${channelHandle}...`;
    const channelId = await getChannelId(channelHandle);
    debug(`Using channel ID: ${channelId}`);

    // Ensure cache directory exists before touching the lock
    try {
      await ensureCacheDir(channelId);
    } catch (err) {
      spinner.fail('Failed to create cache directory');
      error((err as Error).message);
      process.exit(1);
    }

    // Acquire lock for entire fetch operation
    const lockPath = getLockPath('reports', channelId);
    let release: (() => Promise<void>) | null = null;

    try {
      spinner.text = 'Acquiring lock...';
      const lockTimeout = await getLockTimeout();
      release = await acquireLock(lockPath, { timeout: lockTimeout });

      spinner.text = 'Initializing...';
      const auth = await getAuthenticatedClient();
      const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

      // Step 1: Discover report types
      spinner.text = 'Discovering report types...';

      const typesResponse = await withRateLimitRetry(
        () => youtubeReporting.reportTypes.list({ onBehalfOfContentOwner: undefined }),
        { label: 'reportTypes.list' }
      );

      let reportTypes = typesResponse.data.reportTypes || [];

      // Filter by --type or --types if specified
      if (options.type) {
        reportTypes = reportTypes.filter(t => t.id === options.type);
        debug(`Filtering by single type: ${options.type}`);
      } else if (options.types !== undefined) {
        const requestedIds = options.types.split(',').map(s => s.trim()).filter(Boolean);
        if (requestedIds.length === 0) {
          spinner.fail('Invalid --types');
          error('--types cannot be empty. Provide comma-separated type IDs or omit the flag.');
          process.exit(1);
        }
        const availableIds = new Set(reportTypes.map(t => t.id).filter((id): id is string => Boolean(id)));
        const invalidIds = requestedIds.filter(id => !availableIds.has(id));
        if (invalidIds.length > 0) {
          spinner.fail('Invalid --types');
          error(`Unknown report type ID(s): ${invalidIds.join(', ')}`);
          process.exit(1);
        }
        reportTypes = reportTypes.filter(t => requestedIds.includes(t.id!));
        debug(`Filtering by multiple types: ${requestedIds.join(', ')}`);
      }

      if (reportTypes.length === 0) {
        spinner.fail('No report types found');
        console.log('');
        error('No report types found matching your criteria.');
        if (release) await release(); release = null;
        process.exit(1);
      }

      spinner.succeed(`Found ${reportTypes.length} report type(s)`);
      console.log('');

      // Step 2: Fetch existing jobs ONCE and index by reportTypeId.
      //
      // Previously this was called inside the per-report-type loop, so a run
      // with N report types made N identical jobs.list() calls (~95% wasted
      // quota). With ~20 report types this single hoist cuts the listing-phase
      // API usage by ~95%.
      spinner.text = 'Fetching reporting jobs...';
      const jobsResponse = await withRateLimitRetry(
        () => youtubeReporting.jobs.list({ onBehalfOfContentOwner: undefined }),
        { label: 'jobs.list' }
      );
      const jobsByReportType = new Map<string, NonNullable<typeof jobsResponse.data.jobs>[number]>();
      for (const job of jobsResponse.data.jobs || []) {
        if (job.reportTypeId) jobsByReportType.set(job.reportTypeId, job);
      }
      debug(`Indexed ${jobsByReportType.size} existing job(s) by reportTypeId`);

      // Step 3: Process each report type
      let totalDownloaded = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const reportType of reportTypes) {
      const reportTypeId = reportType.id!;
      spinner.text = `Processing ${reportTypeId}...`;

      // Look up the job from the pre-fetched map (no API call).
      const matchingJob = jobsByReportType.get(reportTypeId);

      let jobId: string;

      if (matchingJob) {
        jobId = matchingJob.id!;
        debug(`Found existing job: ${jobId}`);
      } else {
        // Create new job
        spinner.text = `Creating new job for ${reportTypeId}...`;

        const createResponse = await withRateLimitRetry(
          () => youtubeReporting.jobs.create({
            requestBody: {
              reportTypeId: reportTypeId,
              name: `${reportTypeId} Report Job`,
            },
          }),
          { label: `jobs.create(${reportTypeId})` }
        );

        jobId = createResponse.data.id!;
        debug(`Created new job: ${jobId}`);

        // Skip this type - first report not ready yet
        const jobCreated = new Date(createResponse.data.createTime || '');
        const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);
        const now = new Date();
        const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));

        const formatted = formatTimestampWithTimezone(readyAt);
        warning(`New job created for ${reportTypeId}`);
        console.log(chalk.gray('  First report available:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
        console.log(chalk.gray('  Wait:') + ' ' + chalk.cyan(`${hoursUntilReady} hours remaining`));
        console.log('');

        continue;
      }

      // Get reports for this job (with pagination)
      const allFetchedReports: any[] = [];
      let reportsPageToken: string | undefined;
      do {
        const reportsResponse = await withRateLimitRetry(
          () => youtubeReporting.jobs.reports.list({
            jobId,
            onBehalfOfContentOwner: undefined,
            pageToken: reportsPageToken,
          }),
          { label: `jobs.reports.list(${reportTypeId})` }
        );
        const pageReports = reportsResponse.data.reports || [];
        allFetchedReports.push(...pageReports);
        reportsPageToken = reportsResponse.data.nextPageToken || undefined;
        debug(`Fetched ${pageReports.length} reports (total: ${allFetchedReports.length})`);
      } while (reportsPageToken);
      let reports = allFetchedReports;

      if (reports.length === 0) {
        debug(`No reports available for ${reportTypeId}`);
        continue;
      }

      // Filter by date range if specified (compare date portions only)
      if (options.startDate || options.endDate) {
        const allMinDate = reports[reports.length - 1].startTime!.split('T')[0]; // Oldest
        const allMaxDate = reports[0].endTime!.split('T')[0]; // Newest
        const filteredStart = (options.startDate || allMinDate).split('T')[0];
        const filteredEnd = (options.endDate || allMaxDate).split('T')[0];

        try {
          validateDateRange(filteredStart, filteredEnd);
        } catch (e) {
          error((e as Error).message);
          console.log(chalk.gray('Provided:') + ` start-date=${filteredStart}, end-date=${filteredEnd}`);
          console.log('');
          process.exit(1);
        }

        reports = reports.filter((report: typeof reports[0]) => {
          const reportStart = report.startTime!.split('T')[0];
          const reportEnd = report.endTime!.split('T')[0];
          return reportStart >= filteredStart && reportEnd <= filteredEnd;
        });

        debug(`Filtered to ${reports.length} report(s) for date range`);
      }

      // Process each report
      let typeDownloaded = 0;
      let typeSkipped = 0;
      let typeErrors = 0;

      for (const report of reports) {
        const reportId = report.id!;
        const startTime = report.startTime!;
        const endTime = report.endTime!;

        // Check if already cached (by unique report ID, not date overlap)
        const alreadyCached = await isReportCached(channelId, reportId);

        if (alreadyCached && !options.force) {
          debug(`Skipping cached report: ${reportId} (${startTime} to ${endTime})`);
          typeSkipped++;
          continue;
        }

        // Download report
        try {
          spinner.text = `Downloading ${reportTypeId}: ${startTime} to ${endTime}...`;
          const { csvData, headers, data, minDate, maxDate } = await downloadReport(report, auth);

          // Calculate expiration date
          const jobCreated = new Date(matchingJob.createTime || '');
          const reportCreated = new Date(report.createTime || '');
          const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
          const expirationDays = isHistorical ? 30 : 60;
          const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);

          // Save to cache
          await saveReportToCache(channelId, reportId, reportTypeId, csvData, {
            reportId,
            reportTypeId,
            channelId,
            jobId,
            startTime,
            endTime,
            startTimeActual: minDate || startTime,
            endTimeActual: maxDate || endTime,
            downloadedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString(),
            downloadUrl: report.downloadUrl!,
            columns: headers,
            isComplete: true,
            fileSize: csvData.length,
            row_count: data.length,
          });

          typeDownloaded++;
          debug(`Downloaded and cached: ${reportId}`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          error(`Failed to download ${reportId}: ${errorMessage}`);
          typeErrors++;
        }
      }

      spinner.succeed(`${reportTypeId}: ${typeDownloaded} downloaded, ${typeSkipped} cached, ${typeErrors} errors`);
      console.log('');

      totalDownloaded += typeDownloaded;
      totalSkipped += typeSkipped;
      totalErrors += typeErrors;
    }

    // Step 3: Verification mode (optional)
    if (options.verify) {
      spinner.text = 'Verifying cached files...';

      const index = await loadCacheIndex(channelId, channelHandle);
      let verified = 0;
      let corrupted = 0;

      for (const entry of index.entries) {
        const metadata = await loadReportMetadata(channelId, entry.reportId, entry.reportTypeId);

        if (!metadata) {
          warning(`Missing metadata: ${entry.reportId}`);
          corrupted++;
          continue;
        }

        if (!metadata.isComplete) {
          warning(`Incomplete file: ${entry.reportId}`);
          corrupted++;
          continue;
        }

        verified++;
      }

      spinner.succeed(`Verification complete: ${verified} OK, ${corrupted} issues`);
      console.log('');
    }

    // Summary
    console.log(chalk.bold('Summary:'));
    console.log(chalk.gray('  Total downloaded:') + ' ' + chalk.green(totalDownloaded));
    console.log(chalk.gray('  Total skipped (cached):') + ' ' + chalk.yellow(totalSkipped));
    if (totalErrors > 0) {
      console.log(chalk.gray('  Total errors:') + ' ' + chalk.red(totalErrors));
    }
    console.log('');

    success('Fetch complete!');
    } catch (err) {
      if (!release) {
        // Lock acquisition failed
        const lockPath = getLockPath('reports', channelId);
        spinner.fail('Could not acquire lock for reports');
        console.log('');
        error('Another fetch operation is in progress. Wait for it to complete, or remove the lock:');
        error(`  rm ${lockPath}`);
      } else {
        // Lock was acquired, error occurred during operation
        await release();  // Release lock before exiting
        spinner.fail('Failed while fetching reports');
        error((err as Error).message);
      }
      process.exit(1);
    } finally {
      if (release) await release();
    }
  });
}

export = fetchReportsCommand;
