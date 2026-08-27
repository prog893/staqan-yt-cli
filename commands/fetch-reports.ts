import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, debug, success, warning, initCommand, withSpinner, formatTimestampWithTimezone, validateDateOption, validateDateRange, withRateLimitRetry, runOrExit } from '../lib/utils';
import {
  isReportCached,
  saveReportToCache,
  loadCacheIndex,
  loadReportMetadata,
  ensureCacheDir,
} from '../lib/cache';
import { getAuthenticatedChannelId, assertChannelMatchesAuthenticated } from '../lib/youtube';
import { getConfigValue, getLockTimeout } from '../lib/config';
import { acquireLock, getLockPath } from '../lib/lock';
import { downloadReport } from '../lib/reports';
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
 * Fetch and archive all available report data
 */
async function fetchReportsCommand(options: FetchReportsOptions): Promise<void> {
  initCommand(options);
  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  await withSpinner('Initializing...', 'Failed to fetch reports', async (spinner) => {
    // Resolve the cache namespace from the AUTHENTICATED channel. The
    // Reporting API always returns data for whoever's authenticated — there's
    // no channel parameter and `onBehalfOfContentOwner` is always undefined in
    // this CLI — so the cache has to be keyed by the same channel or we
    // silently write the authed account's data under another channel's path
    // (issue #153).
    //
    // `--channel` / `default.channel` is accepted only for validation: today
    // it can only name the authed channel (no multi-account auth-swap yet,
    // see #153), so we resolve it and fail loudly on mismatch. That surfaces
    // stale `default.channel` config or a wrong `--channel` instead of
    // letting the bug recur. The shared helper keeps the message identical
    // across fetchReportData and fetch-reports.
    spinner.text = 'Resolving authenticated channel...';
    const channelId = await getAuthenticatedChannelId();
    const requestedChannel = options.channel || await getConfigValue('default.channel');
    await assertChannelMatchesAuthenticated(requestedChannel, channelId);
    debug(`Using authenticated channel ID for cache namespace: ${channelId}`);

    // Ensure cache directory exists before touching the lock
    try {
      await ensureCacheDir(channelId);
    } catch (err) {
      throw new Error(`Failed to create cache directory: ${(err as Error).message}`);
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
          throw new Error('--types cannot be empty. Provide comma-separated type IDs or omit the flag.');
        }
        const availableIds = new Set(reportTypes.map(t => t.id).filter((id): id is string => Boolean(id)));
        const invalidIds = requestedIds.filter(id => !availableIds.has(id));
        if (invalidIds.length > 0) {
          throw new Error(`Unknown report type ID(s): ${invalidIds.join(', ')}`);
        }
        reportTypes = reportTypes.filter(t => requestedIds.includes(t.id!));
        debug(`Filtering by multiple types: ${requestedIds.join(', ')}`);
      }

      if (reportTypes.length === 0) {
        throw new Error('No report types found matching your criteria.');
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

      // Filter by date range if specified (compare date portions only).
      //
      // Use *overlap* semantics, not full-containment: a report counts as
      // matching if any day in its [startTime, endTime] window falls inside
      // the requested [filteredStart, filteredEnd] range. The previous
      // implementation required the report window to be fully contained,
      // which silently dropped weekly/monthly reports that started before
      // --start-date or ended after --end-date — exactly the reports users
      // hit when trying to recover from bug #52 (overlap on the recovery
      // window) with `fetch-reports --force --start-date ... --end-date ...`.
      //
      // Overlap formula: reportStart <= filteredEnd && reportEnd >= filteredStart
      if (options.startDate || options.endDate) {
        const allMinDate = reports[reports.length - 1].startTime!.split('T')[0]; // Oldest
        const allMaxDate = reports[0].endTime!.split('T')[0]; // Newest
        const filteredStart = (options.startDate || allMinDate).split('T')[0];
        const filteredEnd = (options.endDate || allMaxDate).split('T')[0];

        try {
          validateDateRange(filteredStart, filteredEnd);
        } catch (e) {
          throw new Error(`${(e as Error).message}\nProvided: start-date=${filteredStart}, end-date=${filteredEnd}`);
        }

        reports = reports.filter((report: typeof reports[0]) => {
          const reportStart = report.startTime!.split('T')[0];
          const reportEnd = report.endTime!.split('T')[0];
          // Overlap: any day in [reportStart, reportEnd] is also in
          // [filteredStart, filteredEnd]. With only one bound provided the
          // other side of the inequality is always true, so a missing flag
          // doesn't tighten the filter.
          return reportStart <= filteredEnd && reportEnd >= filteredStart;
        });

        debug(`Filtered to ${reports.length} report(s) overlapping date range`);
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
            createTime: report.createTime || undefined,
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
      let rebuilt = 0;

      for (const entry of index.entries) {
        const metadata = await loadReportMetadata(channelId, entry.reportId, entry.reportTypeId);

        if (!metadata) {
          warning(`Missing metadata: ${entry.reportId}`);
          corrupted++;
          continue;
        }

        if (metadata.isComplete === false) {
          warning(`Incomplete file: ${entry.reportId}`);
          corrupted++;
          continue;
        }

        // A rebuilt sidecar is not an issue, but it is not a clean bill of
        // health either: its completeness was never recorded, so --verify
        // counts it separately rather than folding it into either total.
        if (metadata.rebuiltAt) {
          rebuilt++;
          continue;
        }

        verified++;
      }

      const rebuiltNote = rebuilt > 0 ? `, ${rebuilt} rebuilt (completeness unverifiable)` : '';
      spinner.succeed(`Verification complete: ${verified} OK, ${corrupted} issues${rebuiltNote}`);
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
      // Translate lock *contention* into an actionable message. acquireLock
      // throws "Failed to acquire lock <path> after <ms>ms" only when the
      // lock stayed held past the timeout; permission/filesystem failures
      // propagate unchanged so they aren't misreported as a concurrent run
      // (CodeRabbit on #132). Everything rethrows — the finally below
      // releases the lock and withSpinner prints and rethrows for the CLI
      // top-level catch to exit(1). No process.exit here: this code path
      // must be survivable when invoked from the MCP server (issue #110).
      if (!release && (err as Error).message?.startsWith('Failed to acquire lock')) {
        throw new Error(
          'Another fetch operation is in progress. Wait for it to complete, or remove the lock:\n' +
          `  rm ${getLockPath('reports', channelId)}`
        );
      }
      throw err;
    } finally {
      if (release) await release();
    }
  });
}

export = fetchReportsCommand;
