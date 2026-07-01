import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseChannelHandle, error, parsePositiveInt, debug, formatNumber, convertToCSV, initCommand, withSpinner, toLocalYmd, validateDateOption, validateDateRange, parseDuration, runOrExit } from '../lib/utils';
import { getOutputFormat, requireChannel } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ChannelSearchTermsOptions } from '../types';

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

// YouTube's documented Shorts threshold. Note: Shorts can be up to 60s of
// vertical video; videos at exactly 60s are accepted as Shorts, but we use
// `>= 60s` for the long-form bucket to match YouTube Studio's own bucketing.
const SHORTS_DURATION_LIMIT_SECONDS = 60;

// videos.list accepts at most 50 IDs per call
const VIDEOS_LIST_CHUNK_SIZE = 50;

async function getChannelSearchTermsCommand(options: ChannelSearchTermsOptions): Promise<void> {
  initCommand(options);

  const rawLimit = runOrExit(() => parsePositiveInt('--limit', options.limit, 25));
  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  // Validate --content-type against the allowlist. The type is already
  // narrowed to 'all' | 'video' | 'shorts' in types/index.ts, but commander.js
  // passes arbitrary strings through at runtime, so an unknown value would
  // silently fall through to the 'all' branch below.
  const validContentTypes = ['all', 'video', 'shorts'];
  if (options.contentType !== undefined && !validContentTypes.includes(options.contentType)) {
    error(`Invalid --content-type "${options.contentType}". Valid values: ${validContentTypes.join(', ')}`);
    process.exit(1);
  }

  await withSpinner('Resolving channel...', 'Failed to fetch channel search terms', async (spinner) => {
    // Resolve channel from arg or config default
    const channelArg = await requireChannel(options.channel);
    debug(`Using channel: ${channelArg}`);

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

    // --content-type filtering is done CLIENT-SIDE by duration, because the
    // YouTube Analytics API does not accept `creatorContentType` as a filter
    // for the `insightTrafficSourceDetail` + `YT_SEARCH` report. We verified
    // live that it returns `Invalid value (...) given in field parameters.filters`
    // even with the correct enum values (VIDEO_ON_DEMAND / SHORTS). The only
    // way to scope search traffic by content type for this report is to
    // pre-filter the `video==` list to just Shorts (duration < 60s) or just
    // long-form videos (duration >= 60s). See #88.
    const contentType = options.contentType ?? 'all';
    if (contentType !== 'all') {
      const wantShorts = contentType === 'shorts';
      spinner.text = `Fetching video durations (${wantShorts ? 'Shorts' : 'long-form'} filter)...`;

      const durationById = new Map<string, number>();
      for (let i = 0; i < videoIds.length; i += VIDEOS_LIST_CHUNK_SIZE) {
        const chunk = videoIds.slice(i, i + VIDEOS_LIST_CHUNK_SIZE);
        const videosResponse = await youtube.videos.list({
          part: ['contentDetails'],
          id: chunk,
        });
        for (const item of videosResponse.data.items || []) {
          if (item.id && item.contentDetails?.duration) {
            durationById.set(item.id, parseDuration(item.contentDetails.duration));
          }
        }
      }

      const filtered = videoIds.filter((id) => {
        const secs = durationById.get(id);
        if (secs === undefined) return false; // unknown duration → exclude
        return wantShorts ? secs < SHORTS_DURATION_LIMIT_SECONDS : secs >= SHORTS_DURATION_LIMIT_SECONDS;
      });

      debug(`Content-type filter (${contentType}): ${videoIds.length} → ${filtered.length} videos`);

      if (filtered.length === 0) {
        spinner.fail(`No ${wantShorts ? 'Shorts' : 'long-form videos'} found`);
        error(
          `No ${wantShorts ? 'Shorts' : 'long-form videos'} found for this channel. ` +
          `Try a different --content-type value or omit the flag for all videos.`
        );
        process.exit(1);
      }

      // Mutate in place: subsequent filter assembly uses the trimmed list.
      videoIds.length = 0;
      videoIds.push(...filtered);
    }

    const videoFilter = `video==${videoIds.join(',')}`;
    const sourceFilter = 'insightTrafficSourceType==YT_SEARCH';
    const filters = `${videoFilter};${sourceFilter}`;

    const endDate = options.endDate || toLocalYmd(new Date());
    const startDate = options.startDate || YOUTUBE_START_DATE;
    const isLifetime = startDate === YOUTUBE_START_DATE;
    // validateDateRange throws on bad ranges; withSpinner's catch handles it
    // (fail + error + exit) — no manual try/catch needed here.
    validateDateRange(startDate, endDate);
    // API enforces maxResults ≤ 25 for this report type
    const limit = Math.min(rawLimit, MAX_RESULTS_LIMIT);

    debug('Video count in filter:', videoIds.length);
    debug('Filters (truncated):', filters.substring(0, 120) + '...');
    debug(`Date range: ${startDate} to ${endDate}`);

    spinner.text = `Fetching channel search terms (${isLifetime ? 'lifetime' : `${startDate} → ${endDate}`})...`;

    const analyticsResponse = await youtubeAnalytics.reports.query({
      ids: 'channel==MINE',
      startDate,
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
          period: isLifetime ? 'lifetime' : 'custom',
          videosAnalyzed: videoIds.length,
          dateRange: { startDate, endDate },
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
        console.log(chalk.gray('Period:         ') + chalk.white(isLifetime ? 'Lifetime' : `${startDate} → ${endDate}`));
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
  });
}

export = getChannelSearchTermsCommand;
