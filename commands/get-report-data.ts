import { initCommand, withSpinner, formatTimestampWithTimezone, validateDateOption, validateDateRange, runOrExit, writeStdout } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';
import { fetchReportData } from '../lib/reports';
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
 * Get YouTube Reporting API report data
 * Downloads and parses bulk reports (CTR, impressions, etc.)
 * WITH CACHING SUPPORT
 */
async function getReportDataCommand(options: ReportDataOptions): Promise<void> {
  initCommand(options);
  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  await withSpinner('Checking for existing reporting job...', 'Failed to fetch report data', async (spinner) => {
    // Shared data layer (lib/reports.ts, #102) — same cache-merging pipeline
    // as the MCP tool.
    const result = await fetchReportData({
      type: options.type,
      channel: options.channel,
      videoId: options.videoId,
      startDate: options.startDate,
      endDate: options.endDate,
      onProgress: (message) => { spinner.text = message; },
    });

    if (result.status === 'job-created') {
      const formatted = formatTimestampWithTimezone(new Date(result.readyAt));
      spinner.succeed(`Created new job: ${result.jobId}`);
      console.log('');
      console.log(chalk.gray('First report available:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log('');
      console.log(chalk.yellow('Run this command again after:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log('');

      // Nothing to fetch yet — successful no-op, not an error. `return`
      // instead of process.exit(0) so an MCP-server caller survives (issue #110).
      return;
    }

    if (result.status === 'no-reports-yet') {
      const readyAt = new Date(result.readyAt);
      const now = new Date();
      const hoursUntilReady = Math.max(0, Math.ceil((readyAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
      const formatted = formatTimestampWithTimezone(readyAt);

      spinner.succeed('Job exists but no reports yet');
      console.log('');
      console.log(chalk.gray('Created:') + ' ' + result.jobCreateTime);
      console.log(chalk.gray('Ready:') + ' ' + chalk.cyan(`${formatted.local} (${formatted.timezone})`));
      console.log(chalk.yellow('Wait:') + ' ' + chalk.cyan(`${hoursUntilReady} hours remaining`));
      console.log('');

      // Successful no-op (reports not ready yet) — see note above about #110.
      return;
    }

    const { rows: filteredData, cachedReports, fetchedReports, uncoveredRanges } = result;
    const { startDate: requestedStart, endDate: requestedEnd } = result.requestedRange;
    const { startDate: adjustedStart, endDate: adjustedEnd } = result.adjustedRange;
    const { startDate: effectiveMinDate, endDate: effectiveMaxDate } = result.availableRange;

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

    spinner.succeed(`Retrieved ${cachedReports.length} cached + ${fetchedReports.length} new report(s)`);
    process.stderr.write('\n');

    // Output based on format
    const outputFormat = await getOutputFormat(options.output);

    // Machine formats go through writeStdout, which awaits the flush. A report
    // range easily exceeds the 64KB pipe buffer, and console.log would let the
    // process end with the tail still queued, truncating mid-token (#161).
    switch (outputFormat) {
      case 'json':
        await writeStdout(formatJson(filteredData) + '\n');
        break;

      case 'csv':
        await writeStdout(formatCsv(filteredData) + '\n');
        break;

      case 'text':
        await writeStdout(formatText(filteredData) + '\n');
        break;

      case 'table':
        await writeStdout(formatTable(filteredData) + '\n');
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

    // Warn about coverage gaps.
    //
    // Read from result.uncoveredRanges (computed in lib/reports.ts) rather
    // than re-deriving gaps from the returned row dates. The old local
    // computation treated any day without rows as missing data, which
    // false-flagged quiet days: a report can legitimately cover a date and
    // carry no rows for it because nothing happened. uncoveredRanges measures
    // what the message actually claims, which is that no source covered those
    // dates. Sharing it with the MCP surface also keeps the two consistent
    // (issue #155).
    //
    // Skipped under --video-id: one video's absence on a date says nothing
    // about whether the channel's data covers it.
    const spanDays = (from: string, to: string) =>
      Math.round((new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (uncoveredRanges.length > 0 && !options.videoId) {
      const totalDays = spanDays(adjustedStart, adjustedEnd);
      const missingDays = uncoveredRanges.reduce(
        (sum, gap) => sum + spanDays(gap.startDate, gap.endDate),
        0
      );

      process.stderr.write('\n');
      process.stderr.write(chalk.yellow('⚠️  Incomplete Data:\n'));
      process.stderr.write(chalk.gray(`  Requested: ${adjustedStart} to ${adjustedEnd} (${totalDays} days)\n`));
      process.stderr.write(chalk.gray(`  Covered:   ${totalDays - missingDays} of ${totalDays} days\n`));
      process.stderr.write(chalk.gray('  Missing:\n'));
      for (const gap of uncoveredRanges) {
        const days = spanDays(gap.startDate, gap.endDate);
        if (gap.startDate === gap.endDate) {
          process.stderr.write(chalk.red(`    ${gap.startDate}\n`));
        } else {
          process.stderr.write(chalk.red(`    ${gap.startDate} → ${gap.endDate} (${days} days)\n`));
        }
      }
      process.stderr.write(chalk.yellow('  Tip:') + ' Data may have expired from YouTube or was never archived.\n');
      process.stderr.write(chalk.gray('       ') + 'Run ' + chalk.cyan(`staqan-yt fetch-reports --type=${options.type}`) + ' to archive available data.\n');
      process.stderr.write('\n');
    }

    // View-counting caveat (#177). Printed for every output format, unlike
    // get-video-analytics and get-channel-analytics, which restrict their
    // copy of this notice to pretty/text.
    //
    // The difference is deliberate and follows this command rather than those
    // two. The Incomplete Data warning immediately above is the same class of
    // signal ("these numbers are not what they look like") and is already
    // unconditional here, so gating this one on the format would make
    // the weaker caveat the more visible of the two. It is also more likely
    // to apply here than there: an archive accumulates for months, so the
    // default range on a bulk report reaches back past the change far more
    // often than an Analytics query does. stderr keeps stdout parseable.
    if (result.viewCountingNotice) {
      process.stderr.write(chalk.yellow('⚠️  ') + result.viewCountingNotice.message + '\n');
      process.stderr.write('\n');
    }

    // Show expiration warning for the reports used
    const now = new Date();
    const jobCreated = new Date(result.jobCreateTime);

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

    for (const report of fetchedReports) {
      const reportCreated = new Date(report.createTime);
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
