import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseChannelHandle, debug, formatNumber, initCommand, withSpinner, createSpinner, toLocalYmd, validateDateOption, validateDateRange, runOrExit } from '../lib/utils';
import { requireChannel, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ChannelAnalyticsOptions } from '../types';

// Predefined report type mappings
const REPORT_TYPES: Record<string, { dimensions: string; metrics: string }> = {
  demographics: {
    dimensions: 'ageGroup,gender',
    metrics: 'views,estimatedMinutesWatched',
  },
  devices: {
    dimensions: 'deviceType,operatingSystem',
    metrics: 'views,estimatedMinutesWatched',
  },
  geography: {
    dimensions: 'country',
    metrics: 'views,estimatedMinutesWatched',
  },
  'traffic-sources': {
    dimensions: 'insightTrafficSourceType',
    metrics: 'views,estimatedMinutesWatched',
  },
  'subscription-status': {
    dimensions: 'subscribedStatus',
    metrics: 'views,estimatedMinutesWatched',
  },
};

async function getChannelAnalyticsCommand(options: ChannelAnalyticsOptions): Promise<void> {
  initCommand(options);

  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  // Resolve output format up front: honors `default.output` from config and
  // rejects invalid values before any API call is spent.
  const outputFormat = await getOutputFormat(options.output);

  await withSpinner('Fetching channel analytics...', 'Failed to fetch channel analytics', async (spinner) => {
    // Determine channel ID
    const channelId = await requireChannel(options.channel);
    debug(`Using channel: ${channelId}`);

    const parsedChannel = parseChannelHandle(channelId);
    debug('Parsed channel', parsedChannel);

    // Get authenticated client
    const auth = await getAuthenticatedClient();
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get channel info for title
    const youtube = google.youtube({ version: 'v3', auth });
    let channelTitle = '';
    let actualChannelId = parsedChannel.value;

    // Resolve channel handle to ID if needed. A not-found channel fails the
    // command here — previously the ID branch swallowed the empty response
    // (and any lookup error) into a debug-only catch and proceeded, so the
    // Analytics query failed later with an opaque message (#123).
    if (parsedChannel.type === 'handle') {
      debug('Looking up channel by handle:', parsedChannel.value);
      const channelResponse = await youtube.channels.list({
        part: ['id', 'snippet'],
        forHandle: parsedChannel.value.replace('@', ''),
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error(`Channel not found: ${channelId}`);
      }
      actualChannelId = channelResponse.data.items[0].id!;
      channelTitle = channelResponse.data.items[0].snippet?.title || '';
    } else {
      // Get channel by ID
      const channelResponse = await youtube.channels.list({
        part: ['snippet'],
        id: [parsedChannel.value],
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error(`Channel not found: ${channelId}`);
      }
      channelTitle = channelResponse.data.items[0].snippet?.title || '';
    }

    debug('Resolved channel ID:', actualChannelId);
    debug('Channel title:', channelTitle);

    spinner.succeed('Channel information retrieved');

    // Determine date range (default: last 30 days)
    const endDate = options.endDate || toLocalYmd(new Date());
    const startDate = options.startDate ||
      toLocalYmd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    validateDateRange(startDate, endDate);
    debug(`Date range: ${startDate} to ${endDate}`);

    // Determine dimensions and metrics based on report type or custom
    let dimensions: string;
    let metrics: string;
    let reportName = '';

    if (
      options.report !== undefined &&
      (options.dimensions !== undefined || options.metrics !== undefined)
    ) {
      throw new Error('Cannot combine --report with --dimensions or --metrics. Use one or the other.');
    }

    if (options.report) {
      // Use predefined report type
      const reportConfig = REPORT_TYPES[options.report];
      if (!reportConfig) {
        throw new Error(`Unknown report type: ${options.report}`);
      }
      dimensions = reportConfig.dimensions;
      metrics = reportConfig.metrics;
      reportName = options.report;
      debug(`Using predefined report: ${options.report}`);
      debug(`Dimensions: ${dimensions}, Metrics: ${metrics}`);
    } else if (options.dimensions && options.metrics) {
      // Custom query
      dimensions = options.dimensions;
      metrics = options.metrics;
      reportName = 'custom';
      debug('Using custom dimensions and metrics');
    } else {
      throw new Error(
        'Must specify either --report type or both --dimensions and --metrics\n' +
        'Predefined report types:\n' +
        '  demographics    - Audience age and gender\n' +
        '  devices         - Device and OS breakdown\n' +
        '  geography       - Top countries\n' +
        '  traffic-sources - Traffic source types\n' +
        '  subscription-status - Subscribed vs non-subscribed\n' +
        'Or use custom query:\n' +
        '  --dimensions "deviceType,operatingSystem" --metrics "views,estimatedMinutesWatched"'
      );
    }

    // Fetch analytics
    const analyticsSpinner = createSpinner('Fetching analytics data...').start();

    try {
      const response = await youtubeAnalytics.reports.query({
        ids: `channel==${actualChannelId}`,
        startDate,
        endDate,
        dimensions,
        metrics,
        sort: '-views', // Sort by views descending
      });

      analyticsSpinner.succeed('Analytics data retrieved');

      if (!response.data.rows || response.data.rows.length === 0) {
        console.log('');
        console.log(chalk.yellow('No analytics data available for this channel and time period.'));
        console.log('');
        console.log(chalk.dim('Note: Channel must have sufficient views and activity.'));
        console.log('');
        return;
      }

      const columnHeaders = response.data.columnHeaders || [];
      const rows = response.data.rows || [];

      debug(`Retrieved ${rows.length} row(s)`);
      debug('Column headers:', columnHeaders);

      // Format output
      if (outputFormat === 'json') {
        const jsonData = {
          channelId: actualChannelId,
          channelTitle,
          reportType: reportName,
          dateRange: { startDate, endDate },
          columnHeaders: columnHeaders.map(h => h.name),
          rows,
        };
        console.log(formatJson(jsonData));
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
        console.log(formatCsv(csvData));
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
        console.log(formatTable(tableData));
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
          console.log(chalk.gray(`Channel ID: ${actualChannelId}`));
        } else {
          console.log(chalk.bold.cyan(`Channel: ${actualChannelId}`));
        }
        console.log(chalk.gray(`Report Type: ${reportName}`));
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
    } catch (analyticsErr) {
      analyticsSpinner.fail('Failed to fetch analytics');
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
  });
}

export = getChannelAnalyticsCommand;
