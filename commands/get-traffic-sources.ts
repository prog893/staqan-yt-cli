import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, setVerbose, debug, formatNumber } from '../lib/utils';
import { shouldUseJson } from '../lib/config';
import { TrafficSourcesOptions } from '../types';

async function getTrafficSourcesCommand(videoId: string, options: TrafficSourcesOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching traffic sources...').start();

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

    // Date range: last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })();

    debug(`Date range: ${startDate} to ${endDate}`);

    // Fetch traffic sources data
    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      filters: `video==${parsedId}`,
      sort: '-views',
    });

    spinner.succeed('Traffic sources data retrieved');
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
        console.log(chalk.yellow('No traffic source data available for this time period.'));
        console.log('');
        return;
      }

      const rows = analyticsResponse.data.rows;
      let totalViews = 0;

      // Calculate total views first
      rows.forEach(row => {
        totalViews += row[1] as number;
      });

      console.log(chalk.bold('Traffic Sources:'));
      console.log('');

      // Traffic source labels
      const sourceLabels: { [key: string]: string } = {
        'YT_SEARCH': 'YouTube Search',
        'RELATED_VIDEO': 'Suggested Videos',
        'EXTERNAL': 'External Sources',
        'BROWSE': 'Browse Features',
        'CHANNEL': 'Channel Page',
        'NOTIFICATION': 'Notifications',
        'PLAYLIST': 'Playlists',
        'SUBSCRIBER': 'Subscriber Feed',
        'CAMPAIGN_CARD': 'Campaign Card',
        'END_SCREEN': 'End Screen',
        'HASHTAGS': 'Hashtags',
        'LIVE_REDIRECT': 'Live Redirect',
        'NO_LINK_EMBEDDED': 'Embedded (No Link)',
        'NO_LINK_OTHER': 'Other (No Link)',
        'PRODUCT_PAGE': 'Product Page',
        'SHORTS': 'Shorts',
        'SOUND_PAGE': 'Sound Page',
        'STORIES': 'Stories',
      };

      rows.forEach(row => {
        const sourceType = row[0] as string;
        const views = row[1] as number;
        const percentage = ((views / totalViews) * 100).toFixed(2);

        const sourceName = sourceLabels[sourceType] || sourceType;

        console.log(chalk.bold(`  ${sourceName}:`));
        console.log(chalk.gray('    Views:      ') + chalk.cyan(formatNumber(views)));
        console.log(chalk.gray('    Percentage: ') + chalk.yellow(`${percentage}%`));
        console.log('');
      });

      console.log(chalk.bold('Total Views: ') + chalk.cyan(formatNumber(totalViews)));
      console.log('');
    }
  } catch (err) {
    spinner.fail('Failed to fetch traffic sources');
    console.log('');

    const errorMessage = (err as Error).message || '';

    if (errorMessage.includes('403') || errorMessage.includes('insufficient')) {
      error('Analytics API access denied. Make sure you have:');
      console.log('  1. Enabled YouTube Analytics API in Google Cloud Console');
      console.log('  2. Re-authenticated with: staqan-yt auth');
    } else {
      error(errorMessage);
    }

    process.exit(1);
  }
}

export = getTrafficSourcesCommand;
