import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { TrafficSourcesOptions } from '../types';

async function getTrafficSourcesCommand(options: TrafficSourcesOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options['video-id'];
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  await withSpinner('Fetching traffic sources...', 'Failed to fetch traffic sources', async (spinner) => {
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

    const outputFormat = await getOutputFormat(options.output);

    // Prepare data
    const rows = analyticsResponse.data.rows || [];
    const columnHeaders = analyticsResponse.data.columnHeaders || [];

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

    let totalViews = 0;
    rows.forEach(row => {
      totalViews += row[1] as number;
    });

    const trafficData = rows.map(row => ({
      source: sourceLabels[row[0] as string] || row[0] as string,
      views: row[1] as number,
      percentage: totalViews > 0 ? ((row[1] as number / totalViews) * 100).toFixed(2) : '0',
    }));

    switch (outputFormat) {
      case 'csv':
        if (columnHeaders && rows) {
          console.log(convertToCSV(columnHeaders, rows));
        } else {
          console.log(formatCsv(trafficData));
        }
        break;

      case 'json':
        console.log(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows,
        }));
        break;

      case 'table':
        console.log(formatTable(trafficData));
        break;

      case 'text':
        trafficData.forEach(item => {
          console.log([item.source, item.views, item.percentage].join('\t'));
        });
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No traffic source data available for this time period.'));
          console.log('');
          return;
        }

        console.log(chalk.bold('Traffic Sources:'));
        console.log('');

        trafficData.forEach(item => {
          console.log(chalk.bold(`  ${item.source}:`));
          console.log(chalk.gray('    Views:      ') + chalk.cyan(formatNumber(item.views)));
          console.log(chalk.gray('    Percentage: ') + chalk.yellow(`${item.percentage}%`));
          console.log('');
        });

        console.log(chalk.bold('Total Views: ') + chalk.cyan(formatNumber(totalViews)));
        console.log('');
        break;
    }
  });
}

export = getTrafficSourcesCommand;
