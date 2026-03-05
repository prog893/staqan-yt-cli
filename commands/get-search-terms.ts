import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { SearchTermsOptions } from '../types';

async function getSearchTermsCommand(videoId: string, options: SearchTermsOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching search terms...', 'Failed to fetch search terms', async (spinner) => {
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

    const limit = options.limit ? parseInt(options.limit, 10) : 50;

    // Fetch search terms data
    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'insightTrafficSourceDetail',
      filters: `video==${parsedId};insightTrafficSourceType==YT_SEARCH`,
      sort: '-views',
      maxResults: limit,
    });

    spinner.succeed('Search terms data retrieved');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    // Prepare data for structured formats
    const rows = analyticsResponse.data.rows || [];
    const searchTermsData = rows.map((row, index) => ({
      rank: index + 1,
      searchTerm: row[0] as string,
      views: row[1] as number,
    }));

    switch (outputFormat) {
      case 'json':
        console.log(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders: analyticsResponse.data.columnHeaders,
          rows: analyticsResponse.data.rows,
        }));
        break;

      case 'table':
        console.log(formatTable(searchTermsData));
        break;

      case 'text':
        searchTermsData.forEach(item => {
          console.log([item.rank, item.searchTerm, item.views].join('\t'));
        });
        break;

      case 'csv':
        // Use convertToCSV for consistency with analytics commands
        if (analyticsResponse.data.columnHeaders && analyticsResponse.data.rows) {
          console.log(convertToCSV(analyticsResponse.data.columnHeaders, analyticsResponse.data.rows));
        } else {
          console.log(formatCsv(searchTermsData));
        }
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No search terms data available for this time period.'));
          console.log(chalk.gray('This could mean:'));
          console.log(chalk.gray('  - Video hasn\'t received traffic from YouTube search'));
          console.log(chalk.gray('  - Analytics data not yet available (48-hour delay)'));
          console.log('');
          return;
        }

        console.log(chalk.bold(`Top Search Terms (${rows.length}):`));
        console.log('');

        let totalViews = 0;

        rows.forEach((row, index) => {
          const searchTerm = row[0] as string;
          const views = row[1] as number;
          totalViews += views;

          console.log(chalk.gray(`  ${index + 1}.`) + ` ${searchTerm}`);
          console.log(chalk.gray('      ') + chalk.cyan(`${formatNumber(views)} views`));
        });

        console.log('');
        console.log(chalk.bold('Total views from search: ') + chalk.cyan(formatNumber(totalViews)));
        console.log('');
        break;
    }
  });
}

export = getSearchTermsCommand;
