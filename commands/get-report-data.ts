import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, setVerbose, debug } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';
import https from 'https';
import { createWriteStream, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';

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

  const spinner = ora('Checking for existing reporting job...').start();

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
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

      spinner.succeed(`Created new job: ${jobId}`);
      console.log('');
      console.log(chalk.gray('First report available:') + ' ' + chalk.cyan(readyAt.toISOString()));
      console.log(chalk.gray('Local time:') + ' ' + chalk.cyan(readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })));
      console.log('');
      console.log(chalk.yellow('Run this command again after:') + ' ' + chalk.cyan(readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })));
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

      spinner.succeed('Job exists but no reports yet');
      console.log('');
      console.log(chalk.gray('Created:') + ' ' + matchingJob!.createTime);
      console.log(chalk.gray('Ready:') + ' ' + chalk.cyan(readyAt.toISOString()));
      console.log(chalk.gray('Local time:') + ' ' + chalk.cyan(readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })));
      console.log(chalk.yellow('Wait:') + ' ' + chalk.cyan(`${hoursUntilReady} hours remaining`));
      console.log('');

      process.exit(0);
    }

    // Step 3: Validate date range
    const minDate = reports[reports.length - 1].startTime; // Oldest
    const maxDate = reports[0].endTime; // Newest

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
        console.log(chalk.yellow('Tip:') + ' Download reports before expiration to avoid data loss');
        console.log(chalk.yellow('Tip:') + ` Run 'staqan-yt download-expiring-reports --type=${options.type}'`);
        console.log('');
      }

      if (requestedEnd > maxDate) {
        console.log(chalk.red('Future dates not available:') + ` ${maxDate} to ${requestedEnd}`);
        console.log('');
      }

      process.exit(1);
    }

    // Step 4: Filter reports by date range
    reports = reports.filter((report: typeof reports[0]) => {
      return report.startTime! >= requestedStart && report.endTime! <= requestedEnd;
    });

    if (reports.length === 0) {
      spinner.fail('No reports match the specified date range');
      console.log('');
      error('No reports match the specified date range.');
      process.exit(1);
    }

    // Step 5: Download all matching reports
    const allData: any[] = [];
    const tmpDir = '/tmp';

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      const tmpPath = path.join(tmpDir, `${report.id}.csv`);

      spinner.text = `Downloading report ${i + 1}/${reports.length}...`;

      // Get access token for authenticated request
      const credentials = await auth.getAccessToken();
      const accessToken = credentials.token;

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

      debug(`Downloaded: ${report.startTime} to ${report.endTime}`);
    }

    spinner.succeed(`Downloaded ${reports.length} report(s)`);
    console.log('');

    // Step 6: Filter by video ID if specified
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

    // Step 7: Output based on format
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
        console.log('');
        console.log(chalk.yellow('⚠️  Expiration Notice:'));
        console.log(chalk.gray('  Report:') + ` ${report.startTime} to ${report.endTime}`);
        console.log(chalk.gray('  Expires:') + ' ' + chalk.red(`${expiresAt.toISOString().split('T')[0]} (${daysUntilExpiration} days remaining)`));
        console.log(chalk.yellow('  Tip:') + ` Run 'staqan-yt download-expiring-reports --type=${options.type}' to archive it`);
        console.log('');
      }
    }

    console.log(chalk.green(`✓ Fetched ${filteredData.length} row(s)`));
    console.log('');

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail('Failed to fetch report data');
    console.log('');
    error(`Failed to fetch report data: ${message}`);

    if (message.includes('API not enabled')) {
      console.log('');
      console.log(chalk.red('YouTube Reporting API is not enabled.'));
      console.log(chalk.gray('Enable it at:') + ' https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = getReportDataCommand;
