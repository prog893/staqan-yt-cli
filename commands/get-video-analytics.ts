import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, chunkDateRange, retryWithBackoff, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

async function getVideoAnalyticsCommand(options: AnalyticsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options['video-id'];
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  await withSpinner('Fetching video information...', 'Failed to fetch analytics', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get video info for title and publish date
    const videoResponse = await youtube.videos.list({
      part: ['snippet'],
      id: [parsedId],
    });

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      spinner.fail('Video not found');
      error(`No video found with ID: ${parsedId}`);
      process.exit(1);
    }

    const video = videoResponse.data.items[0];
    const title = video.snippet?.title || 'Untitled';
    const publishedAt = video.snippet?.publishedAt;

    if (!publishedAt) {
      spinner.fail('Could not determine video publish date');
      error('Video publish date is missing');
      process.exit(1);
    }

    // Calculate date range
    // Default: full historical data from upload date to today
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate || publishedAt.split('T')[0];

    debug(`Date range: ${startDate} to ${endDate}`);

    // Default metrics
    const metrics = options.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

    // Chunk date range into 90-day periods
    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);

    // Fetch analytics for each chunk
    const allRows: unknown[][] = [];
    let columnHeaders: { name?: string | null }[] = [];

    for (let i = 0; i < dateChunks.length; i++) {
      const chunk = dateChunks[i];
      spinner.text = `Fetching chunk ${i + 1}/${dateChunks.length} (${chunk.start} to ${chunk.end})...`;

      const analyticsResponse = await retryWithBackoff(async () => {
        return await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate: chunk.start,
          endDate: chunk.end,
          metrics,
          dimensions: 'video',
          filters: `video==${parsedId}`,
        });
      });

      // Save headers from first response
      if (i === 0 && analyticsResponse.data.columnHeaders) {
        columnHeaders = analyticsResponse.data.columnHeaders;
      }

      // Aggregate rows
      if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
        allRows.push(...analyticsResponse.data.rows);
      }
    }

    spinner.succeed(`Retrieved ${allRows.length} row(s) of analytics data`);

    // Output results
    const outputFormat = await getOutputFormat(options.output);

    // Prepare aggregated data for structured formats
    const aggregated: { [key: string]: number } = {};
    columnHeaders.forEach((header, index) => {
      const name = header.name || '';
      if (name === 'video') return;

      let total = 0;
      allRows.forEach(row => {
        const value = (row as unknown[])[index];
        if (typeof value === 'number') {
          total += value;
        }
      });

      // For average metrics, divide by number of rows
      if (name.includes('average') || name.includes('Percentage')) {
        aggregated[name] = allRows.length > 0 ? total / allRows.length : 0;
      } else {
        aggregated[name] = total;
      }
    });

    switch (outputFormat) {
      case 'csv':
        if (allRows.length === 0) {
          process.stderr.write(chalk.yellow('⚠ No analytics data available for this time period.\n'));
          return;
        }
        console.log(convertToCSV(columnHeaders, allRows));
        break;

      case 'json':
        console.log(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows: allRows,
        }));
        break;

      case 'table':
        // Convert aggregated metrics to table format
        const tableData = Object.entries(aggregated).map(([name, value]) => ({
          metric: name,
          value: value.toString(),
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        // Tab-delimited output of aggregated metrics
        Object.entries(aggregated).forEach(([name, value]) => {
          console.log([name, value].join('\t'));
        });
        break;

      case 'pretty':
      default:
        console.log('');
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (allRows.length === 0) {
          console.log(chalk.yellow('No analytics data available for this time period.'));
          console.log('');
          return;
        }

        console.log(chalk.bold('Analytics Metrics (Aggregated):'));
        console.log('');

        Object.entries(aggregated).forEach(([name, value]) => {
          // Format metric name
          const formattedName = name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();

          // Format value
          let formattedValue: string;
          if (name.includes('Percentage')) {
            formattedValue = `${value.toFixed(2)}%`;
          } else if (name.includes('Duration') || name.includes('Minutes')) {
            formattedValue = formatNumber(Math.round(value));
          } else if (name.includes('average')) {
            formattedValue = value.toFixed(2);
          } else {
            formattedValue = formatNumber(Math.round(value));
          }

          console.log(chalk.gray(`  ${formattedName}: `) + chalk.white(formattedValue));
        });

        console.log('');
        console.log(chalk.dim(`Note: Aggregated from ${allRows.length} data point(s)`));
        console.log('');
        break;
    }
  });
}

export = getVideoAnalyticsCommand;
