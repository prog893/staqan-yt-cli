import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseChannelHandle, error, setVerbose, debug, formatNumber } from '../lib/utils';
import { getConfigValue } from '../lib/config';
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

async function getChannelAnalyticsCommand(channelHandle: string | undefined, options: ChannelAnalyticsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching channel analytics...').start();

  try {
    // Determine channel ID
    let channelId = channelHandle;

    if (!channelId) {
      // Try to get from config
      const defaultChannel = await getConfigValue('default.channel');
      if (!defaultChannel) {
        spinner.fail('Channel not specified');
        error('No channel provided and no default channel configured.');
        console.log('');
        console.log('Provide a channel handle:');
        console.log('  staqan-yt get-channel-analytics @channel');
        console.log('');
        console.log('Or set a default channel:');
        console.log('  staqan-yt config set default.channel @channel');
        process.exit(1);
      }
      channelId = defaultChannel;
    }

    debug('Channel ID', channelId);
    const parsedChannel = parseChannelHandle(channelId);
    debug('Parsed channel', parsedChannel);

    // Get authenticated client
    const auth = await getAuthenticatedClient();
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get channel info for title
    const youtube = google.youtube({ version: 'v3', auth });
    let channelTitle = '';
    let actualChannelId = parsedChannel.value;

    try {
      // Resolve channel handle to ID if needed
      if (parsedChannel.type === 'handle') {
        debug('Looking up channel by handle:', parsedChannel.value);
        const channelResponse = await youtube.channels.list({
          part: ['id', 'snippet'],
          forHandle: parsedChannel.value.replace('@', ''),
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          actualChannelId = channelResponse.data.items[0].id!;
          channelTitle = channelResponse.data.items[0].snippet?.title || '';
        } else {
          spinner.fail('Channel not found');
          error(`Channel not found: ${channelId}`);
          process.exit(1);
        }
      } else {
        // Get channel by ID
        const channelResponse = await youtube.channels.list({
          part: ['snippet'],
          id: [parsedChannel.value],
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          channelTitle = channelResponse.data.items[0].snippet?.title || '';
        }
      }

      debug('Resolved channel ID:', actualChannelId);
      debug('Channel title:', channelTitle);
    } catch (err) {
      debug('Error fetching channel info:', err);
    }

    spinner.succeed('Channel information retrieved');

    // Determine date range (default: last 30 days)
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    debug(`Date range: ${startDate} to ${endDate}`);

    // Determine dimensions and metrics based on report type or custom
    let dimensions: string;
    let metrics: string;
    let reportName = '';

    if (options.report) {
      // Use predefined report type
      const reportConfig = REPORT_TYPES[options.report];
      if (!reportConfig) {
        spinner.fail('Invalid report type');
        error(`Unknown report type: ${options.report}`);
        process.exit(1);
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
      spinner.fail('Report specification required');
      error('Must specify either --report type or both --dimensions and --metrics');
      console.log('');
      console.log('Predefined report types:');
      console.log('  demographics    - Audience age and gender');
      console.log('  devices         - Device and OS breakdown');
      console.log('  geography       - Top countries');
      console.log('  traffic-sources - Traffic source types');
      console.log('  subscription-status - Subscribed vs non-subscribed');
      console.log('');
      console.log('Or use custom query:');
      console.log('  --dimensions "deviceType,operatingSystem" --metrics "views,estimatedMinutesWatched"');
      process.exit(1);
    }

    // Fetch analytics
    const analyticsSpinner = ora('Fetching analytics data...').start();

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
      const outputFormat = options.output;

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
              .replace(/([a-z])/g, ' $1')
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
      console.log('');
      const errorMessage = (analyticsErr as Error).message || '';

      // Handle common errors
      if (errorMessage.includes('403') || errorMessage.includes('insufficientPermissions')) {
        error('YouTube Analytics API access denied. Make sure you have:');
        console.log('  1. Enabled YouTube Analytics API in Google Cloud Console');
        console.log('  2. Re-authenticated with: staqan-yt auth');
        console.log('');
        console.log('Required scope: https://www.googleapis.com/auth/yt-analytics.readonly');
      } else if (errorMessage.includes('400')) {
        error('Invalid analytics request. Check your date range, dimensions, and metrics.');
        console.log('');
        console.log('Valid report types: demographics, devices, geography, traffic-sources, subscription-status');
      } else {
        error(errorMessage);
      }

      process.exit(1);
    }
  } catch (err) {
    spinner.fail('Failed to fetch channel analytics');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getChannelAnalyticsCommand;
