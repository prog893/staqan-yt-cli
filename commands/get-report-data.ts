import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, debug, initCommand, withSpinner, formatTimestampWithTimezone } from '../lib/utils';
import { getOutputFormat, getConfigValue } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';
import {
  analyzeCacheCoverage,
  findCachedReports,
  readCachedReport,
  saveReportToCache,
  parseCsvAndExtractRange,
} from '../lib/cache';
import { getChannelId } from '../lib/youtube';
import { CacheIndexEntry } from '../types';
import https from 'https';
import { createWriteStream, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

interface ReportDataOptions {
  type: string;
  channel?: string;
  videoId?: string;
  startDate?: string;
  endDate?: string;
  output?: 'json' | 'csv';
  verbose?: boolean;
}

/**
 * Download a report from YouTube
 */
async function downloadReport(
  report: { id?: string | null; downloadUrl?: string | null; startTime?: string | null; endTime?: string | null; createTime?: string | null },
  auth: { getAccessToken(): Promise<{ token?: string | null }> },
  tmpPath: string
): Promise<{ csvData: string; headers: string[]; data: Record<string, string>[] }> {
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

  return { csvData, headers: parsed.headers, data: parsed.data };
}

/**
 * Get YouTube Reporting API report data
 * Downloads and parses bulk reports (CTR, impressions, etc.)
 * WITH CACHING SUPPORT
 */
async function getReportDataCommand(options: ReportDataOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Checking for existing reporting job...', 'Failed to fetch report data', async (spinner) => {
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

    const auth = await getAuthenticatedClient();
    const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

    // Step 1: Find or create reporting job

    const jobsResponse = await youtubeReporting.jobs.list({
      onBehalfOfContentOwner: undefined,
    });

    const jobs = jobsResponse.data.jobs || [];
    const matchingJob = jobs.find((job: typeof jobs[0]) => job.reportTypeId === options.type);

    let jobId: string;

    if (matchingJob) {
      jobId = matchingJob.id!;
      debug(`Found existing job: ${jobId}`);
    } else {
      // Create new job
      spinner.text = `Creating new reporting job for type: ${options.type}...`;

      const createResponse = await youtubeReporting.jobs.create({
        requestBody: {
          reportTypeId: options.type,
          name: `${options.type} Report Job`,
        },
      });

      jobId = createResponse.data.id!;
      const jobCreated = new Date(createResponse.data.createTime || '');
      const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);
      const formatted = formatTimestampWithTimezone(readyAt);

      spinner.succeed(`Created new job: ${jobId}`);
      console.log('');
      console.log(chalk.gray('First report available:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log('');
      console.log(chalk.yellow('Run this command again after:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log('');

      process.exit(0);
    }

    // Step 2: Check if reports are available
    spinner.text = 'Fetching available reports...';

    const reportsResponse = await youtubeReporting.jobs.reports.list({
      jobId,
      onBehalfOfContentOwner: undefined,
    });

    let reports = reportsResponse.data.reports || [];

    if (reports.length === 0) {
      // Job exists but no reports yet (within 48h window)
      const jobCreated = new Date(matchingJob!.createTime || '');
      const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);
      const now = new Date();
      const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
      const formatted = formatTimestampWithTimezone(readyAt);

      spinner.succeed('Job exists but no reports yet');
      console.log('');
      console.log(chalk.gray('Created:') + ' ' + matchingJob!.createTime);
      console.log(chalk.gray('Ready:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log(chalk.yellow('Wait:') + ' ' + chalk.cyan(`${hoursUntilReady} hours remaining`));
      console.log('');

      process.exit(0);
    }

    // Step 3: Validate date range (API returns timestamps, compare date portions only)
    const minDate = reports[reports.length - 1].startTime!.split('T')[0]; // Oldest
    const maxDate = reports[0].endTime!.split('T')[0]; // Newest

    const requestedStart = options.startDate || minDate;
    const requestedEnd = options.endDate || maxDate;

    // Check if requested range is available
    if (!minDate || !maxDate || !requestedStart || !requestedEnd) {
      spinner.fail('Unable to determine date range');
      console.log('');
      error('Unable to determine date range');
      process.exit(1);
    }

    if (requestedStart < minDate || requestedEnd > maxDate) {
      spinner.fail('Data not available for requested date range');
      console.log('');
      error(`Data not available for requested date range`);
      console.log(chalk.gray('Available:') + ` ${minDate} to ${maxDate}`);
      console.log(chalk.gray('Requested:') + ` ${requestedStart} to ${requestedEnd}`);
      console.log('');

      if (requestedStart < minDate) {
        const missingDays = Math.ceil((new Date(minDate).getTime() - new Date(requestedStart).getTime()) / (24 * 60 * 60 * 1000));
        console.log(chalk.red('Missing:') + ` ${requestedStart} to ${minDate} (${missingDays} days, expired and deleted)`);
        console.log(chalk.yellow('Tip:') + ' Run fetch-reports regularly to keep a local archive and avoid data loss:');
        console.log(chalk.gray('       ') + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}`));
        console.log('');
      }

      if (requestedEnd > maxDate) {
        console.log(chalk.red('Future dates not available:') + ` ${maxDate} to ${requestedEnd}`);
        console.log('');
      }

      process.exit(1);
    }

    // Step 4: Filter reports by date range (compare date portions only)
    reports = reports.filter((report: typeof reports[0]) => {
      const reportStart = report.startTime!.split('T')[0];
      const reportEnd = report.endTime!.split('T')[0];
      return reportStart >= requestedStart && reportEnd <= requestedEnd;
    });

    if (reports.length === 0) {
      spinner.fail('No reports match the specified date range');
      console.log('');
      error('No reports match the specified date range.');
      process.exit(1);
    }

    // Step 5: Analyze cache coverage
    spinner.text = 'Analyzing cache coverage...';
    const coverage = await analyzeCacheCoverage(channelId, options.type, requestedStart, requestedEnd);
    debug('Cache coverage:', coverage);

    // Step 6: Load cached data
    const allData: Record<string, string>[] = [];
    const cachedReports: CacheIndexEntry[] = [];

    for (const range of coverage.fullyCovered) {
      const [start, end] = range.split('/');
      const cached = await findCachedReports(channelId, options.type, start, end);

      for (const cachedReport of cached) {
        const reportData = await readCachedReport(channelId, cachedReport.reportId, options.type);
        if (reportData) {
          allData.push(...reportData.data);
          cachedReports.push(cachedReport);
          debug(`Loaded from cache: ${cachedReport.reportId}`);
        }
      }
    }

    if (cachedReports.length > 0) {
      spinner.text = `Loaded ${cachedReports.length} report(s) from cache`;
    }

    // Step 7: Fetch missing data
    const reportsToFetch: { id?: string | null; startTime?: string | null; endTime?: string | null; createTime?: string | null; downloadUrl?: string | null }[] = [];

    // Build list of missing date ranges
    const missingRanges = [
      ...coverage.partiallyCovered.map(p => p.missing),
      ...coverage.notCovered.map(r => {
        const [start, end] = r.split('/');
        return { start, end };
      }),
    ];

    // Filter reports to only fetch those covering missing ranges
    for (const report of reports) {
      const reportStart = report.startTime!;
      const reportEnd = report.endTime!;

      const coversMissing = missingRanges.some(range => {
        return reportStart <= range.end && reportEnd >= range.start;
      });

      if (coversMissing) {
        reportsToFetch.push(report);
      }
    }

    if (reportsToFetch.length > 0) {
      spinner.text = `Fetching ${reportsToFetch.length} report(s) from API...`;
    }

    const tmpDir = '/tmp';

    for (let i = 0; i < reportsToFetch.length; i++) {
      const report = reportsToFetch[i];
      const tmpPath = path.join(tmpDir, `${report.id}.csv`);

      spinner.text = `Downloading report ${i + 1}/${reportsToFetch.length}...`;

      // Download report
      const { csvData, headers, data } = await downloadReport(report, auth, tmpPath);

      // Calculate expiration date
      const jobCreated = new Date(matchingJob!.createTime || '');
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);

      // Parse CSV to get actual date range
      const parsed = parseCsvAndExtractRange(csvData);

      // Save to cache
      await saveReportToCache(channelId, report.id || '', options.type, csvData, {
        reportId: report.id || '',
        reportTypeId: options.type,
        channelId,
        jobId,
        startTime: report.startTime || '',
        endTime: report.endTime || '',
        startTimeActual: parsed.minDate,
        endTimeActual: parsed.maxDate,
        downloadedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        downloadUrl: report.downloadUrl || '',
        columns: headers,
        isComplete: true,
        fileSize: csvData.length,
        row_count: data.length,
      });

      allData.push(...data);

      // Cleanup
      try {
        unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup errors
      }

      debug(`Downloaded: ${report.startTime} to ${report.endTime}`);
    }

    spinner.succeed(`Retrieved ${cachedReports.length} cached + ${reportsToFetch.length} new report(s)`);
    console.log('');

    // Step 8: Filter by video ID if specified
    let filteredData = allData;
    if (options.videoId) {
      filteredData = allData.filter(row => row.video_id === options.videoId);

      if (filteredData.length === 0) {
        spinner.fail('No data found for video ID');
        console.log('');
        error(`No data found for video ID: ${options.videoId}`);
        console.log('');
        console.log(chalk.gray('Available video IDs in this date range:'));
        const uniqueVideoIds = [...new Set(allData.map(row => row.video_id))];
        uniqueVideoIds.forEach((vid, i) => {
          if (i < 10) console.log('  ' + chalk.cyan(vid));
        });
        if (uniqueVideoIds.length > 10) {
          console.log(chalk.gray(`  ... and ${uniqueVideoIds.length - 10} more`));
        }
        console.log('');
        process.exit(1);
      }
    }

    // Step 9: Output based on format
    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(filteredData));
        break;

      case 'csv':
        console.log(formatCsv(filteredData));
        break;

      case 'text':
        console.log(formatText(filteredData));
        break;

      case 'table':
        console.log(formatTable(filteredData));
        break;

      case 'pretty':
      default:
        // Human-readable output
        if (filteredData.length === 0) {
          console.log(chalk.gray('No data found'));
        } else {
          filteredData.forEach((row, idx) => {
            if (idx > 0) console.log(chalk.gray('─'.repeat(80)));
            console.log(chalk.bold.cyan(`Date: ${row.date}`));
            console.log(chalk.gray('Video ID:') + ' ' + chalk.yellow(row.video_id || 'N/A'));
            console.log(chalk.gray('Impressions:') + ' ' + chalk.yellow(row.video_thumbnail_impressions || '0'));
            console.log(chalk.gray('CTR:') + ' ' + chalk.yellow(row.video_thumbnail_impressions_ctr || '0'));
            console.log('');
          });
        }
        break;
    }

    // Step 10: Show expiration warning for the reports used
    const now = new Date();
    const jobCreated = new Date(matchingJob!.createTime || '');

    for (const report of cachedReports) {
      const expiresAt = new Date(report.expiresAt);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiration <= 7) {
        console.log('');
        console.log(chalk.yellow('⚠️  Expiration Notice:'));
        console.log(chalk.gray('  Report:') + ` ${report.startTime} to ${report.endTime} (cached)`);
        console.log(chalk.gray('  Expires:') + ' ' + chalk.red(`${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)`));
        console.log('');
      }
    }

    for (const report of reportsToFetch) {
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiration <= 7) {
        console.log('');
        console.log(chalk.yellow('⚠️  Expiration Notice:'));
        console.log(chalk.gray('  Report:') + ` ${report.startTime} to ${report.endTime} (new)`);
        console.log(chalk.gray('  Expires:') + ' ' + chalk.red(`${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)`));
        console.log(chalk.yellow('  Tip:') + ' Run fetch-reports regularly to keep a local archive:');
        console.log(chalk.gray('         ') + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}`));
        console.log('');
      }
    }

    console.log(chalk.green(`✓ Fetched ${filteredData.length} row(s)`));
    console.log('');
  });
}

export = getReportDataCommand;
