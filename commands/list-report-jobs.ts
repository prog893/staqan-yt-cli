import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, success, setVerbose, debug } from '../lib/utils';

interface ListReportJobsOptions {
  type?: string;
  output?: 'json' | 'table' | 'text';
  verbose?: boolean;
}

/**
 * List YouTube Reporting API jobs
 * Shows all jobs or filters by report type
 */
async function listReportJobsCommand(options: ListReportJobsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
    info('Fetching reporting jobs...\n');

    const jobsResponse = await youtubeReporting.jobs.list({
      onBehalfOfContentOwner: undefined,
    });

    let jobs = jobsResponse.data.jobs || [];

    if (jobs.length === 0) {
      error('No reporting jobs found for this channel.');
      info('Jobs are created automatically when you run get-report-data for the first time.');
      return;
    }

    // Filter by report type if specified
    if (options.type) {
      jobs = jobs.filter(job => job.reportTypeId === options.type);
      if (jobs.length === 0) {
        error(`No jobs found for report type: ${options.type}`);
        info(`Run 'list-report-types' to see available report types.`);
        return;
      }
    }

    success(`Found ${jobs.length} job(s)\n`);

    // For each job, fetch report details
    const now = new Date();
    for (const job of jobs) {
      const jobCreated = new Date(job.createTime || '');
      const daysSinceCreation = Math.floor((now.getTime() - jobCreated.getTime()) / (1000 * 60 * 60 * 24));

      console.log(`Job ID:     ${job.id}`);
      console.log(`Report Type: ${job.reportTypeId}`);
      console.log(`Name:       ${job.name}`);
      console.log(`Created:    ${job.createTime}`);
      console.log(`Status:     Active (${daysSinceCreation} days ago)\n`);

      // Fetch reports for this job
      try {
        const reportsResponse = await youtubeReporting.jobs.reports.list({
          jobId: job.id!,
          onBehalfOfContentOwner: undefined,
        });

        const reports = reportsResponse.data.reports || [];

        if (reports.length === 0) {
          const readyAt = new Date(jobCreated.getTime() + 48 * 60 * 60 * 1000);
          const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));

          console.log('  ⏳  No reports yet (within 48-hour window)');
          console.log(`      Ready: ${readyAt.toISOString()}`);
          console.log(`      Local: ${readyAt.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })}`);
          console.log(`      Wait:  ${hoursUntilReady} hours remaining\n`);
        } else {
          // Calculate expiration warnings
          const warnings: string[] = [];
          const criticals: string[] = [];

          for (const report of reports) {
            const reportCreated = new Date(report.createTime || '');
            const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000; // Within 4 days = historical
            const expirationDays = isHistorical ? 30 : 60;
            const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
            const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

            if (daysUntilExpiration <= 3) {
              criticals.push(`      🚨 CRITICAL: ${report.startTime} to ${report.endTime} (expires ${expiresAt.toISOString().split('T')[0]}, ${daysUntilExpiration} days)`);
            } else if (daysUntilExpiration <= 7) {
              warnings.push(`      ⚠️  Expiring soon: ${report.startTime} to ${report.endTime} (expires ${expiresAt.toISOString().split('T')[0]}, ${daysUntilExpiration} days)`);
            }
          }

          console.log(`  Reports: ${reports.length} available`);
          console.log(`    Latest: ${reports[0].startTime} to ${reports[0].endTime} (created ${reports[0].createTime})`);
          console.log(`    Oldest: ${reports[reports.length - 1].startTime} to ${reports[reports.length - 1].endTime} (created ${reports[reports.length - 1].createTime})`);

          if (criticals.length > 0) {
            console.log(`\n${criticals.length} report(s) expiring SOON:`);
            criticals.forEach(c => console.log(c));
          }

          if (warnings.length > 0) {
            if (criticals.length === 0) console.log('');
            console.log(`${warnings.length} report(s) expiring soon:`);
            warnings.forEach(w => console.log(w));
          }

          if (criticals.length > 0 || warnings.length > 0) {
            console.log(`\n  💡 Run 'staqan-yt download-expiring-reports --type=${job.reportTypeId}' to save them`);
          }

          console.log('');
        }
      } catch (err) {
        debug(`Failed to fetch reports for job ${job.id}: ${err}`);
      }

      console.log('---\n');
    }

    // Show sliding window status
    if (jobs.length > 0) {
      const oldestJob = jobs.reduce((oldest, job) => {
        const jobDate = new Date(job.createTime || '');
        const oldestDate = new Date(oldest.createTime || '');
        return jobDate < oldestDate ? job : oldest;
      });

      const oldestJobCreated = new Date(oldestJob.createTime || '');
      const daysSinceOldestJob = Math.floor((now.getTime() - oldestJobCreated.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceOldestJob < 60) {
        info(`📊 Sliding window phase: Growing (will stabilize at 60 days around ${new Date(oldestJobCreated.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})`);
      } else {
        info(`📊 Sliding window phase: Stable (60-day rolling window)`);
      }

      info(`⚠️  Reports expire after 30 days (historical) or 60 days (regular)`);
      info(`💡 Download reports before expiration to avoid data loss\n`);
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to fetch jobs: ${message}`);

    if (message.includes('API not enabled')) {
      error('\nYouTube Reporting API is not enabled.');
      error('Enable it at: https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = listReportJobsCommand;
