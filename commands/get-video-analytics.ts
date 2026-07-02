import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, chunkDateRange, retryWithBackoff, initCommand, withSpinner, toLocalYmd, validateDateOption, validateDateRange, runOrExit } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

/**
 * Allowlist of Analytics API dimensions valid for video-level queries.
 * See https://developers.google.com/youtube/v3/docs/analytics_api/dimensions/dims
 */
const VIDEO_DIMENSIONS: ReadonlySet<string> = new Set([
  'video',
  'day',
  'month',
  'insightTrafficSourceType',
  'insightTrafficSourceDetail',
  'creatorContentType',
  'country',
  'province',
  'city',
  'deviceType',
  'operatingSystem',
  'insightPlaybackLocationType',
  'insightPlayerLocationType',
  'subscribedStatus',
]);

/**
 * Known-bad dimension combinations the Analytics API rejects at runtime.
 * Checking up-front gives a clean error message instead of an API error.
 */
const INVALID_DIMENSION_COMBOS: ReadonlyArray<ReadonlyArray<string>> = [
  // creatorContentType is not a valid dimension for traffic-source detail reports
  // (see PR #90 — original issue: get-channel-search-terms #88).
  ['creatorContentType', 'insightTrafficSourceDetail'],
];

/**
 * Validate a comma-separated --dimensions string against the allowlist and
 * known-bad combos. Returns the normalized (trimmed) string on success;
 * throws on any invalid dimension or rejected combination.
 */
function validateVideoDimensions(raw: string): string {
  const dims = raw.split(',').map(d => d.trim()).filter(d => d.length > 0);
  if (dims.length === 0) {
    throw new Error('--dimensions cannot be empty');
  }

  for (const d of dims) {
    if (!VIDEO_DIMENSIONS.has(d)) {
      throw new Error(
        `Invalid --dimensions value: "${d}". Valid values: ${[...VIDEO_DIMENSIONS].join(', ')}`,
      );
    }
  }

  for (const combo of INVALID_DIMENSION_COMBOS) {
    if (combo.every(d => dims.includes(d))) {
      throw new Error(
        `Invalid --dimensions combination: ${combo.join(' + ')}. ` +
        `The Analytics API does not support this combination.`,
      );
    }
  }

  return dims.join(',');
}

async function getVideoAnalyticsCommand(options: AnalyticsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

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
    const endDate = options.endDate || toLocalYmd(new Date());
    const startDate = options.startDate || publishedAt.split('T')[0];

    // validateDateRange throws on bad ranges; withSpinner's catch handles it.
    validateDateRange(startDate, endDate);
    debug(`Date range: ${startDate} to ${endDate}`);

    // Default metrics
    const metrics = options.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

    // Default dimensions: 'video' preserves legacy behavior (aggregated by video).
    // Any user-supplied --dimensions is validated against the Analytics API allowlist
    // and known-bad combinations are rejected up-front (issue #99).
    const dimensions = runOrExit(() => validateVideoDimensions(options.dimensions ?? 'video'));

    // Chunk date range into 90-day periods
    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);
    debug(`Dimensions: ${dimensions}, Metrics: ${metrics}`);

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
          dimensions,
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
