import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, progress, success, setVerbose, debug } from '../lib/utils';
import https from 'https';
import { createWriteStream, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';

interface ReportDataOptions {
  type: string;
  videoId?: string;
  startDate?: string;
  endDate?: string;
  output?: 'json' | 'csv';
  verbose?: boolean;
}

/**
 * Get YouTube Reporting API report data
 * Downloads and parses bulk reports (CTR, impressions, etc.)
 */
async function getReportDataCommand(options: ReportDataOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
    // Step 1: Find or create reporting job
    progress('Checking for existing reporting job...\n');

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
      progress(`Creating new reporting job for type: ${options.type}\n`);

      const createResponse = await youtubeReporting.jobs.create({
        requestBody: {
          reportTypeId: options.type,
          name: `${options.type} Report Job`,
        },
      });

      jobId = createResponse.data.id!;
      const jobCreated = new Date(createResponse.data.createTime || '');
      const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);

      console.error(`\n⏳  Created new job: ${jobId}`);
      console.error(`⏳  First report available: ${readyAt.toISOString()}`);
      console.error(`⏳  Local time: ${readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })}`);
      console.error(`⏳  Run this command again after ${readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })}\n`);

      process.exit(0);
    }

    // Step 2: Check if reports are available
    progress('Fetching available reports...\n');

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

      console.error(`\n⏳  Job exists but no reports yet`);
      console.error(`⏳  Created: ${matchingJob!.createTime}`);
      console.error(`⏳  Ready: ${readyAt.toISOString()}`);
      console.error(`⏳  Local time: ${readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })}`);
      console.error(`⏳  Wait: ${hoursUntilReady} hours remaining\n`);

      process.exit(0);
    }

    success(`Found ${reports.length} report(s)\n`);

    // Step 3: Validate date range
    const minDate = reports[reports.length - 1].startTime; // Oldest
    const maxDate = reports[0].endTime; // Newest

    const requestedStart = options.startDate || minDate;
    const requestedEnd = options.endDate || maxDate;

    // Check if requested range is available
    if (!minDate || !maxDate || !requestedStart || !requestedEnd) {
      error('Unable to determine date range');
      process.exit(1);
    }

    if (requestedStart < minDate || requestedEnd > maxDate) {
      error(`Data not available for requested date range`);
      info(`Available: ${minDate} to ${maxDate}`);
      info(`Requested: ${requestedStart} to ${requestedEnd}`);

      if (requestedStart < minDate) {
        const missingDays = Math.ceil((new Date(minDate).getTime() - new Date(requestedStart).getTime()) / (24 * 60 * 60 * 1000));
        error(`\nMissing: ${requestedStart} to ${minDate} (${missingDays} days, expired and deleted)`);
        error(`💡 Download reports before expiration to avoid data loss`);
        error(`💡 Run 'staqan-yt download-expiring-reports --type=${options.type}'`);
      }

      if (requestedEnd > maxDate) {
        error(`\nFuture dates not available: ${maxDate} to ${requestedEnd}`);
      }

      process.exit(1);
    }

    // Step 4: Filter reports by date range
    reports = reports.filter((report: typeof reports[0]) => {
      return report.startTime! >= requestedStart && report.endTime! <= requestedEnd;
    });

    if (reports.length === 0) {
      error('No reports match the specified date range.');
      process.exit(1);
    }

    // Step 5: Download all matching reports
    info(`Downloading ${reports.length} report(s)...\n`);

    const allData: any[] = [];
    const tmpDir = '/tmp';

    for (const report of reports) {
      const tmpPath = path.join(tmpDir, `${report.id}.csv`);

      progress(`  Downloading: ${report.startTime} to ${report.endTime}...\n`);

      // Get access token for authenticated request
      const accessToken = await auth.getAccessToken();

      await new Promise<void>((resolve, reject) => {
        const url = new URL(report.downloadUrl!);

        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        };

        https.get(options, (response) => {
          if (response.statusCode === 401 || response.statusCode === 403) {
            unlink(tmpPath).catch(() => {});
            error(`HTTP ${response.statusCode}: Unauthorized`);
            error(`\nYour access token may lack the required scope for YouTube Reporting API.`);
            error(`Please run: staqan-yt auth`);
            error(`This will re-authenticate and add the necessary permissions.`);
            process.exit(1);
          }
          
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
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',');

      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj: Record<string, string> = {};
        headers.forEach((header, i) => {
          obj[header] = values[i];
        });
        return obj;
      });

      allData.push(...data);

      // Cleanup
      try {
        unlinkSync(tmpPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      success(`  ✓ Downloaded: ${report.startTime} to ${report.endTime}\n`);
    }

    // Step 6: Filter by video ID if specified
    let filteredData = allData;
    if (options.videoId) {
      filteredData = allData.filter(row => row.video_id === options.videoId);

      if (filteredData.length === 0) {
        error(`No data found for video ID: ${options.videoId}`);
        info(`Available video IDs in this date range:`);
        const uniqueVideoIds = [...new Set(allData.map(row => row.video_id))];
        uniqueVideoIds.forEach((vid, i) => {
          if (i < 10) info(`  - ${vid}`);
        });
        if (uniqueVideoIds.length > 10) {
          info(`  ... and ${uniqueVideoIds.length - 10} more`);
        }
        process.exit(1);
      }
    }

    // Step 7: Output based on format
    if (options.output === 'json') {
      console.log(JSON.stringify(filteredData, null, 2));
    } else {
      // Output as CSV
      if (filteredData.length > 0) {
        const headers = Object.keys(filteredData[0]);
        console.log(headers.join(','));
        filteredData.forEach(row => {
          console.log(headers.map(h => row[h]).join(','));
        });
      }
    }

    // Step 8: Show expiration warning for the reports used
    const now = new Date();
    const jobCreated = new Date(matchingJob!.createTime || '');

    for (const report of reports) {
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiration <= 7) {
        console.error(`\n⚠️  Expiration Notice:`);
        console.error(`  This data is from report: ${report.startTime} to ${report.endTime}`);
        console.error(`  Report expires: ${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)`);
        console.error(`  Run 'staqan-yt download-expiring-reports --type=${options.type}' to archive it\n`);
      }
    }

    success(`\n✓ Fetched ${filteredData.length} row(s)\n`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to fetch report data: ${message}`);

    if (message.includes('API not enabled')) {
      error('\nYouTube Reporting API is not enabled.');
      error('Enable it at: https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = getReportDataCommand;
