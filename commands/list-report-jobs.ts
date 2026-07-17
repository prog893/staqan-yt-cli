import chalk from 'chalk';
import { info, initCommand, formatTimestampWithTimezone, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';
import { fetchReportJobs } from '../lib/reports';

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
    // Shared data layer (lib/reports.ts, #102) — same code path as the MCP tool.
    const { totalJobs, jobs } = await fetchReportJobs({
      type: options.type,
      onProgress: (message) => {
        spinner.text = message;
        spinner.render();
      },
    });

    if (totalJobs === 0) {
      spinner.info('No reporting jobs found for this channel.');
      info('Jobs are created automatically when you run get-report-data for the first time.');
      return;
    }

    if (jobs.length === 0) {
      spinner.warn(`No jobs found for report type: ${options.type}`);
      info(`Run 'list-report-types' to see available report types.`);
      return;
    }

    const now = new Date();

    // Flatten the structured lib result into the display strings the
    // json/csv/text/table formats have always emitted. The timezone label
    // comes from the formatter — the values are local, not UTC.
    const formatWindow = (w: { startTime: string; endTime: string } | null) => {
      if (!w) return 'N/A';
      const start = formatTimestampWithTimezone(w.startTime);
      const end = formatTimestampWithTimezone(w.endTime);
      return `${start.local} to ${end.local} (${start.timezone})`;
    };

    const jobsData = jobs.map(job => ({
      jobId: job.jobId,
      reportTypeId: job.reportTypeId,
      name: job.name,
      created: job.created,
      daysSinceCreation: job.daysSinceCreation,
      status: job.status,
      reportsCount: job.reportsCount,
      latestReport: formatWindow(job.latestReport),
      oldestReport: formatWindow(job.oldestReport),
      expiringReportsCount: job.expiringReportsCount,
      expirationWarnings: job.expirationWarnings.map(w =>
        `⚠️  Expiring soon: ${w.startTime} to ${w.endTime} (expires ${w.expiresAt}, ${w.daysUntilExpiration} days)`),
      expirationCriticals: job.expirationCriticals.map(c =>
        `🚨 CRITICAL: ${c.startTime} to ${c.endTime} (expires ${c.expiresAt}, ${c.daysUntilExpiration} days)`),
    }));

    spinner.succeed(`Found ${jobs.length} job(s)`);
    console.log('');

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
          {
            const created = formatTimestampWithTimezone(job.created);
            console.log(chalk.gray('Created:') + ' ' + created.local + chalk.gray(` (${created.timezone})`));
          }
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
        break;
    }
  });
}

export = listReportJobsCommand;
