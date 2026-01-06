import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, setVerbose, debug, formatNumber } from '../lib/utils';
import { shouldUseJson } from '../lib/config';
import { AnalyticsOptions } from '../types';

async function getVideoAnalyticsCommand(videoId: string, options: AnalyticsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video analytics...').start();

  try {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get video info for title
    const videoResponse = await youtube.videos.list({
      part: ['snippet'],
      id: [parsedId],
    });

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      spinner.fail('Video not found');
      error(`No video found with ID: ${parsedId}`);
      process.exit(1);
    }

    const title = videoResponse.data.items[0].snippet?.title || 'Untitled';

    // Calculate date range (default: last 30 days)
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate || (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })();

    debug(`Date range: ${startDate} to ${endDate}`);

    // Default metrics
    const metrics = options.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

    debug('Fetching analytics...');

    // Fetch analytics data
    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics,
      dimensions: 'video',
      filters: `video==${parsedId}`,
    });

    spinner.succeed('Analytics data retrieved');
    console.log('');

    const useJson = await shouldUseJson(options.json);

    if (useJson) {
      console.log(JSON.stringify({
        videoId: parsedId,
        title,
        dateRange: { startDate, endDate },
        columnHeaders: analyticsResponse.data.columnHeaders,
        rows: analyticsResponse.data.rows,
      }, null, 2));
    } else {
      console.log(chalk.bold.cyan(title));
      console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
      console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
      console.log('');

      if (!analyticsResponse.data.rows || analyticsResponse.data.rows.length === 0) {
        console.log(chalk.yellow('No analytics data available for this time period.'));
        console.log('');
        return;
      }

      const headers = analyticsResponse.data.columnHeaders || [];
      const row = analyticsResponse.data.rows[0];

      console.log(chalk.bold('Analytics Metrics:'));
      console.log('');

      headers.forEach((header, index) => {
        const name = header.name || '';
        const value = row[index];

        // Skip the video dimension (it's just the video ID)
        if (name === 'video') return;

        // Format metric name
        const formattedName = name
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();

        // Format value
        let formattedValue = value;
        if (typeof value === 'number') {
          if (name.includes('Percentage')) {
            formattedValue = `${value.toFixed(2)}%`;
          } else if (name.includes('Duration') || name.includes('Minutes')) {
            formattedValue = formatNumber(value);
          } else {
            formattedValue = formatNumber(value);
          }
        }

        console.log(chalk.gray(`  ${formattedName}: `) + chalk.white(formattedValue));
      });

      console.log('');
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
