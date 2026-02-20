import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, setVerbose, debug, formatNumber, progress, convertToCSV, chunkDateRange, retryWithBackoff } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

async function getVideoAnalyticsCommand(videoId: string, options: AnalyticsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video information...').start();

  try {
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

    spinner.succeed('Video information retrieved');

    // Calculate date range
    // Default: full historical data from upload date to today
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate || publishedAt.split('T')[0];

    debug(`Date range: ${startDate} to ${endDate}`);
    progress(`Fetching analytics from ${startDate} to ${endDate}...`);

    // Default metrics (split into two groups due to API limitations)
    const engagementMetrics = options.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';
    const impressionMetrics = 'videoThumbnailImpressions,videoThumbnailImpressionsClickRate';

    // Chunk date range into 90-day periods
    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);

    // Fetch engagement analytics for each chunk
    const allRows: unknown[][] = [];
    let columnHeaders: { name?: string | null }[] = [];

    for (let i = 0; i < dateChunks.length; i++) {
      const chunk = dateChunks[i];
      progress(`Fetching chunk ${i + 1}/${dateChunks.length} (${chunk.start} to ${chunk.end})...`);

      const analyticsResponse = await retryWithBackoff(async () => {
        return await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate: chunk.start,
          endDate: chunk.end,
          metrics: engagementMetrics,
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

    // Fetch impression/CTR metrics separately
    progress('Fetching impression and CTR data...');
    let ctrData: { impressions: number; ctr: number } | null = null;

    try {
      // CTR metrics require the "Basic user activity statistics" report
      // This report has NO dimensions, but can be filtered by video
      // According to YouTube docs, videoThumbnailImpressions and videoThumbnailImpressionsClickRate
      // are supported in this report with optional video filter
      const ctrResponse = await retryWithBackoff(async () => {
        return await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: impressionMetrics,
          // Try WITH video filter to get data for this specific video
          filters: `video==${parsedId}`,
          // NO dimensions - required for this report type
        });
      });

      if (ctrResponse.data.rows && ctrResponse.data.rows.length > 0) {
        const row = ctrResponse.data.rows[0];
        const headers = ctrResponse.data.columnHeaders || [];
        const impressionsIndex = headers.findIndex(h => h.name === 'videoThumbnailImpressions');
        const ctrIndex = headers.findIndex(h => h.name === 'videoThumbnailImpressionsClickRate');

        const impressions = impressionsIndex >= 0 ? (row[impressionsIndex] as number) : 0;
        const ctr = ctrIndex >= 0 ? (row[ctrIndex] as number) : 0;

        ctrData = { impressions, ctr };
        progress(`✓ Retrieved CTR data: ${impressions.toLocaleString()} impressions, ${ctr.toFixed(2)}% CTR`);
      } else {
        debug('CTR query returned no rows');
        progress('⚠ CTR data not available for this video (may require monetization or minimum views)');
      }
    } catch (ctrErr: unknown) {
      const errorMessage = ctrErr instanceof Error ? ctrErr.message : String(ctrErr);
      debug('CTR fetch error:', errorMessage);

      // Check if it's the "not supported" error
      if (errorMessage.includes('not supported')) {
        progress('⚠ CTR metrics not supported by API for this channel/video');
        debug('Note: CTR metrics (videoThumbnailImpressions, videoThumbnailImpressionsClickRate) are');
        debug('only available in the "Basic user activity statistics" report and may require:');
        debug('- Channel monetization');
        debug('- Minimum impression threshold');
        debug('- Sufficient video age');
      } else {
        progress(`⚠ CTR data unavailable: ${errorMessage}`);
      }
    }

    progress(`✓ Retrieved ${allRows.length} row(s) of analytics data`);

    // Output results
    const outputFormat = await getOutputFormat(options.output);

    // Prepare aggregated data for structured formats
    const aggregated: { [key: string]: number } = {};
    columnHeaders.forEach((header, index) => {
      const name = header.name || '';
      if (name === 'video') return;

      let total = 0;
      allRows.forEach(row => {
        const value = row[index];
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

    // Add CTR data if available
    if (ctrData) {
      aggregated.videoThumbnailImpressions = ctrData.impressions;
      aggregated.videoThumbnailImpressionsClickRate = ctrData.ctr;
    }

    switch (outputFormat) {
      case 'csv':
        if (allRows.length === 0) {
          process.stderr.write(chalk.yellow('⚠ No analytics data available for this time period.\n'));
          return;
        }
        console.log(convertToCSV(columnHeaders, allRows));
        break;

      case 'json':
        // Prepare output with CTR data
        const jsonOutput: Record<string, unknown> = {
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows: allRows,
        };

        if (ctrData) {
          jsonOutput.impressions = ctrData.impressions;
          jsonOutput.impressionCTR = ctrData.ctr;
        }

        console.log(formatJson(jsonOutput));
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
            .trim()
            .replace('Video Thumbnail Impressions Click Rate', 'Impression CTR')
            .replace('Video Thumbnail Impressions', 'Thumbnail Impressions');

          // Format value
          let formattedValue: string;
          if (name.includes('ClickRate') || name.includes('Percentage')) {
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
  } catch (err) {
    spinner.fail('Failed to fetch analytics');
    console.log('');

    const errorMessage = (err as Error).message || '';

    // Handle common errors
    if (errorMessage.includes('403') || errorMessage.includes('insufficient')) {
      error('Analytics API access denied. Make sure you have:');
      console.log('  1. Enabled YouTube Analytics API in Google Cloud Console');
      console.log('  2. Re-authenticated with: staqan-yt auth');
    } else if (errorMessage.includes('400')) {
      error('Invalid analytics request. Check your date range and metrics.');
    } else {
      error(errorMessage);
    }

    process.exit(1);
  }
}

export = getVideoAnalyticsCommand;
