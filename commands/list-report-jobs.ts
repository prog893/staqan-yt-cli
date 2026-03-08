import { google } from 'googleapis';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { info, debug, initCommand, formatTimestampWithTimezone, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';

interface ListReportJobsOptions {
  type?: string;
  output?: 'json' | 'table' | 'text' | 'csv' | 'pretty';
  verbose?: boolean;
}

/**
 * List YouTube Reporting API jobs
 * Shows all jobs or filters by report type
 */
async function listReportJobsCommand(options: ListReportJobsOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching reporting jobs...', 'Failed to fetch reporting jobs', async (spinner) => {
    const auth = await getAuthenticatedClient();
    const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

    const jobsResponse = await youtubeReporting.jobs.list({
      onBehalfOfContentOwner: undefined,
    });

    let jobs = jobsResponse.data.jobs || [];

    if (jobs.length === 0) {
      spinner.info('No reporting jobs found for this channel.');
      info('Jobs are created automatically when you run get-report-data for the first time.');
      return;
    }

    // Filter by report type if specified
    if (options.type) {
      jobs = jobs.filter(job => job.reportTypeId === options.type);
      if (jobs.length === 0) {
        spinner.warn(`No jobs found for report type: ${options.type}`);
        info(`Run 'list-report-types' to see available report types.`);
        return;
      }
    }

    spinner.succeed(`Found ${jobs.length} job(s)`);

    console.log('');

    // Collect job data for all formats

    // Collect job data for all formats
    const now = new Date();
    const jobsData: Array<{
      jobId: string;
      reportTypeId: string;
      name: string;
      created: string;
      daysSinceCreation: number;
      status: string;
      reportsCount: number;
      latestReport: string;
      oldestReport: string;
      expiringReportsCount: number;
      expirationWarnings: string[];
      expirationCriticals: string[];
    }> = [];

    // For each job, fetch report details
    for (const job of jobs) {
      const jobCreated = new Date(job.createTime || '');
      const daysSinceCreation = Math.floor((now.getTime() - jobCreated.getTime()) / (1000 * 60 * 60 * 24));

      let reportsCount = 0;
      let latestReport = 'N/A';
      let oldestReport = 'N/A';
      let expiringReportsCount = 0;
      const warnings: string[] = [];
      const criticals: string[] = [];

      // Fetch reports for this job
      try {
        const reportsResponse = await youtubeReporting.jobs.reports.list({
          jobId: job.id!,
          onBehalfOfContentOwner: undefined,
        });

        const reports = reportsResponse.data.reports || [];
        reportsCount = reports.length;

        if (reports.length > 0) {
          latestReport = `${reports[0].startTime} to ${reports[0].endTime}`;
          oldestReport = `${reports[reports.length - 1].startTime} to ${reports[reports.length - 1].endTime}`;

          // Calculate expiration warnings
          for (const report of reports) {
            const reportCreated = new Date(report.createTime || '');
            const isHistorical = reportCreated.getTime() - jobCreated.getTime() < 4 * 24 * 60 * 60 * 1000;
            const expirationDays = isHistorical ? 30 : 60;
            const expiresAt = new Date(reportCreated.getTime() + expirationDays * 24 * 60 * 60 * 1000);
            const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

            if (daysUntilExpiration <= 3) {
              criticals.push(`🚨 CRITICAL: ${report.startTime} to ${report.endTime} (expires ${expiresAt.toISOString().split('T')[0]}, ${daysUntilExpiration} days)`);
            } else if (daysUntilExpiration <= 7) {
              warnings.push(`⚠️  Expiring soon: ${report.startTime} to ${report.endTime} (expires ${expiresAt.toISOString().split('T')[0]}, ${daysUntilExpiration} days)`);
            }

            if (daysUntilExpiration <= 7) {
              expiringReportsCount++;
            }
          }
        }
      } catch (err) {
        debug(`Failed to fetch reports for job ${job.id}: ${err}`);
      }

      jobsData.push({
        jobId: job.id || '',
        reportTypeId: job.reportTypeId || '',
        name: job.name || '',
        created: job.createTime || '',
        daysSinceCreation,
        status: 'Active',
        reportsCount,
        latestReport,
        oldestReport,
        expiringReportsCount,
        expirationWarnings: warnings,
        expirationCriticals: criticals,
      });
    }

    // Determine output format
    const outputFormat = await getOutputFormat(options.output);

    // Output based on format
    switch (outputFormat) {
      case 'json':
        console.log(formatJson(jobsData));
        break;

      case 'csv':
        console.log(formatCsv(jobsData));
        break;

      case 'text':
        console.log(formatText(jobsData));
        break;

      case 'table':
        console.log(formatTable(jobsData));
        break;

      case 'pretty':
      default:
        // Pretty format with colors
        jobsData.forEach((job, idx) => {
          console.log(chalk.cyan(`Job ID:`) + ' ' + chalk.yellow(job.jobId));
          console.log(chalk.gray('Report Type:') + ' ' + job.reportTypeId);
          console.log(chalk.gray('Name:') + ' ' + job.name);
          console.log(chalk.gray('Created:') + ' ' + job.created);
          console.log(chalk.gray('Status:') + ' ' + chalk.green(`${job.status} (${job.daysSinceCreation} days ago)`));
          console.log(chalk.gray('Reports:') + ' ' + chalk.yellow(job.reportsCount.toString()));

          if (job.reportsCount > 0) {
            console.log(chalk.gray('  Latest:') + ' ' + job.latestReport);
            console.log(chalk.gray('  Oldest:') + ' ' + job.oldestReport);

            // Show detailed expiration warnings
            if (job.expirationCriticals.length > 0) {
              console.log(`\n  ${job.expirationCriticals.length} report(s) expiring SOON:`);
              job.expirationCriticals.forEach(c => console.log(`      ${chalk.red(c)}`));
            }

            if (job.expirationWarnings.length > 0) {
              if (job.expirationCriticals.length === 0) console.log('');
              console.log(`  ${job.expirationWarnings.length} report(s) expiring soon:`);
              job.expirationWarnings.forEach(w => console.log(`      ${chalk.yellow(w)}`));
            }

            if (job.expirationCriticals.length > 0 || job.expirationWarnings.length > 0) {
              console.log(`\n  💡 Run 'staqan-yt fetch-reports --type=${job.reportTypeId}' to download them`);
            }
          } else {
            const readyAt = new Date(new Date(job.created).getTime() + 48 * 60 * 60 * 1000);
            const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
            const formatted = formatTimestampWithTimezone(readyAt);
            console.log(chalk.gray('  ⏳  No reports yet (within 48-hour window)'));
            console.log(chalk.gray('      Ready:') + ' ' + formatted.local + chalk.gray(` (${formatted.timezone})`));
            console.log(chalk.gray('      Wait:') + ' ' + chalk.yellow(`${hoursUntilReady} hours remaining`));
          }

          console.log('');
          if (idx < jobsData.length - 1) {
            console.log(chalk.gray('---'));
            console.log('');
          }
        });

        // Show sliding window status
        if (jobsData.length > 0) {
          const oldestJobData = jobsData.reduce((oldest, job) => {
            const jobDate = new Date(job.created || '');
            const oldestDate = new Date(oldest.created || '');
            return jobDate < oldestDate ? job : oldest;
          });

          const oldestJobCreated = new Date(oldestJobData.created || '');
          const daysSinceOldestJob = Math.floor((now.getTime() - oldestJobCreated.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceOldestJob < 60) {
            info(`📊 Sliding window phase: Growing (will stabilize at 60 days around ${new Date(oldestJobCreated.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})`);
          } else {
            info(`📊 Sliding window phase: Stable (60-day rolling window)`);
          }

          info(`⚠️  Reports expire after 30 days (historical) or 60 days (regular)`);
          info(`💡 Download reports before expiration to avoid data loss\n`);
        }
        break;
    }
  });
}

export = listReportJobsCommand;
