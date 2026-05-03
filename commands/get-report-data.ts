import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, warning, debug, initCommand, withSpinner, formatTimestampWithTimezone } from '../lib/utils';
import { getOutputFormat, getConfigValue } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';
import {
  analyzeCacheCoverage,
  findCachedReports,
  loadReportMetadata,
  readCachedReport,
  saveReportToCache,
  parseCsvAndExtractRange,
  ensureCacheDir,
} from '../lib/cache';
import { getChannelId } from '../lib/youtube';
import { acquireLock, getLockPath } from '../lib/lock';
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

    // Ensure cache directory exists before attempting lock
    try {
      await ensureCacheDir(channelId);
    } catch (err) {
      spinner.fail('Failed to create cache directory');
      error((err as Error).message);
      process.exit(1);
    }

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

    spinner.text = 'Fetching available reports...';

    const allFetchedReports: any[] = [];
    let reportsPageToken: string | undefined;
    do {
      const reportsResponse = await youtubeReporting.jobs.reports.list({
        jobId,
        onBehalfOfContentOwner: undefined,
        pageToken: reportsPageToken,
      });
      const pageReports = reportsResponse.data.reports || [];
      allFetchedReports.push(...pageReports);
      reportsPageToken = reportsResponse.data.nextPageToken || undefined;
    } while (reportsPageToken);
    let reports = allFetchedReports;

    if (reports.length === 0) {
      // Job exists but no reports yet (within 48h window)
      const jobCreated = new Date(matchingJob.createTime || '');
      const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);
      const now = new Date();
      const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
      const formatted = formatTimestampWithTimezone(readyAt);

      spinner.succeed('Job exists but no reports yet');
      console.log('');
      console.log(chalk.gray('Created:') + ' ' + matchingJob.createTime);
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

    // Validate that start date is not after end date
    if (requestedStart > requestedEnd) {
      spinner.fail('Invalid date range');
      console.log('');
      error('start-date must be before or equal to end-date');
      console.log(chalk.gray('Provided:') + ` start-date=${requestedStart}, end-date=${requestedEnd}`);
      console.log('');
      process.exit(1);
    }

    // Adjust date range to available data if needed.
    // Consider both API range and local cache — cache may contain data that
    // has expired from the API, or may be the only source if API returns nothing.
    // Use actual CSV data dates (from metadata) rather than API report windows
    // which span 2 calendar days and would overstate coverage.
    const cacheEntries = await findCachedReports(channelId, options.type, requestedStart, requestedEnd);
    let effectiveMinDate = minDate;
    let effectiveMaxDate = maxDate;
    if (cacheEntries.length > 0) {
      const cacheDates = await Promise.all(
        cacheEntries.map(async (e) => {
          const meta = await loadReportMetadata(channelId, e.reportId, options.type);
          if (meta?.startTimeActual) {
            const s = meta.startTimeActual;
            return {
              min: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
              max: meta.endTimeActual
                ? `${meta.endTimeActual.slice(0, 4)}-${meta.endTimeActual.slice(4, 6)}-${meta.endTimeActual.slice(6, 8)}`
                : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
            };
          }
          return { min: e.startTime.split('T')[0], max: e.endTime.split('T')[0] };
        })
      );
      const cacheEarliest = cacheDates.reduce((min, d) => d.min < min ? d.min : min, '9999-99-99');
      const cacheLatest = cacheDates.reduce((max, d) => d.max > max ? d.max : max, '');
      if (cacheEarliest < effectiveMinDate) effectiveMinDate = cacheEarliest;
      if (cacheLatest > effectiveMaxDate) effectiveMaxDate = cacheLatest;
    }

    const adjustedStart = requestedStart < effectiveMinDate ? effectiveMinDate : requestedStart;
    const adjustedEnd = requestedEnd > effectiveMaxDate ? effectiveMaxDate : requestedEnd;

    // Validate that adjusted range has overlap (i.e., requested range is not entirely before/after available data)
    if (adjustedStart > adjustedEnd) {
      spinner.fail('No overlap between requested range and available data');
      process.stderr.write('\n');
      process.stderr.write(chalk.red('Error:') + ' Requested date range has no overlap with available data\n');
      process.stderr.write(chalk.gray('Requested:') + ` ${requestedStart} to ${requestedEnd}\n`);
      process.stderr.write(chalk.gray('Available:') + ` ${effectiveMinDate} to ${effectiveMaxDate}\n`);
      process.stderr.write('\n');
      process.exit(1);
    }

    // Warn if range was adjusted
    if (adjustedStart !== requestedStart || adjustedEnd !== requestedEnd) {
      spinner.warn('Adjusting date range to available data');
      process.stderr.write('\n');
      process.stderr.write(chalk.yellow('Warning:') + ' Requested date range extends beyond available data\n');
      process.stderr.write(chalk.gray('Requested:') + ` ${requestedStart} to ${requestedEnd}\n`);
      process.stderr.write(chalk.gray('Will return:') + ` ${adjustedStart} to ${adjustedEnd}\n`);
      process.stderr.write('\n');

      if (requestedStart < effectiveMinDate) {
        const dayBeforeMin = new Date(new Date(effectiveMinDate).getTime() - 86400000).toISOString().split('T')[0];
        const missingDays = Math.ceil((new Date(dayBeforeMin).getTime() - new Date(requestedStart).getTime()) / (24 * 60 * 60 * 1000)) + 1;
        process.stderr.write(chalk.red('Missing:') + ` ${requestedStart} to ${dayBeforeMin} (${missingDays} days, expired and deleted)\n`);
        process.stderr.write(chalk.yellow('Tip:') + ' Run fetch-reports regularly to keep a local archive and avoid data loss:\n');
        process.stderr.write(chalk.gray('       ') + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}\n`));
        process.stderr.write('\n');
      }

      if (requestedEnd > effectiveMaxDate) {
        const dayAfterMax = new Date(new Date(effectiveMaxDate).getTime() + 86400000).toISOString().split('T')[0];
        process.stderr.write(chalk.red('Future dates not available:') + ` ${dayAfterMax} to ${requestedEnd}\n`);
        process.stderr.write('\n');
      }
    }

    // Step 4: Filter reports by date range (compare date portions only)
    // These are API reports — used for fetching data not yet in cache.
    const filteredReports = reports.filter((report: typeof reports[0]) => {
      const reportStart = report.startTime!.split('T')[0];
      const reportEnd = report.endTime!.split('T')[0];
      return reportStart >= adjustedStart && reportEnd <= adjustedEnd;
    });
    reports = filteredReports;

    // It's okay if no API reports match — data may still be available from cache
    // (e.g. expired from API but present in local archive).
    if (reports.length === 0 && cacheEntries.length === 0) {
      spinner.fail('No reports match the specified date range');
      console.log('');
      error('No reports match the specified date range.');
      process.exit(1);
    }

    // Step 5: Analyze cache coverage
    spinner.text = 'Analyzing cache coverage...';
    const coverage = await analyzeCacheCoverage(channelId, options.type, adjustedStart, adjustedEnd);
    debug('Cache coverage:', coverage);

    // Step 6: Load cached data
    let allData: Record<string, string>[] = [];
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

    // Acquire lock just before writes; soft-fail with warning if busy
    let writeRelease: (() => Promise<void>) | null = null;
    try {
      writeRelease = await acquireLock(getLockPath('reports', channelId), { timeout: 5000 });
    } catch {
      console.log(chalk.gray('Info: could not acquire lock for reports, skipping cache update'));
    }

    try {
      for (let i = 0; i < reportsToFetch.length; i++) {
        const report = reportsToFetch[i];
        const tmpPath = path.join(tmpDir, `${report.id}.csv`);

        spinner.text = `Downloading report ${i + 1}/${reportsToFetch.length}...`;

        // Download report
        const { csvData, headers, data } = await downloadReport(report, auth, tmpPath);

        // Calculate expiration date
        const jobCreated = new Date(matchingJob.createTime || '');
        const reportCreated = new Date(report.createTime || '');
        const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
        const expirationDays = isHistorical ? 30 : 60;
        const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);

        // Parse CSV to get actual date range
        const parsed = parseCsvAndExtractRange(csvData);

        if (writeRelease) {
          // Save to cache (non-fatal: warn on failure so API data is still returned)
          try {
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
          } catch (cacheErr) {
            warning(`Cache save failed for ${report.id}: ${(cacheErr as Error).message} — data will be re-fetched on next run`);
          }
        }

        allData.push(...data);

        // Cleanup
        try {
          unlinkSync(tmpPath);
        } catch {
          // Ignore cleanup errors
        }

        debug(`Downloaded: ${report.startTime} to ${report.endTime}`);
      }
    } finally {
      if (writeRelease) await writeRelease();
    }

    spinner.succeed(`Retrieved ${cachedReports.length} cached + ${reportsToFetch.length} new report(s)`);
    process.stderr.write('\n');

    // Deduplicate rows by (date, video_id) — YouTube may serve duplicate
    // reports with slightly different values for the same day; keep last seen.
    const seen = new Map<string, number>();
    allData = allData.filter((row, i) => {
      const key = `${row.date}|${row.video_id}`;
      const prev = seen.get(key);
      if (prev !== undefined) {
        // Keep the later entry (overwrite)
        return i === prev;
      }
      seen.set(key, i);
      return true;
    });
    // Deduplicate: last-write-wins (Map preserves insertion order)
    const dedupMap = new Map<string, Record<string, string>>();
    for (const row of allData) {
      dedupMap.set(`${row.date}|${row.video_id}`, row);
    }
    allData = [...dedupMap.values()];

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

    // Step 10: Warn about missing dates in the returned data
    if (filteredData.length > 0) {
      const returnedDates = new Set(filteredData.map(row => row.date));
      // Generate expected date range
      const rangeStart = new Date(adjustedStart);
      const rangeEnd = new Date(adjustedEnd);
      const expectedDates: string[] = [];
      const current = new Date(rangeStart);
      while (current <= rangeEnd) {
        expectedDates.push(current.toISOString().split('T')[0].replace(/-/g, ''));
        current.setDate(current.getDate() + 1);
      }
      const missingDates = expectedDates.filter(d => !returnedDates.has(d));
      if (missingDates.length > 0) {
        // Format missing dates for display (group consecutive only)
        const formattedMissing = missingDates.map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
        const gaps: { start: string; end: string }[] = [];
        let gapStart = formattedMissing[0];
        let gapEnd = formattedMissing[0];
        for (let i = 1; i < formattedMissing.length; i++) {
          const prev = new Date(formattedMissing[i - 1]);
          const curr = new Date(formattedMissing[i]);
          const diffDays = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
          if (diffDays === 1) {
            gapEnd = formattedMissing[i];
          } else {
            gaps.push({ start: gapStart, end: gapEnd });
            gapStart = formattedMissing[i];
            gapEnd = formattedMissing[i];
          }
        }
        gaps.push({ start: gapStart, end: gapEnd });

        process.stderr.write('\n');
        process.stderr.write(chalk.yellow('⚠️  Incomplete Data:\n'));
        process.stderr.write(chalk.gray(`  Requested: ${adjustedStart} to ${adjustedEnd} (${expectedDates.length} days)\n`));
        process.stderr.write(chalk.gray(`  Returned:  ${returnedDates.size} of ${expectedDates.length} days\n`));
        process.stderr.write(chalk.gray('  Missing:\n'));
        for (const gap of gaps) {
          const days = Math.round((new Date(gap.end).getTime() - new Date(gap.start).getTime()) / (24 * 60 * 60 * 1000)) + 1;
          if (gap.start === gap.end) {
            process.stderr.write(chalk.red(`    ${gap.start}\n`));
          } else {
            process.stderr.write(chalk.red(`    ${gap.start} → ${gap.end} (${days} days)\n`));
          }
        }
        process.stderr.write(chalk.yellow('  Tip:') + ' Data may have expired from YouTube or was never archived.\n');
        process.stderr.write(chalk.gray('       ') + 'Run ' + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}`) + ' to archive available data.\n');
        process.stderr.write('\n');
      }
    }

    // Step 11: Show expiration warning for the reports used
    const now = new Date();
    const jobCreated = new Date(matchingJob.createTime || '');

    for (const report of cachedReports) {
      const expiresAt = new Date(report.expiresAt);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiration <= 7) {
        process.stderr.write('\n');
        process.stderr.write(chalk.yellow('⚠️  Expiration Notice:\n'));
        process.stderr.write(chalk.gray('  Report:') + ` ${report.startTime} to ${report.endTime} (cached)\n`);
        process.stderr.write(chalk.gray('  Expires:') + ' ' + chalk.red(`${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)\n`));
        process.stderr.write('\n');
      }
    }

    for (const report of reportsToFetch) {
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiration <= 7) {
        process.stderr.write('\n');
        process.stderr.write(chalk.yellow('⚠️  Expiration Notice:\n'));
        process.stderr.write(chalk.gray('  Report:') + ` ${report.startTime} to ${report.endTime} (new)\n`);
        process.stderr.write(chalk.gray('  Expires:') + ' ' + chalk.red(`${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)\n`));
        process.stderr.write(chalk.yellow('  Tip:') + ' Run fetch-reports regularly to keep a local archive:\n');
        process.stderr.write(chalk.gray('         ') + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}\n`));
        process.stderr.write('\n');
      }
    }

    process.stderr.write(chalk.green(`✓ Fetched ${filteredData.length} row(s)\n`));
    process.stderr.write('\n');
  });
}

export = getReportDataCommand;
