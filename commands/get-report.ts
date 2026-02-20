import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, progress, success, setVerbose, debug } from '../lib/utils';
import https from 'https';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';

interface ReportOptions {
  type: string;
  output?: 'json' | 'csv';
  startDate?: string;
  endDate?: string;
  latest?: boolean;
  verbose?: boolean;
}

/**
 * Download YouTube Reporting API report
 */
async function getReportCommand(options: ReportOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
    // Step 1: Find or create reporting job
    progress('Looking for existing reporting jobs...\n');

    const jobsResponse = await youtubeReporting.jobs.list({
      onBehalfOfContentOwner: undefined,
    });

    const jobs = jobsResponse.data.jobs || [];
    const matchingJob = jobs.find((job: typeof jobs[0]) => job.reportTypeId === options.type);

    let jobId: string;

    if (matchingJob) {
      jobId = matchingJob.id!;
      success(`Found existing job: ${matchingJob.name} (${jobId})\n`);
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
      success(`Created new job: ${jobId}\n`);
      info('Note: First report may take up to 48 hours to generate.\n');
      return;
    }

    // Step 2: List available reports for this job
    progress('Fetching available reports...\n');

    const reportsResponse = await youtubeReporting.jobs.reports.list({
      jobId,
      onBehalfOfContentOwner: undefined,
    });

    let reports = (await reportsResponse).data.reports || [];

    if (reports.length === 0) {
      error('No reports available yet.');
      info('Reports are generated daily. First report takes up to 48 hours after job creation.');
      info(`Job created: ${new Date().toISOString()}, first report expected by ${new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()}`);
      console.error('WARNING: Data for the first 48 hours after job creation will not be available.');
      return;
    }

    info(`Found ${reports.length} report(s)\n`);

    // Check if requested date range overlaps with 48h window after job creation
    if (matchingJob.createTime && (options.startDate || options.endDate)) {
      const jobCreatedTime = new Date(matchingJob.createTime);
      const dataAvailableTime = new Date(jobCreatedTime.getTime() + 48 * 60 * 60 * 1000);

      const checkDate = (dateStr?: string) => dateStr ? new Date(dateStr) : null;
      const startDate = checkDate(options.startDate);
      const endDate = checkDate(options.endDate);

      if (startDate && startDate < dataAvailableTime) {
        console.error(`WARNING: Requested start date (${options.startDate}) is within 48 hours of job creation.`);
        console.error(`         Data may be incomplete or unavailable for dates before ${dataAvailableTime.toISOString().split('T')[0]}.`);
      }
      if (endDate && endDate < dataAvailableTime) {
        console.error(`WARNING: Requested end date (${options.endDate}) is within 48 hours of job creation.`);
        console.error(`         Data may be incomplete or unavailable for dates before ${dataAvailableTime.toISOString().split('T')[0]}.`);
      }
    }

    // Filter by date range if specified
    if (options.startDate || options.endDate) {
      reports = reports.filter((report: typeof reports[0]) => {
        if (options.startDate && report.startTime && report.startTime < options.startDate) {
          return false;
        }
        if (options.endDate && report.endTime && report.endTime > options.endDate) {
          return false;
        }
        return true;
      });
    }

    // Get latest report if requested
    const reportToDownload = options.latest
      ? reports[0]
      : reports[reports.length - 1];

    if (!reportToDownload) {
      error('No reports match the specified criteria.');
      return;
    }

    success(`Downloading report:\n`);
    info(`  Period: ${reportToDownload.startTime} to ${reportToDownload.endTime}\n`);
    info(`  Created: ${reportToDownload.createTime}\n`);

    if (!reportToDownload.downloadUrl) {
      error('Report does not have a download URL.');
      return;
    }

    // Step 3: Download the report
    const outputPath = `/tmp/${reportToDownload.id}.csv`;

    progress('Downloading CSV...\n');

    await new Promise<void>((resolve, reject) => {
      const file = createWriteStream(outputPath);

      https.get(reportToDownload.downloadUrl!, (response) => {
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
          unlink(outputPath).catch(() => {});
          reject(err);
        });
      }).on('error', reject);
    });

    success(`Downloaded to: ${outputPath}\n`);

    // Step 4: Output based on format
    if (options.output === 'json') {
      // Parse CSV and convert to JSON
      const fs = await import('fs');
      const csvData = fs.readFileSync(outputPath, 'utf-8');
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

      console.log(JSON.stringify({
        reportId: reportToDownload.id,
        startTime: reportToDownload.startTime,
        endTime: reportToDownload.endTime,
        createTime: reportToDownload.createTime,
        data,
      }, null, 2));
    } else {
      // Output raw CSV
      const fs = await import('fs');
      const csvData = fs.readFileSync(outputPath, 'utf-8');
      console.log(csvData);
    }

    // Cleanup
    await unlink(outputPath);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to download report: ${message}`);

    if (message.includes('API not enabled')) {
      error('\nYouTube Reporting API is not enabled.');
      error('Enable it at: https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = getReportCommand;
