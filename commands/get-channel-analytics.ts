import chalk from 'chalk';
import { debug, formatNumber, initCommand, withSpinner, validateDateOption, validateDateRange, runOrExit, writeStdout } from '../lib/utils';
import { requireChannel, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { fetchChannelAnalytics, ChannelAnalyticsResult } from '../lib/analytics';
import { ChannelAnalyticsOptions } from '../types';

async function getChannelAnalyticsCommand(options: ChannelAnalyticsOptions): Promise<void> {
  initCommand(options);

  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  // Resolve output format up front: honors `default.output` from config and
  // rejects invalid values before any API call is spent.
  const outputFormat = await getOutputFormat(options.output);

  await withSpinner('Fetching channel analytics...', 'Failed to fetch channel analytics', async (spinner) => {
    const channel = await requireChannel(options.channel);
    debug(`Using channel: ${channel}`);

    // Shared data layer (lib/analytics.ts, #102) — same code path as the
    // MCP tool, so report/dimension behavior can't drift between surfaces.
    let result: ChannelAnalyticsResult;
    try {
      result = await fetchChannelAnalytics({
        channel,
        startDate: options.startDate,
        endDate: options.endDate,
        report: options.report,
        dimensions: options.dimensions,
        metrics: options.metrics,
        sort: options.sort,
        onProgress: (message) => { spinner.text = message; },
      });
    } catch (analyticsErr) {
      const errorMessage = (analyticsErr as Error).message || '';

      // Translate common API errors into actionable messages; the throw
      // propagates through withSpinner → withHelpWrapper for the exit(1).
      if (errorMessage.includes('403') || errorMessage.includes('insufficientPermissions')) {
        throw new Error(
          'YouTube Analytics API access denied. Make sure you have:\n' +
          '  1. Enabled YouTube Analytics API in Google Cloud Console\n' +
          '  2. Re-authenticated with: staqan-yt auth\n' +
          'Required scope: https://www.googleapis.com/auth/yt-analytics.readonly'
        );
      }
      if (errorMessage.includes('400')) {
        throw new Error(
          'Invalid analytics request. Check your date range, dimensions, and metrics.\n' +
          'Valid report types: demographics, devices, geography, traffic-sources, subscription-status'
        );
      }
      if (errorMessage.includes('not supported')) {
        throw new Error(
          'Report type not available for this channel.\n' +
          'Demographic data might be limited because:\n' +
          '  1. Metrics do not meet certain thresholds\n' +
          '  2. Channel has limited traffic during the time period\n' +
          'Learn more: https://developers.google.com/youtube/analytics/data_model#data-anonymization\n' +
          'Try other report types: devices, geography, traffic-sources, subscription-status'
        );
      }
      throw analyticsErr;
    }

    spinner.succeed('Analytics data retrieved');

    const { channelId, channelTitle, reportType, dateRange, columnHeaders, rows } = result;
    const { startDate, endDate } = dateRange;

    if (rows.length === 0) {
      console.log('');
      console.log(chalk.yellow('No analytics data available for this channel and time period.'));
      console.log('');
      console.log(chalk.dim('Note: Channel must have sufficient views and activity.'));
      console.log('');
      return;
    }

    debug(`Retrieved ${rows.length} row(s)`);
    debug('Column headers:', columnHeaders);

    // Format output
    if (outputFormat === 'json') {
      const jsonData = {
        channelId,
        channelTitle,
        reportType,
        dateRange: { startDate, endDate },
        columnHeaders: columnHeaders.map(h => h.name),
        rows,
      };
      await writeStdout(formatJson(jsonData) + '\n');
    } else if (outputFormat === 'csv') {
      // Build CSV data
      const csvData: Record<string, unknown>[] = [];
      for (const row of rows) {
        const rowData: Record<string, unknown> = {};
        for (let i = 0; i < row.length; i++) {
          const headerName = columnHeaders[i]?.name || `column_${i}`;
          rowData[headerName] = row[i];
        }
        csvData.push(rowData);
      }
      await writeStdout(formatCsv(csvData) + '\n');
    } else if (outputFormat === 'table') {
      // Build table data
      const tableData: Record<string, string>[] = [];
      for (const row of rows) {
        const rowData: Record<string, string> = {};
        for (let i = 0; i < row.length; i++) {
          const headerName = columnHeaders[i]?.name || `column_${i}`;
          const val = row[i];
          rowData[headerName] = typeof val === 'number' ? formatNumber(val) : String(val);
        }
        tableData.push(rowData);
      }
      await writeStdout(formatTable(tableData) + '\n');
    } else if (outputFormat === 'text') {
      // Tab-delimited output
      const headerNames = columnHeaders.map(h => h.name || '').join('\t');
      console.log(headerNames);
      for (const row of rows) {
        console.log(row.join('\t'));
      }
    } else {
      // Pretty output (default)
      console.log('');
      if (channelTitle) {
        console.log(chalk.bold.cyan(channelTitle));
        console.log(chalk.gray(`Channel ID: ${channelId}`));
      } else {
        console.log(chalk.bold.cyan(`Channel: ${channelId}`));
      }
      console.log(chalk.gray(`Report Type: ${reportType}`));
      console.log(chalk.gray(`Date Range: ${startDate} to ${endDate}`));
      console.log('');

      // Display each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i > 0) {
          console.log(chalk.gray('─'.repeat(80)));
          console.log('');
        }

        for (let j = 0; j < row.length; j++) {
          const value = row[j];
          const header = columnHeaders[j];
          const headerName = header?.name || `Column ${j}`;
          const formattedHeader = headerName
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();

          // Format value
          let formattedValue: string;
          if (typeof value === 'number') {
            formattedValue = formatNumber(value);
          } else {
            formattedValue = String(value);
          }

          console.log(chalk.gray(`${formattedHeader}:`) + ' ' + chalk.white(formattedValue));
        }

        console.log('');
      }

      console.log(chalk.dim(`Total: ${rows.length} result(s)`));
      console.log('');
    }
  });
}

export = getChannelAnalyticsCommand;
