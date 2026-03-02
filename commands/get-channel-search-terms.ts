import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseChannelHandle, error, setVerbose, debug, formatNumber, convertToCSV } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ChannelSearchTermsOptions } from '../types';

// Content type filter values for YouTube Analytics API
const CONTENT_TYPE_FILTERS: Record<string, string> = {
  video: 'creatorContentType==LONG_FORM_CONTENT',
  shorts: 'creatorContentType==SHORT_FORM_CONTENT',
};

// Metrics supported by the Analytics API for insightTrafficSourceDetail dimension.
// Note: impressions, impressionsClickThroughRate, and estimatedRevenue belong to
// separate Reach/Revenue report types and are not available here.
const ANALYTICS_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
].join(',');

// YouTube founding date — used as the effective "lifetime" start
const YOUTUBE_START_DATE = '2005-02-14';

async function getChannelSearchTermsCommand(channelHandle: string | undefined, options: ChannelSearchTermsOptions): Promise<void> {
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Resolving channel...').start();

  try {
    // Resolve channel from arg or config default
    let channelArg = channelHandle;
    if (!channelArg) {
      const defaultChannel = await getConfigValue('default.channel');
      if (!defaultChannel) {
        spinner.fail('Channel not specified');
        error('No channel provided and no default channel configured.');
        console.log('');
        console.log('Provide a channel handle:');
        console.log('  staqan-yt get-channel-search-terms @channel');
        console.log('');
        console.log('Or set a default channel:');
        console.log('  staqan-yt config set default.channel @channel');
        process.exit(1);
      }
      channelArg = defaultChannel;
    }

    const parsedChannel = parseChannelHandle(channelArg);
    debug('Parsed channel', parsedChannel);

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Resolve handle → channel ID and fetch title
    let channelId = parsedChannel.value;
    let channelTitle = '';

    if (parsedChannel.type === 'handle') {
      debug('Looking up channel by handle:', parsedChannel.value);
      const channelResponse = await youtube.channels.list({
        part: ['id', 'snippet'],
        forHandle: parsedChannel.value.replace('@', ''),
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        spinner.fail('Channel not found');
        error(`Channel not found: ${channelArg}`);
        process.exit(1);
      }

      channelId = channelResponse.data.items[0].id!;
      channelTitle = channelResponse.data.items[0].snippet?.title || '';
    } else {
      const channelResponse = await youtube.channels.list({
        part: ['snippet'],
        id: [parsedChannel.value],
      });
      if (channelResponse.data.items && channelResponse.data.items.length > 0) {
        channelTitle = channelResponse.data.items[0].snippet?.title || '';
      }
    }

    debug('Resolved channel ID:', channelId);
    debug('Channel title:', channelTitle);

    // Build filter string
    const contentTypeFilter = options.contentType && options.contentType !== 'all'
      ? CONTENT_TYPE_FILTERS[options.contentType]
      : undefined;

    const filters = contentTypeFilter
      ? `insightTrafficSourceType==YT_SEARCH;${contentTypeFilter}`
      : 'insightTrafficSourceType==YT_SEARCH';

    const endDate = new Date().toISOString().split('T')[0];
    const limit = options.limit ? parseInt(options.limit, 10) : 50;

    debug('Filters:', filters);
    debug(`Date range: ${YOUTUBE_START_DATE} to ${endDate}`);
    debug('Metrics:', ANALYTICS_METRICS);

    spinner.text = 'Fetching channel search terms (lifetime)...';

    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: `channel==${channelId}`,
      startDate: YOUTUBE_START_DATE,
      endDate,
      metrics: ANALYTICS_METRICS,
      dimensions: 'insightTrafficSourceDetail',
      filters,
      sort: '-views',
      maxResults: limit,
    });

    spinner.succeed('Search terms data retrieved');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);
    const columnHeaders = analyticsResponse.data.columnHeaders || [];
    const rows = analyticsResponse.data.rows || [];

    debug(`Retrieved ${rows.length} row(s)`);

    // Map column indices by name for structured output
    const colIndex = (name: string) =>
      columnHeaders.findIndex(h => h.name === name);

    const idxTerm  = colIndex('insightTrafficSourceDetail');
    const idxViews = colIndex('views');
    const idxWatch = colIndex('estimatedMinutesWatched');
    const idxSubs  = colIndex('subscribersGained');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredRows = rows.map((row: any[]) => ({
      rank: 0,           // filled below
      searchTerm:        row[idxTerm]  as string,
      views:             row[idxViews] as number,
      watchTimeMinutes:  row[idxWatch] as number,
      subscribersGained: row[idxSubs]  as number,
    }));

    structuredRows.forEach((r, i) => { r.rank = i + 1; });

    const contentTypeLabel =
      options.contentType === 'video'  ? 'Regular videos only' :
      options.contentType === 'shorts' ? 'Shorts only' :
      'All content';

    switch (outputFormat) {
      case 'json':
        console.log(formatJson({
          channelId,
          channelTitle,
          contentType: contentTypeLabel,
          period: 'lifetime',
          dateRange: { startDate: YOUTUBE_START_DATE, endDate },
          columnHeaders: columnHeaders.map(h => h.name),
          rows,
        }));
        break;

      case 'table':
        console.log(formatTable(structuredRows));
        break;

      case 'text':
        // Tab-delimited: header then rows
        console.log(['rank', 'searchTerm', 'views', 'watchTimeMinutes', 'subscribersGained'].join('\t'));
        structuredRows.forEach(r => {
          console.log([r.rank, r.searchTerm, r.views, r.watchTimeMinutes, r.subscribersGained].join('\t'));
        });
        break;

      case 'csv':
        if (columnHeaders.length > 0 && rows.length > 0) {
          console.log(convertToCSV(columnHeaders, rows));
        } else {
          console.log(formatCsv(structuredRows));
        }
        break;

      case 'pretty':
      default: {
        if (channelTitle) {
          console.log(chalk.bold.cyan(channelTitle));
          console.log(chalk.gray('Channel ID: ') + chalk.yellow(channelId));
        } else {
          console.log(chalk.bold.cyan(channelId));
        }
        console.log(chalk.gray('Period:       ') + chalk.white('Lifetime'));
        console.log(chalk.gray('Content type: ') + chalk.white(contentTypeLabel));
        console.log(chalk.gray('Traffic source: ') + chalk.white('YouTube Search'));
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No search terms data available.'));
          console.log(chalk.gray('This could mean:'));
          console.log(chalk.gray('  - Channel hasn\'t received traffic from YouTube search'));
          console.log(chalk.gray('  - Analytics data not yet available'));
          console.log('');
          return;
        }

        console.log(chalk.bold(`Top Search Terms (${rows.length}):`));
        console.log('');

        let totalViews = 0;
        structuredRows.forEach(r => { totalViews += r.views; });

        structuredRows.forEach(r => {
          const pct = totalViews > 0 ? ((r.views / totalViews) * 100).toFixed(1) : '0.0';

          console.log(chalk.gray(`  ${r.rank}.`) + ' ' + chalk.white.bold(r.searchTerm));
          console.log(
            chalk.gray('      Views:      ') + chalk.cyan(formatNumber(r.views)) +
            chalk.gray(` (${pct}% of search traffic)`)
          );
          if (r.watchTimeMinutes > 0) {
            const watchHours = (r.watchTimeMinutes / 60).toFixed(0);
            console.log(chalk.gray('      Watch time: ') + chalk.cyan(`${formatNumber(parseInt(watchHours, 10))}h`));
          }
          if (r.subscribersGained > 0) {
            console.log(chalk.gray('      Subs gained: ') + chalk.green(`+${formatNumber(r.subscribersGained)}`));
          }
          console.log('');
        });

        console.log(chalk.bold('Total views from search: ') + chalk.cyan(formatNumber(totalViews)));
        console.log('');
        break;
      }
    }
  } catch (err) {
    spinner.fail('Failed to fetch channel search terms');
    console.log('');

    const errorMessage = (err as Error).message || '';

    if (errorMessage.includes('403') || errorMessage.includes('insufficient')) {
      error('Analytics API access denied. Make sure you have:');
      console.log('  1. Enabled YouTube Analytics API in Google Cloud Console');
      console.log('  2. Re-authenticated with: staqan-yt auth');
      console.log('');
      console.log('Required scope: https://www.googleapis.com/auth/yt-analytics.readonly');
    } else if (errorMessage.includes('400')) {
      error('Invalid analytics request. This may happen if:');
      console.log('  - The channel has no lifetime search data yet');
      console.log('  - The content-type filter is not supported for your account');
    } else {
      error(errorMessage);
    }

    process.exit(1);
  }
}

export = getChannelSearchTermsCommand;
