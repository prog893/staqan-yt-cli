import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, progress, success, setVerbose, debug } from '../lib/utils';
import https from 'https';
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

interface DownloadExpiringReportsOptions {
  type: string;
  days?: number;
  outputDir?: string;
  verbose?: boolean;
}

/**
 * Download reports that are expiring soon
 * Archives reports locally to prevent data loss
 */
async function downloadExpiringReportsCommand(options: DownloadExpiringReportsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const thresholdDays = options.days || 7;
  const defaultOutputDir = path.join(os.homedir(), '.staqan-yt', 'reports');
  const outputDir = options.outputDir || defaultOutputDir;

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    debug(`Output directory: ${outputDir}`);

    // Step 1: Find job
    progress('Finding reporting job...\n');

    const jobsResponse = await youtubeReporting.jobs.list({
      onBehalfOfContentOwner: undefined,
    });

    const jobs = jobsResponse.data.jobs || [];
    const matchingJob = jobs.find((job: typeof jobs[0]) => job.reportTypeId === options.type);

    if (!matchingJob) {
      error(`No job found for report type: ${options.type}`);
      info(`Run 'get-report-data --type=${options.type}' to create a job first.`);
      process.exit(1);
    }

    success(`Found job: ${matchingJob.id}\n`);

    // Step 2: Get all reports
    progress('Fetching available reports...\n');

    const reportsResponse = await youtubeReporting.jobs.reports.list({
      jobId: matchingJob.id!,
      onBehalfOfContentOwner: undefined,
    });

    let reports = reportsResponse.data.reports || [];

    if (reports.length === 0) {
      info('No reports available yet.');
      info('Reports are generated daily. First report takes up to 48 hours after job creation.');
      process.exit(0);
    }

    // Step 3: Filter expiring reports
    const now = Date.now();
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const jobCreated = new Date(matchingJob.createTime || '');

    const expiringReports = reports.filter(report => {
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
      const expiresMs = expiresAt.getTime();
      const remainingMs = expiresMs - now;

      // Only include reports expiring within threshold
      return remainingMs <= thresholdMs && remainingMs > 0;
    });

    if (expiringReports.length === 0) {
      success(`✅ No reports expiring within ${thresholdDays} days`);
      info(`All ${reports.length} report(s) are safe`);
      process.exit(0);
    }

    info(`⚠️  Found ${expiringReports.length} report(s) expiring within ${thresholdDays} days\n`);

    // Step 4: Download each expiring report
    let downloadedCount = 0;
    const skipped: string[] = [];

    for (const report of expiringReports) {
      const reportCreated = new Date(report.createTime || '');
      const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
      const expirationDays = isHistorical ? 30 : 60;
      const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
      const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now) / (24 * 60 * 60 * 1000));

      // Generate filename
      const filename = `${options.type}_${report.startTime}_to_${report.endTime}.csv`;
      const filepath = path.join(outputDir, filename);

      // Check if already downloaded
      if (existsSync(filepath)) {
        skipped.push(`  ✓ ${filename} (already exists, expires in ${daysUntilExpiration} days)`);
        continue;
      }

      progress(`Downloading: ${filename} (expires in ${daysUntilExpiration} days)...\n`);

      await new Promise<void>((resolve, reject) => {
        const file = createWriteStream(filepath);

        https.get(report.downloadUrl!, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            resolve();
          });

          file.on('error', (err) => {
            unlinkSync(filepath);
            reject(err);
          });
        }).on('error', reject);
      });

      success(`  ✓ Downloaded: ${filename}\n`);
      downloadedCount++;
    }

    // Step 5: Summary
    console.log('---\n');
    success(`Downloaded ${downloadedCount} report(s) to ${outputDir}`);

    if (skipped.length > 0) {
      info(`Skipped ${skipped.length} already downloaded:\n`);
      skipped.forEach(s => console.log(s));
    }

    info(`\n💡 Tip: Run this command weekly to stay ahead of expiration`);
    info(`💡 Or use cron: 0 9 * * 0 staqan-yt download-expiring-reports --type=${options.type}\n`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to download reports: ${message}`);

    if (message.includes('API not enabled')) {
      error('\nYouTube Reporting API is not enabled.');
      error('Enable it at: https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = downloadExpiringReportsCommand;
