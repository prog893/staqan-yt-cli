import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, debug, success, warning, initCommand, withSpinner, formatTimestampWithTimezone } from '../lib/utils';
import {
  findCachedReports,
  saveReportToCache,
  loadCacheIndex,
  loadReportMetadata,
  parseCsvAndExtractRange,
  ensureCacheDir,
} from '../lib/cache';
import { getChannelId } from '../lib/youtube';
import { getConfigValue } from '../lib/config';
import { acquireLock, getLockPath } from '../lib/lock';
import https from 'https';
import { createWriteStream, unlinkSync } from 'fs';
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
 * Download a report from YouTube
 */
async function downloadReport(
  report: { id?: string | null; downloadUrl?: string | null; startTime?: string | null; endTime?: string | null; createTime?: string | null },
  auth: { getAccessToken(): Promise<{ token?: string | null }> }
): Promise<{ csvData: string; headers: string[]; data: Record<string, string>[]; minDate: string; maxDate: string }> {
  const tmpPath = path.join('/tmp', `${report.id}.csv`);

  // Get access token for authenticated request
  const credentials = await auth.getAccessToken();
  const accessToken = credentials.token || '';

  await new Promise<void>((resolve, reject) => {
    const url = new URL(report.downloadUrl!);

    debug(`Downloading from: ${report.downloadUrl}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    };

    https.get(options, (response) => {
      debug(`Response status: ${response.statusCode}`);

      if (response.statusCode !== 200) {
        unlink(tmpPath).catch(() => {});
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const file = createWriteStream(tmpPath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        unlink(tmpPath).catch(() => {});
        reject(err);
      });
    }).on('error', (err) => {
      unlink(tmpPath).catch(() => {});
      reject(err);
    });
  });

  // Parse CSV
  const fs = await import('fs');
  const csvData = fs.readFileSync(tmpPath, 'utf-8');
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

    // Acquire lock for entire fetch operation
    const lockPath = getLockPath('reports', channelId);
    let release: (() => Promise<void>) | null = null;

    try {
      spinner.text = 'Acquiring lock...';
      await ensureCacheDir(channelId);
      release = await acquireLock(lockPath, { timeout: 60000 }); // 60 second timeout

      spinner.text = 'Initializing...';
      const auth = await getAuthenticatedClient();
      const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

      // Step 1: Discover report types
      spinner.text = 'Discovering report types...';

      const typesResponse = await youtubeReporting.reportTypes.list({
        onBehalfOfContentOwner: undefined,
      });

      let reportTypes = typesResponse.data.reportTypes || [];

      // Filter by --type or --types if specified
      if (options.type) {
        reportTypes = reportTypes.filter(t => t.id === options.type);
        debug(`Filtering by single type: ${options.type}`);
      } else if (options.types) {
        const requestedIds = options.types.split(',');
        reportTypes = reportTypes.filter(t => requestedIds.includes(t.id!));
        debug(`Filtering by multiple types: ${requestedIds.join(', ')}`);
      }

      if (reportTypes.length === 0) {
        spinner.fail('No report types found');
        console.log('');
        error('No report types found matching your criteria.');
        process.exit(1);
      }

      spinner.succeed(`Found ${reportTypes.length} report type(s)`);
      console.log('');

      // Step 2: Process each report type
      let totalDownloaded = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      for (const reportType of reportTypes) {
      const reportTypeId = reportType.id!;
      spinner.text = `Processing ${reportTypeId}...`;

      // Find or create job
      const jobsResponse = await youtubeReporting.jobs.list({
        onBehalfOfContentOwner: undefined,
      });

      const jobs = jobsResponse.data.jobs || [];
      const matchingJob = jobs.find((job: typeof jobs[0]) => job.reportTypeId === reportTypeId);

      let jobId: string;

      if (matchingJob) {
        jobId = matchingJob.id!;
        debug(`Found existing job: ${jobId}`);
      } else {
        // Create new job
        spinner.text = `Creating new job for ${reportTypeId}...`;

        const createResponse = await youtubeReporting.jobs.create({
          requestBody: {
            reportTypeId: reportTypeId,
            name: `${reportTypeId} Report Job`,
          },
        });

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

      // Get reports for this job
      const reportsResponse = await youtubeReporting.jobs.reports.list({
        jobId,
        onBehalfOfContentOwner: undefined,
      });

      let reports = reportsResponse.data.reports || [];

      if (reports.length === 0) {
        debug(`No reports available for ${reportTypeId}`);
        continue;
      }

      // Filter by date range if specified (compare date portions only)
      if (options.startDate || options.endDate) {
        const allMinDate = reports[reports.length - 1].startTime!.split('T')[0]; // Oldest
        const allMaxDate = reports[0].endTime!.split('T')[0]; // Newest
        const filteredStart = options.startDate || allMinDate;
        const filteredEnd = options.endDate || allMaxDate;

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

        // Check if already cached
        const cached = await findCachedReports(channelId, reportTypeId, startTime, endTime);

        if (cached.length > 0 && !options.force) {
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

      const index = await loadCacheIndex(channelId);
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
      spinner.fail('Failed to acquire reports lock');
      error((err as Error).message);
      console.log('');
      error('Another fetch operation is in progress. Wait for it to complete or run: rm ~/.staqan-yt-cli/data/*/reports/.lock');
      process.exit(1);
    } finally {
      if (release) await release();
    }
  });
}

export = fetchReportsCommand;
