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

// Metrics for insightTrafficSourceDetail with insightTrafficSourceType==YT_SEARCH.
// videoThumbnailImpressions/CTR are only valid for discovery-type sources and
// cause a 400 when combined with YT_SEARCH. Keep only the two safe ones.
const ANALYTICS_METRICS = [
  'views',
  'estimatedMinutesWatched',
].join(',');

// This report type enforces a hard limit of 25 results
const MAX_RESULTS_LIMIT = 25;

// Maximum video IDs per Analytics API call (documented limit)
const MAX_VIDEO_IDS = 500;

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

    // Resolve handle → channel ID, uploads playlist ID, and title
    let channelId = parsedChannel.value;
    let channelTitle = '';
    let uploadsPlaylistId = '';

    const channelParts = ['id', 'snippet', 'contentDetails'];

    if (parsedChannel.type === 'handle') {
      debug('Looking up channel by handle:', parsedChannel.value);
      const channelResponse = await youtube.channels.list({
        part: channelParts,
        forHandle: parsedChannel.value.replace('@', ''),
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        spinner.fail('Channel not found');
        error(`Channel not found: ${channelArg}`);
        process.exit(1);
      }

      channelId = channelResponse.data.items[0].id!;
      channelTitle = channelResponse.data.items[0].snippet?.title || '';
      uploadsPlaylistId = channelResponse.data.items[0].contentDetails?.relatedPlaylists?.uploads || '';
    } else {
      const channelResponse = await youtube.channels.list({
        part: channelParts,
        id: [parsedChannel.value],
      });
      if (channelResponse.data.items && channelResponse.data.items.length > 0) {
        channelTitle = channelResponse.data.items[0].snippet?.title || '';
        uploadsPlaylistId = channelResponse.data.items[0].contentDetails?.relatedPlaylists?.uploads || '';
      }
    }

    debug('Resolved channel ID:', channelId);
    debug('Channel title:', channelTitle);
    debug('Uploads playlist ID:', uploadsPlaylistId);

    if (!uploadsPlaylistId) {
      spinner.fail('Could not determine uploads playlist');
      error('Unable to find the uploads playlist for this channel.');
      process.exit(1);
    }

    // Fetch video IDs from the uploads playlist.
    // The Analytics API requires video==id1,id2,... in the filter —
    // there is no channel-wide aggregate endpoint in the public API.
    // We collect up to MAX_VIDEO_IDS (500) IDs, which is the per-call limit.
    spinner.text = `Fetching video list from ${channelTitle || channelId}...`;

    const videoIds: string[] = [];
    let nextPageToken: string | undefined;

    do {
      const playlistResponse = await youtube.playlistItems.list({
        part: ['contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      for (const item of playlistResponse.data.items || []) {
        const vid = item.contentDetails?.videoId;
        if (vid) videoIds.push(vid);
      }

      nextPageToken = playlistResponse.data.nextPageToken || undefined;
    } while (nextPageToken && videoIds.length < MAX_VIDEO_IDS);

    debug(`Collected ${videoIds.length} video IDs`);

    if (videoIds.length === 0) {
      spinner.fail('No videos found');
      error('No videos found for this channel.');
      process.exit(1);
    }

    // Build filter: video IDs + traffic source + optional content type
    const contentTypeFilter = options.contentType && options.contentType !== 'all'
      ? CONTENT_TYPE_FILTERS[options.contentType]
      : undefined;

    const videoFilter = `video==${videoIds.join(',')}`;
    const sourceFilter = 'insightTrafficSourceType==YT_SEARCH';
    const filters = contentTypeFilter
      ? `${videoFilter};${sourceFilter};${contentTypeFilter}`
      : `${videoFilter};${sourceFilter}`;

    const endDate = new Date().toISOString().split('T')[0];
    // API enforces maxResults ≤ 25 for this report type
    const limit = Math.min(options.limit ? parseInt(options.limit, 10) : 25, MAX_RESULTS_LIMIT);

    debug('Video count in filter:', videoIds.length);
    debug('Filters (truncated):', filters.substring(0, 120) + '...');
    debug(`Date range: ${YOUTUBE_START_DATE} to ${endDate}`);

    spinner.text = 'Fetching channel search terms (lifetime)...';

    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredRows = rows.map((row: any[]) => ({
      rank: 0,           // filled below
      searchTerm:        row[idxTerm]  as string,
      views:             row[idxViews] as number,
      watchTimeMinutes:  idxWatch >= 0 ? row[idxWatch] as number : 0,
    }));

    structuredRows.forEach((r, i) => { r.rank = i + 1; });

    const contentTypeLabel =
      options.contentType === 'video'  ? 'Regular videos only' :
      options.contentType === 'shorts' ? 'Shorts only' :
      'All content';

    const videoCountNote = videoIds.length >= MAX_VIDEO_IDS
      ? ` (first ${MAX_VIDEO_IDS} videos)`
      : ` (${videoIds.length} videos)`;

    switch (outputFormat) {
      case 'json':
        console.log(formatJson({
          channelId,
          channelTitle,
          contentType: contentTypeLabel,
          period: 'lifetime',
          videosAnalyzed: videoIds.length,
          dateRange: { startDate: YOUTUBE_START_DATE, endDate },
          columnHeaders: columnHeaders.map(h => h.name),
          rows,
        }));
        break;

      case 'table':
        console.log(formatTable(structuredRows));
        break;

      case 'text':
        console.log(['rank', 'searchTerm', 'views', 'watchTimeMinutes'].join('\t'));
        structuredRows.forEach(r => {
          console.log([r.rank, r.searchTerm, r.views, r.watchTimeMinutes].join('\t'));
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
        console.log(chalk.gray('Period:         ') + chalk.white('Lifetime'));
        console.log(chalk.gray('Content type:   ') + chalk.white(contentTypeLabel));
        console.log(chalk.gray('Traffic source: ') + chalk.white('YouTube Search'));
        console.log(chalk.gray('Videos covered: ') + chalk.white(`${videoIds.length}${videoIds.length >= MAX_VIDEO_IDS ? ' (capped at 500)' : ''}`));
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No search terms data available.'));
          console.log(chalk.gray('This could mean:'));
          console.log(chalk.gray('  - Channel hasn\'t received traffic from YouTube search'));
          console.log(chalk.gray('  - Analytics data not yet available'));
          console.log('');
          return;
        }

        console.log(chalk.bold(`Top Search Terms (${rows.length}${videoCountNote}):`));
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
            console.log(chalk.gray('      Watch time:  ') + chalk.cyan(`${formatNumber(parseInt(watchHours, 10))}h`));
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

    // Always show the raw API error so nothing is hidden during debugging
    error(errorMessage);

    if (errorMessage.includes('403') || errorMessage.includes('insufficient')) {
      console.log('');
      console.log('Analytics API access denied. Make sure you have:');
      console.log('  1. Enabled YouTube Analytics API in Google Cloud Console');
      console.log('  2. Re-authenticated with: staqan-yt auth');
      console.log('');
      console.log('Required scope: https://www.googleapis.com/auth/yt-analytics.readonly');
    }

    process.exit(1);
  }
}

export = getChannelSearchTermsCommand;
