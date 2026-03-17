import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, convertToCSV, chunkDateRange, retryWithBackoff, parseDuration, formatTimestamp, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { RetentionOptions } from '../types';

async function getRetentionCommand(options: RetentionOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options['video-id'];
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  await withSpinner('Fetching video information...', 'Failed to fetch retention data', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get video info for title, publish date, and duration
    const videoResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails'],
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
    const duration = video.contentDetails?.duration || '';

    if (!publishedAt) {
      spinner.fail('Could not determine video publish date');
      error('Video publish date is missing');
      process.exit(1);
    }

    // Calculate date range (default: full historical data)
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = publishedAt.split('T')[0];

    debug(`Date range: ${startDate} to ${endDate}`);

    // Chunk date range into 90-day periods
    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);

    // Fetch retention data for each chunk
    const allRows: unknown[][] = [];
    let columnHeaders: { name?: string | null }[] = [];

    for (let i = 0; i < dateChunks.length; i++) {
      const chunk = dateChunks[i];
      spinner.text = `Fetching chunk ${i + 1}/${dateChunks.length} (${chunk.start} to ${chunk.end})...`;

      const retentionResponse = await retryWithBackoff(async () => {
        return await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate: chunk.start,
          endDate: chunk.end,
          metrics: 'audienceWatchRatio,relativeRetentionPerformance',
          dimensions: 'elapsedVideoTimeRatio',
          filters: `video==${parsedId}`,
          sort: 'elapsedVideoTimeRatio',
        });
      });

      // Save headers from first response
      if (i === 0 && retentionResponse.data.columnHeaders) {
        columnHeaders = retentionResponse.data.columnHeaders;
      }

      // Aggregate rows
      if (retentionResponse.data.rows && retentionResponse.data.rows.length > 0) {
        allRows.push(...retentionResponse.data.rows);
      }
    }

    spinner.succeed(`Retrieved ${allRows.length} retention data point(s)`);

    // Output results
    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'csv':
        if (allRows.length === 0) {
          process.stderr.write(chalk.yellow('⚠ No retention data available for this time period.\n'));
          return;
        }
        console.log(convertToCSV(columnHeaders, allRows));
        break;

      case 'json':
        console.log(formatJson({
          videoId: parsedId,
          title,
          duration,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows: allRows,
        }));
        break;

      case 'table': {
        // Convert rows to table format with readable timestamps
        const totalSeconds = parseDuration(duration);
        const tableData = allRows.map(row => ({
          timestamp: formatTimestamp(row[0] as number * totalSeconds),
          retentionPercent: ((row[1] as number) * 100).toFixed(1) + '%',
          relativePerformance: (row[2] as number).toFixed(2),
        }));
        console.log(formatTable(tableData));
        break;
      }

      case 'text': {
        // Tab-delimited output
        const totalSeconds = parseDuration(duration);
        allRows.forEach(row => {
          console.log([
            formatTimestamp(row[0] as number * totalSeconds),
            ((row[1] as number) * 100).toFixed(1),
            (row[2] as number).toFixed(2)
          ].join('\t'));
        });
        break;
      }

      case 'pretty':
      default: {
        // Human-readable output
        console.log('');
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Duration: ') + duration);
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (allRows.length === 0) {
          console.log(chalk.yellow('No retention data available for this time period.'));
          console.log('');
          return;
        }

        // Parse duration to get total seconds
        const totalSeconds = parseDuration(duration);

        console.log(chalk.bold('Audience Retention Curve:'));
        console.log('');
        console.log(chalk.gray('Timestamp') + '  ' + chalk.gray('Retention %') + '  ' + chalk.gray('vs. Similar Videos'));
        console.log(chalk.gray('─'.repeat(60)));

        allRows.forEach(row => {
          const timeRatio = row[0] as number; // 0.0 to 1.0
          const watchRatio = row[1] as number; // Percentage still watching
          const relativePerformance = row[2] as number; // vs similar videos

          // Convert time ratio to actual timestamp
          const elapsedSeconds = timeRatio * totalSeconds;
          const timestamp = formatTimestamp(elapsedSeconds).padStart(7);
          const retentionPercent = (watchRatio * 100).toFixed(1).padStart(5);

          // Color code based on retention
          let retentionColor = chalk.green;
          if (watchRatio < 0.5) retentionColor = chalk.yellow;
          if (watchRatio < 0.25) retentionColor = chalk.red;

          // Show relative performance
          let perfIndicator = '  ';
          if (relativePerformance > 1.1) perfIndicator = chalk.green('↑↑');
          else if (relativePerformance > 1.0) perfIndicator = chalk.green('↑ ');
          else if (relativePerformance < 0.9) perfIndicator = chalk.red('↓↓');
          else if (relativePerformance < 1.0) perfIndicator = chalk.red('↓ ');
          else perfIndicator = chalk.gray('~ ');

          // Visual bar
          const barLength = Math.round(watchRatio * 40);
          const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);

          console.log(`  ${timestamp}  ${retentionColor(retentionPercent + '%')}  ${perfIndicator}  ${chalk.dim(bar)}`);
        });

        console.log('');
        console.log(chalk.dim('↑↑ = Much better than similar videos  ↓↓ = Much worse than similar videos'));
        console.log('');
        break;
      }
    }
  });
}

export = getRetentionCommand;
