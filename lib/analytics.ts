/**
 * YouTube Analytics API data layer (issue #102).
 *
 * Commands and the MCP server both consume these functions: commands add
 * spinners and output formatting on top, the MCP server serializes the
 * returned data directly. Business logic lives here exactly once — before
 * this file, commands/mcp.ts re-implemented each analytics query inline and
 * the copies drifted (e.g. the MCP video-analytics tool never gained
 * --dimensions support when #120 shipped it in the CLI).
 */

import { google, youtube_v3 } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { chunkDateRange, debug, parseChannelHandle, parseDuration, toLocalYmd, validateDateRange, withRateLimitRetry } from './utils';

/**
 * The metric vocabulary the compatibility sweep covers. A metric outside this
 * list is passed through to the API unchecked, since the tables below say
 * nothing about it.
 */
export const ALL_SWEPT_METRICS: readonly string[] = [
  'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
  'averageViewPercentage', 'likes', 'dislikes', 'comments', 'shares',
  'subscribersGained', 'subscribersLost', 'videosAddedToPlaylists', 'redViews',
  'estimatedRedMinutesWatched', 'annotationClickThroughRate', 'cardClickRate',
];

/**
 * The five view and watch-time metrics every valid dimension permits.
 *
 * `engagedViews` was added from the 2026-08-24 sweep (#175) and sits in exactly
 * the same compatibility class as `views`: measured against all 13 valid
 * dimensions, every one accepts it, including the five restrictive dimensions
 * that permit nothing else beyond this set. Its availability was measured
 * rather than inferred from `views`, since the earlier sweep predated it.
 */
export const VIEW_METRICS: readonly string[] = [
  'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
  'averageViewPercentage',
];

/**
 * Allowlist of Analytics API dimensions valid for video-level queries.
 * See https://developers.google.com/youtube/v3/docs/analytics_api/dimensions/dims
 * and docs/dimension-compatibility.md for the live-tested combination matrix.
 *
 * Membership is decided by one question: does the API accept this dimension for
 * the query this file actually sends (`filters: video==<id>`, no extra filters)?
 * Dimensions that only work alongside a filter the CLI cannot express are
 * excluded, because allowlisting them just defers the same failure to the API
 * and returns the opaque "query is not supported" instead of a clear message.
 */
export const VIDEO_DIMENSIONS: ReadonlySet<string> = new Set([
  'video',
  'day',
  'month',
  'insightTrafficSourceType',
  'creatorContentType',
  'country',
  'dma',
  'deviceType',
  'operatingSystem',
  'insightPlaybackLocationType',
  'subscribedStatus',
  'youtubeProduct',
  'liveOrOnDemand',
]);

/**
 * Every dimension pair the Analytics API rejects, from the full pairwise sweep
 * in `scripts/sweep-analytics-compat.ts`. Complete for the allowlist above, not
 * a sample: all 66 pairs were probed and these 24 were rejected.
 *
 * Probed with `metrics=views`, which every dimension permits, so each entry is
 * a genuine dimension conflict rather than a metric one. `country,month` is
 * deliberately absent: it is accepted, given first-of-month dates.
 */
export const INVALID_DIMENSION_COMBOS: ReadonlyArray<ReadonlyArray<string>> = [
  ['country', 'deviceType'],
  ['country', 'dma'],
  ['country', 'insightPlaybackLocationType'],
  ['country', 'insightTrafficSourceType'],
  ['country', 'operatingSystem'],
  ['day', 'country'],
  ['day', 'month'],
  ['deviceType', 'insightPlaybackLocationType'],
  ['deviceType', 'insightTrafficSourceType'],
  ['dma', 'deviceType'],
  ['dma', 'insightPlaybackLocationType'],
  ['dma', 'insightTrafficSourceType'],
  ['dma', 'liveOrOnDemand'],
  ['dma', 'operatingSystem'],
  ['dma', 'youtubeProduct'],
  ['insightTrafficSourceType', 'insightPlaybackLocationType'],
  ['month', 'deviceType'],
  ['month', 'insightPlaybackLocationType'],
  ['month', 'insightTrafficSourceType'],
  ['month', 'operatingSystem'],
  ['operatingSystem', 'insightPlaybackLocationType'],
  ['operatingSystem', 'insightTrafficSourceType'],
  ['youtubeProduct', 'insightPlaybackLocationType'],
  ['youtubeProduct', 'insightTrafficSourceType'],
];

/**
 * Dimensions valid in any pair but rejected in any larger query, which the
 * pairwise table above cannot express. `dma` is accepted alone and with every
 * dimension it does not conflict with, yet every three-dimension query
 * containing it is rejected.
 *
 * There is no global arity limit: seven dimensions in one query is accepted.
 * The "max 4 dimensions" folklore came from a 5-dimension example that happened
 * to contain `day,country`.
 */
export const DIMENSION_MAX_ARITY: Readonly<Record<string, number>> = {
  dma: 2,
};

/**
 * Metrics each dimension permits. The API rejects the whole query when any
 * requested metric is unavailable for the requested dimension, which is why
 * most dimensions appear broken under the default metric set (issue #173).
 *
 * For a multi-dimension query the permitted set is the **intersection** of the
 * entries below. That composition law was verified against the API rather than
 * assumed: see Phase D of `scripts/sweep-analytics-compat.ts`.
 */
export const DIMENSION_METRICS: Readonly<Record<string, readonly string[]>> = {
  video: ALL_SWEPT_METRICS,
  day: ALL_SWEPT_METRICS,
  month: ALL_SWEPT_METRICS,
  country: ALL_SWEPT_METRICS,
  dma: VIEW_METRICS,
  deviceType: VIEW_METRICS,
  operatingSystem: VIEW_METRICS,
  subscribedStatus: [
    'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
    'averageViewPercentage', 'likes', 'dislikes', 'shares', 'videosAddedToPlaylists',
    'redViews', 'estimatedRedMinutesWatched', 'annotationClickThroughRate', 'cardClickRate',
  ],
  youtubeProduct: [
    'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
    'averageViewPercentage', 'redViews', 'estimatedRedMinutesWatched',
  ],
  liveOrOnDemand: [
    'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
    'redViews', 'estimatedRedMinutesWatched',
  ],
  creatorContentType: [
    'views', 'engagedViews', 'estimatedMinutesWatched', 'averageViewDuration',
    'averageViewPercentage', 'likes', 'dislikes', 'comments', 'shares',
    'subscribersGained', 'subscribersLost', 'redViews', 'estimatedRedMinutesWatched',
    'cardClickRate',
  ],
  insightTrafficSourceType: VIEW_METRICS,
  insightPlaybackLocationType: VIEW_METRICS,
};

/**
 * Metrics permitted by every dimension in `dims`. Unknown dimensions impose no
 * restriction, so a dimension added to the allowlist without a swept metric row
 * fails open to the API rather than silently rejecting valid metrics.
 */
export function allowedMetricsFor(dims: readonly string[]): string[] {
  const known = dims.map(d => DIMENSION_METRICS[d]).filter((m): m is readonly string[] => m !== undefined);
  if (known.length === 0) return [...ALL_SWEPT_METRICS];
  return known.reduce<string[]>(
    (acc, cur) => acc.filter(m => cur.includes(m)),
    [...known[0]],
  );
}

/**
 * Validate a comma-separated dimensions string against the allowlist and
 * known-bad combos. Returns the normalized (trimmed) string on success;
 * throws on any invalid dimension or rejected combination.
 */
export function validateVideoDimensions(raw: string): string {
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

  for (const d of dims) {
    const cap = DIMENSION_MAX_ARITY[d];
    if (cap !== undefined && dims.length > cap) {
      throw new Error(
        `Invalid --dimensions combination: "${d}" cannot be combined with more than ` +
        `${cap - 1} other dimension(s). Got ${dims.length}: ${dims.join(', ')}.`,
      );
    }
  }

  return dims.join(',');
}

/**
 * Reconcile a metric list with what the requested dimensions permit (#173).
 *
 * The API rejects the entire query when any requested metric is unavailable for
 * the requested dimensions, and answers with the same opaque "query is not
 * supported" it uses for dimension conflicts. Resolving it here means the
 * failure names the metric instead.
 *
 * `explicit` distinguishes the two cases that deserve different handling. A
 * metric list the caller typed is never silently altered, because returning
 * different data than asked for is worse than an error. A defaulted list is
 * narrowed, because the caller expressed no preference and the alternative is
 * failing at a request they never made.
 */
export function reconcileMetrics(
  dims: readonly string[],
  metrics: readonly string[],
  explicit: boolean,
): { metrics: string[]; dropped: string[] } {
  const allowed = allowedMetricsFor(dims);
  // Metrics outside the swept vocabulary carry no verdict, so leave them alone.
  const unsupported = metrics.filter(m => ALL_SWEPT_METRICS.includes(m) && !allowed.includes(m));
  if (unsupported.length === 0) return { metrics: [...metrics], dropped: [] };

  if (explicit) {
    throw new Error(
      `Metrics not available for --dimensions ${dims.join(',')}: ${unsupported.join(', ')}. ` +
      `Available for these dimensions: ${allowed.join(', ') || '(none)'}.`,
    );
  }

  const kept = metrics.filter(m => !unsupported.includes(m));
  if (kept.length === 0) {
    throw new Error(
      `No default metric is available for --dimensions ${dims.join(',')}. ` +
      `Pass --metrics explicitly from: ${allowed.join(', ') || '(none)'}.`,
    );
  }
  return { metrics: kept, dropped: unsupported };
}

export interface VideoAnalyticsParams {
  /** Parsed 11-character video ID (callers run parseVideoId first). */
  videoId: string;
  /** YYYY-MM-DD; defaults to the video's upload date. */
  startDate?: string;
  /** YYYY-MM-DD; defaults to today (local). */
  endDate?: string;
  /** Comma-separated metrics; defaults to the standard engagement set. */
  metrics?: string;
  /** Comma-separated dimensions; defaults to 'video' (aggregate). Validated here. */
  dimensions?: string;
  /** Progress hook — commands wire this to the spinner; MCP omits it. */
  onProgress?: (message: string) => void;
}

export interface VideoAnalyticsResult {
  videoId: string;
  title: string;
  dateRange: { startDate: string; endDate: string };
  dimensions: string;
  metrics: string;
  columnHeaders: { name?: string | null }[];
  rows: unknown[][];
  /** Set when the range reaches before the view-counting change (#178). */
  viewCountingNotice?: ViewCountingNotice;
}

/**
 * Default columns for a video analytics query.
 *
 * `engagedViews` sits second, next to `views`, because on Shorts the two answer
 * very different questions and reading only the first is misleading. Measured
 * on this channel over 2026-07-13..2026-08-23:
 *
 *   BpesXOddpVc (short)     197 views     8 engagedViews
 *   qC_vD4tPNqA (short)     245 views    23 engagedViews
 *   -COxZI7L-IA (long-form) 548 views   548 engagedViews
 *
 * Long-form is unchanged because a long-form view already counted from the
 * start; the 2026-08-24 alignment removed the minimum-watch-time rule that
 * only ever applied to Shorts. So the default set has to carry both, or a
 * Shorts creator reads 197 where 8 is the engagement figure.
 *
 * Widening this set costs nothing in compatibility: the #175 sweep measured
 * `engagedViews` as permitted by all 13 valid dimensions, so unlike the
 * metrics #173 has to drop, it never narrows a query.
 */
export const DEFAULT_VIDEO_METRICS =
  'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

/**
 * Fetch analytics for one video: resolves the date range from the upload
 * date, validates dimensions, chunks the range into the API's 90-day
 * windows, and aggregates the rows. Throws on unknown video, invalid
 * dimensions, or an inverted date range.
 */
export async function fetchVideoAnalytics(params: VideoAnalyticsParams): Promise<VideoAnalyticsResult> {
  assertVideoId(params.videoId);
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  // Video lookup: title for display, publishedAt for the default start date.
  const videoResponse = await youtube.videos.list({
    part: ['snippet'],
    id: [params.videoId],
  });

  if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
    throw new Error(`No video found with ID: ${params.videoId}`);
  }

  const video = videoResponse.data.items[0];
  const title = video.snippet?.title || 'Untitled';
  const publishedAt = video.snippet?.publishedAt;

  if (!publishedAt) {
    throw new Error('Video publish date is missing');
  }

  // Default: full historical data from upload date to today.
  const endDate = params.endDate || toLocalYmd(new Date());
  const startDate = params.startDate || publishedAt.split('T')[0];
  validateDateRange(startDate, endDate);
  debug(`Date range: ${startDate} to ${endDate}`);

  const dimensions = validateVideoDimensions(params.dimensions ?? 'video');
  const reconciled = reconcileMetrics(
    dimensions.split(','),
    (params.metrics || DEFAULT_VIDEO_METRICS).split(',').map(m => m.trim()).filter(Boolean),
    Boolean(params.metrics),
  );
  const metrics = reconciled.metrics.join(',');
  if (reconciled.dropped.length > 0) {
    // stderr, not `onProgress`: the progress hook drives the spinner text, and
    // the chunk loop below overwrites it on the next line, so the notice would
    // never survive to be read. stderr also keeps stdout clean for piping.
    process.stderr.write(
      `Note: dropped ${reconciled.dropped.join(', ')} from the default metrics; ` +
      `not available for --dimensions ${dimensions}.\n`,
    );
    debug(`Dropped default metrics for ${dimensions}: ${reconciled.dropped.join(', ')}`);
  }

  const dateChunks = chunkDateRange(startDate, endDate);
  debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);
  debug(`Dimensions: ${dimensions}, Metrics: ${metrics}`);

  const allRows: unknown[][] = [];
  let columnHeaders: { name?: string | null }[] = [];

  for (let i = 0; i < dateChunks.length; i++) {
    const chunk = dateChunks[i];
    params.onProgress?.(`Fetching chunk ${i + 1}/${dateChunks.length} (${chunk.start} to ${chunk.end})...`);

    const analyticsResponse = await withRateLimitRetry(async () => {
      return await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: chunk.start,
        endDate: chunk.end,
        metrics,
        dimensions,
        filters: `video==${params.videoId}`,
      });
    }, { label: 'reports.query(video analytics)' });

    if (i === 0 && analyticsResponse.data.columnHeaders) {
      columnHeaders = analyticsResponse.data.columnHeaders;
    }

    if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
      allRows.push(...analyticsResponse.data.rows);
    }
  }

  return {
    videoId: params.videoId,
    title,
    dateRange: { startDate, endDate },
    dimensions,
    metrics,
    columnHeaders,
    rows: allRows,
    viewCountingNotice: viewCountingNoticeFor(startDate, endDate, metrics),
  };
}

// ─── Per-video report queries (traffic sources, search terms, retention) ─────

/** YouTube's founding date — the effective "all-time" start for Analytics queries. */
export const ALL_TIME_START_DATE = '2005-02-14';

/** Rows + headers as the Analytics API returns them, plus display context. */
export interface VideoReportResult {
  videoId: string;
  title: string;
  dateRange: { startDate: string; endDate: string };
  columnHeaders: { name?: string | null }[];
  rows: unknown[][];
  /**
   * Set when the range reaches back before the 2026-08-24 view-counting
   * change. These reports send a fixed `views` metric set, so the caveat
   * applies to every row they return.
   */
  viewCountingNotice?: ViewCountingNotice;
}

/**
 * Strict video-ID check before interpolating into an Analytics `filters`
 * string. parseVideoId passes unmatched input through unchanged, so without
 * this a malformed value could inject extra filter clauses.
 */
function assertVideoId(videoId: string): void {
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error(`Invalid video ID: ${videoId}`);
  }
}

interface VideoSnippetInfo {
  title: string;
  publishedAt: string;
  duration: string;
}

/** Shared lookup: title/publishedAt/duration for display and date defaulting. */
async function lookupVideoSnippet(youtube: youtube_v3.Youtube, videoId: string): Promise<VideoSnippetInfo> {
  const response = await youtube.videos.list({
    part: ['snippet', 'contentDetails'],
    id: [videoId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`No video found with ID: ${videoId}`);
  }

  const item = response.data.items[0];
  const publishedAt = item.snippet?.publishedAt;
  if (!publishedAt) {
    throw new Error('Video publish date is missing');
  }
  return {
    title: item.snippet?.title || 'Untitled',
    publishedAt,
    duration: item.contentDetails?.duration || '',
  };
}

/**
 * Traffic-source breakdown for one video (insightTrafficSourceType).
 * Date range is caller-supplied on purpose: the CLI defaults to the last 30
 * days, the MCP tool to all-time — consolidating here must not silently
 * change either surface's documented behavior.
 */
/**
 * Metrics for the two per-video breakdowns (`get-traffic-sources`,
 * `get-search-terms`), which take no `--metrics` flag (#185).
 *
 * `engagedViews` is included because these are exactly the queries a caller
 * cannot widen themselves. On long-form the two agree (measured 548 against
 * 548 for one video), but on a Short they diverge sharply (197 against 8), and
 * the command cannot know which it is being pointed at.
 *
 * Declared once and passed to both the API call and `viewCountingNoticeFor`,
 * so the notice can never describe a metric set the query did not send.
 */
const VIDEO_BREAKDOWN_METRICS = 'views,engagedViews';

export async function fetchTrafficSources(params: {
  videoId: string;
  startDate: string;
  endDate: string;
}): Promise<VideoReportResult> {
  assertVideoId(params.videoId);
  validateDateRange(params.startDate, params.endDate);
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
  const { title } = await lookupVideoSnippet(youtube, params.videoId);

  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate: params.startDate,
    endDate: params.endDate,
    metrics: VIDEO_BREAKDOWN_METRICS,
    dimensions: 'insightTrafficSourceType',
    filters: `video==${params.videoId}`,
    sort: '-views',
  }), { label: 'reports.query(traffic sources)' });

  return {
    videoId: params.videoId,
    title,
    dateRange: { startDate: params.startDate, endDate: params.endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
    viewCountingNotice: viewCountingNoticeFor(params.startDate, params.endDate, VIDEO_BREAKDOWN_METRICS),
  };
}

/**
 * YouTube-search terms that led viewers to one video
 * (insightTrafficSourceDetail filtered to YT_SEARCH). Same caller-supplied
 * date-range contract as fetchTrafficSources.
 */
export async function fetchSearchTerms(params: {
  videoId: string;
  startDate: string;
  endDate: string;
  limit: number;
}): Promise<VideoReportResult> {
  assertVideoId(params.videoId);
  validateDateRange(params.startDate, params.endDate);
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
  const { title } = await lookupVideoSnippet(youtube, params.videoId);

  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate: params.startDate,
    endDate: params.endDate,
    metrics: VIDEO_BREAKDOWN_METRICS,
    dimensions: 'insightTrafficSourceDetail',
    filters: `video==${params.videoId};insightTrafficSourceType==YT_SEARCH`,
    sort: '-views',
    maxResults: params.limit,
  }), { label: 'reports.query(search terms)' });

  return {
    videoId: params.videoId,
    title,
    dateRange: { startDate: params.startDate, endDate: params.endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
    viewCountingNotice: viewCountingNoticeFor(params.startDate, params.endDate, VIDEO_BREAKDOWN_METRICS),
  };
}

export interface VideoRetentionResult extends VideoReportResult {
  duration: string;
}

/**
 * Lifetime audience-retention curve (elapsedVideoTimeRatio) in a single
 * query from the upload date. Deliberately NOT chunked into 90-day windows:
 * ratio-dimension reports return one complete 100-point curve per query, so
 * chunking + concatenation would interleave duplicate ratio points whenever
 * more than one chunk has data (live-verified 2026-07-13: a lifetime query
 * returns exactly 100 unique ratio points, 0.01 → 1).
 */
export async function fetchVideoRetention(params: { videoId: string }): Promise<VideoRetentionResult> {
  assertVideoId(params.videoId);
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
  const { title, publishedAt, duration } = await lookupVideoSnippet(youtube, params.videoId);

  const startDate = publishedAt.split('T')[0];
  const endDate = toLocalYmd(new Date());

  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${params.videoId}`,
    sort: 'elapsedVideoTimeRatio',
  }), { label: 'reports.query(retention)' });

  return {
    videoId: params.videoId,
    title,
    duration,
    dateRange: { startDate, endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
  };
}

// ─── Channel-level reports (channel analytics, channel search terms) ─────────

/**
 * Predefined report types for channel analytics, shared by the CLI command
 * and the MCP tool (the two copies were identical before consolidation).
 *
 * demographics uses viewerPercentage — the only metric the Analytics API
 * accepts for ageGroup/gender reports (live-verified 2026-07-17: the old
 * views,estimatedMinutesWatched pair was rejected with "not supported",
 * so the report type never worked on either surface).
 *
 * Every report carrying a view count sends `views,engagedViews` (#185). The
 * two are not interchangeable and the gap is large: measured channel-wide over
 * 2026-05-01..2026-08-25, geography returned 1485 views against 883
 * engagedViews, devices 2849 against 1873. A breakdown reporting only `views`
 * therefore describes reach where the question is usually engagement.
 *
 * `sort` stays `-views` rather than moving to `-engagedViews`. Row order is
 * part of a predefined report's shape, and #179 settled the same question the
 * same way for custom queries: a query that ranked one way before this existed
 * ranks identically after it. Changing the axis would be a second, separate
 * break with nothing forcing it.
 *
 * demographics is untouched: `viewerPercentage` is a share, not a count, so
 * there is no view metric for the change to have moved.
 */
export const CHANNEL_REPORT_TYPES: Record<string, { dimensions: string; metrics: string; sort: string }> = {
  demographics: {
    dimensions: 'ageGroup,gender',
    metrics: 'viewerPercentage',
    sort: '-viewerPercentage',
  },
  devices: {
    dimensions: 'deviceType,operatingSystem',
    metrics: 'views,engagedViews,estimatedMinutesWatched',
    sort: '-views',
  },
  geography: {
    dimensions: 'country',
    metrics: 'views,engagedViews,estimatedMinutesWatched',
    sort: '-views',
  },
  'traffic-sources': {
    dimensions: 'insightTrafficSourceType',
    metrics: 'views,engagedViews,estimatedMinutesWatched',
    sort: '-views',
  },
  'subscription-status': {
    dimensions: 'subscribedStatus',
    metrics: 'views,engagedViews,estimatedMinutesWatched',
    sort: '-views',
  },
};

interface ChannelInfo {
  channelId: string;
  channelTitle: string;
  uploadsPlaylistId: string;
}

/**
 * Resolve a channel handle or ID to its canonical ID, title, and uploads
 * playlist. Throws "Channel not found" for both input forms — the MCP copies
 * used to silently proceed with an unresolved handle/ID and fail later with
 * an opaque Analytics error (the same drift #123 fixed in the CLI commands).
 */
async function lookupChannel(youtube: youtube_v3.Youtube, channel: string): Promise<ChannelInfo> {
  const parsed = parseChannelHandle(channel);
  debug('Parsed channel', parsed);

  const part = ['id', 'snippet', 'contentDetails'];
  const response = parsed.type === 'handle'
    ? await youtube.channels.list({ part, forHandle: parsed.value.replace('@', '') })
    : await youtube.channels.list({ part, id: [parsed.value] });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`Channel not found: ${channel}`);
  }

  const item = response.data.items[0];
  return {
    channelId: item.id || parsed.value,
    channelTitle: item.snippet?.title || '',
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || '',
  };
}

/**
 * The date YouTube aligned view counting across formats: a view counts from
 * the first frame of playback, with no minimum watch time (#178). Dates from
 * here onward are measured that way; earlier dates are not.
 */
export const VIEW_COUNTING_CHANGE_DATE = '2026-08-24';

/** Last date measured under the previous, stricter definition. */
const LAST_PRE_CHANGE_DATE = '2026-08-23';

export const VIEW_COUNTING_CHANGE_URL = 'https://support.google.com/youtube/answer/2991785';

/**
 * Metrics whose meaning depends on which side of the change a date falls.
 *
 * `views` is affected by definition. `redViews` is included because it counts
 * the same playback event, restricted to Premium members, so a change to what
 * counts as a view necessarily moves it too. That is an inference from the
 * announcement rather than a separately documented statement about `redViews`,
 * and it is the conservative direction: a notice on a series that turned out
 * to be stable is a smaller error than silence on one that moved.
 */
const VIEW_COUNTING_AFFECTED_METRICS = ['views', 'redViews'] as const;

/**
 * The same two affected fields, spelled the way the bulk Reporting API spells
 * them in a report's CSV header row (#177).
 *
 * Kept as a separate list rather than derived from the metric names, because
 * the Analytics/Reporting naming correspondence is YouTube's and is not
 * mechanical: `estimatedMinutesWatched` is `watch_time_minutes`, not
 * `estimated_minutes_watched`. Deriving it would be a guess that happens to
 * work for these two.
 */
const VIEW_COUNTING_AFFECTED_COLUMNS = ['views', 'red_views'] as const;

/**
 * Per-surface field naming, so one builder serves the Analytics API and the
 * bulk Reporting API without either hardcoding the other's spelling.
 */
interface ViewCountingVocabulary {
  /** Fields the change moved, in this surface's spelling. */
  affected: readonly string[];
  /** The field that keeps the stricter definition on both sides of the date. */
  stable: string;
}

const ANALYTICS_VOCABULARY: ViewCountingVocabulary = {
  affected: VIEW_COUNTING_AFFECTED_METRICS,
  stable: 'engagedViews',
};

const REPORTING_VOCABULARY: ViewCountingVocabulary = {
  affected: VIEW_COUNTING_AFFECTED_COLUMNS,
  stable: 'engaged_views',
};

export interface ViewCountingNotice {
  /** The change date, so callers do not hardcode it. */
  changeDate: string;
  /**
   * Fields in this result whose definition the change moved, named as the
   * surface that produced them names them: Analytics metrics (`views`,
   * `redViews`) from the Analytics API, CSV columns (`views`, `red_views`)
   * from a bulk report.
   */
  affectedMetrics: string[];
  /** The part of the requested range measured under the old definition. */
  affectedRange: { startDate: string; endDate: string };
  /** True when the range covers both definitions; false when entirely before. */
  spansChange: boolean;
  /** Human-readable text; the CLI prints this verbatim. */
  message: string;
  learnMoreUrl: string;
}

/**
 * Build the view-counting notice for a resolved query, or undefined when the
 * query is unaffected (#178).
 *
 * Two independent conditions have to hold, and both are about whether the
 * numbers actually returned can be misread:
 *
 * 1. The query selects a metric the change moved. `engagedViews` keeps the
 *    stricter definition on both sides of the date, so a query selecting only
 *    it is consistent end to end and gets nothing.
 * 2. The range reaches back before the change. A range starting on or after
 *    it is measured one way throughout, so there is nothing to warn about.
 *
 * Deliberately not limited to ranges that *straddle* the date. A range lying
 * entirely before it is internally consistent but is not comparable to data
 * pulled for later dates, which is the same trap one step removed, so it gets
 * a notice worded for that case instead.
 */
export function viewCountingNoticeFor(
  startDate: string,
  endDate: string,
  metrics: string,
): ViewCountingNotice | undefined {
  return buildViewCountingNotice(startDate, endDate, splitFields(metrics), ANALYTICS_VOCABULARY);
}

/**
 * Output formats the notice is written for. `json`, `csv` and `table` are what
 * scripts parse, and a prose note they cannot read is noise there.
 */
const NOTICE_OUTPUT_FORMATS = new Set(['pretty', 'text']);

/**
 * Write a view-counting notice for the human-facing output formats, and
 * report whether it was written.
 *
 * Extracted because five commands had reimplemented the same two conditions
 * (`get-video-analytics`, `get-channel-analytics`, `get-traffic-sources`,
 * `get-search-terms`, `get-channel-search-terms`). Five copies of a rule about
 * which stream carries what is five chances for one of them to drift onto
 * stdout and corrupt a piped result.
 *
 * `get-report-data` deliberately does NOT use this: it prints its notice for
 * every format, alongside its unconditional Incomplete Data warning. That is a
 * different rule, so it stays a separate call rather than a flag here.
 *
 * `stream` exists so tests can assert both the content and the routing without
 * capturing the real process streams. It defaults to stderr, never stdout,
 * because stdout carries the machine-readable output.
 */
export function emitViewCountingNotice(
  notice: ViewCountingNotice | undefined,
  outputFormat: string,
  stream: { write(chunk: string): unknown } = process.stderr,
): boolean {
  if (!notice) return false;
  if (!NOTICE_OUTPUT_FORMATS.has(outputFormat)) return false;
  stream.write(`${notice.message}\n`);
  return true;
}

/**
 * The same notice for a bulk Reporting API result, keyed on the report's CSV
 * columns instead of an Analytics metric list (#177).
 *
 * The bulk path needs this more than the Analytics path does, not less. A
 * report archive accumulates for months, so a single `get-report-data` call
 * routinely returns rows from both sides of the change merged into one result
 * set, and nothing in the CSV marks the boundary: the header row is identical
 * before and after, and `views` keeps its name while changing its meaning. A
 * consumer summing that column across the cutoff gets a number that is not a
 * count of anything.
 *
 * Note this cannot be detected by comparing report schemas. Measured against
 * a 3,683-report archive spanning 2026-01 to 2026-08, every report type that
 * carries `views` already carried `engaged_views` from the earliest archived
 * window onward, and no report type showed more than one column set. The
 * change is invisible in the schema and visible only in the dates.
 */
export function viewCountingNoticeForColumns(
  startDate: string,
  endDate: string,
  columns: readonly string[],
): ViewCountingNotice | undefined {
  return buildViewCountingNotice(startDate, endDate, columns, REPORTING_VOCABULARY);
}

function buildViewCountingNotice(
  startDate: string,
  endDate: string,
  selected: readonly string[],
  vocab: ViewCountingVocabulary,
): ViewCountingNotice | undefined {
  const affectedMetrics = vocab.affected.filter(m => selected.includes(m));
  if (affectedMetrics.length === 0) return undefined;

  // ISO dates compare correctly as strings; no parsing needed.
  if (startDate >= VIEW_COUNTING_CHANGE_DATE) return undefined;

  const spansChange = endDate >= VIEW_COUNTING_CHANGE_DATE;
  const affectedEnd = spansChange ? LAST_PRE_CHANGE_DATE : endDate;
  const names = affectedMetrics.join(', ');

  const message = spansChange
    ? `Note: ${names} changes definition inside this date range. ` +
      `${startDate} to ${affectedEnd} is counted under the previous definition; ` +
      `${VIEW_COUNTING_CHANGE_DATE} onward counts every playback from the first frame. ` +
      `Totals across the whole range mix the two. ` +
      `${vocab.stable} keeps the stricter definition throughout. ${VIEW_COUNTING_CHANGE_URL}`
    : `Note: ${names} for ${startDate} to ${affectedEnd} is counted under the definition ` +
      `used before ${VIEW_COUNTING_CHANGE_DATE}, so it is not comparable to ${names} for ` +
      `dates from ${VIEW_COUNTING_CHANGE_DATE} onward, which counts every playback from ` +
      `the first frame. ${vocab.stable} keeps the stricter definition throughout. ` +
      `${VIEW_COUNTING_CHANGE_URL}`;

  return {
    changeDate: VIEW_COUNTING_CHANGE_DATE,
    affectedMetrics: [...affectedMetrics],
    affectedRange: { startDate, endDate: affectedEnd },
    spansChange,
    message,
    learnMoreUrl: VIEW_COUNTING_CHANGE_URL,
  };
}

/**
 * Metrics a custom query is ranked by when the caller does not say, in
 * preference order (#179).
 *
 * `views` stays first so every query that sorted before this existed sorts
 * identically after it. `engagedViews` follows: it carries the pre-2026-08-24
 * view semantics, so a caller selecting it is asking the same question
 * `views` used to answer.
 * `estimatedMinutesWatched` is the fallback for metric sets that select no
 * view metric at all.
 */
export const SORTABLE_METRIC_PREFERENCE = ['views', 'engagedViews', 'estimatedMinutesWatched'] as const;

/** Split a comma-separated API field list into trimmed, non-empty entries. */
function splitFields(raw: string): string[] {
  return raw.split(',').map(f => f.trim()).filter(Boolean);
}

/**
 * Resolve the sort field for a custom dimensions+metrics query (#179).
 *
 * The API rejects a sort field absent from the query's own metrics and
 * dimensions, so the axis can only be chosen from what the caller selected.
 * The previous rule looked for the literal string `views` and fell through to
 * no sort at all otherwise, which left every other metric set in whatever
 * order the API happened to return (live-verified 2026-08-21: `--dimensions
 * day --metrics engagedViews` came back in raw date order, so a top-days
 * query was silently unranked).
 *
 * `explicit` is the caller's `--sort`. It is validated against the selected
 * fields, so an unsortable axis is named here rather than surfacing as the
 * API's opaque 400, but it is never second-guessed. Returns undefined only
 * when nothing rankable was selected and the caller named no axis, which is
 * the one case where the API's own row order stands.
 */
export function resolveCustomSort(
  dimensions: string,
  metrics: string,
  explicit?: string,
): string | undefined {
  const metricList = splitFields(metrics);

  if (explicit !== undefined) {
    const field = explicit.replace(/^-/, '').trim();
    if (field.length === 0) {
      throw new Error('--sort cannot be empty');
    }
    const selectable = [...splitFields(dimensions), ...metricList];
    if (!selectable.includes(field)) {
      throw new Error(
        `Invalid --sort value: "${field}". The Analytics API only sorts by a field the ` +
        `query itself selects. Available: ${selectable.join(', ')}.`,
      );
    }
    return explicit.trim();
  }

  const preferred = SORTABLE_METRIC_PREFERENCE.find(m => metricList.includes(m));
  return preferred ? `-${preferred}` : undefined;
}

export interface ChannelAnalyticsParams {
  /** Channel handle (@name) or ID (callers run requireChannel first). */
  channel: string;
  /** YYYY-MM-DD; defaults to 30 days ago (local). */
  startDate?: string;
  /** YYYY-MM-DD; defaults to today (local). */
  endDate?: string;
  /** Predefined report type; mutually exclusive with dimensions/metrics. */
  report?: string;
  /** Custom dimensions; requires metrics. */
  dimensions?: string;
  /** Custom metrics; requires dimensions. */
  metrics?: string;
  /**
   * Explicit sort field for a custom query, `-field` for descending. Only
   * valid alongside dimensions/metrics: predefined reports carry their own.
   */
  sort?: string;
  /** Progress hook — commands wire this to the spinner; MCP omits it. */
  onProgress?: (message: string) => void;
}

export interface ChannelAnalyticsResult {
  channelId: string;
  channelTitle: string;
  reportType: string;
  dateRange: { startDate: string; endDate: string };
  columnHeaders: { name?: string | null }[];
  rows: unknown[][];
  /** Set when the range reaches before the view-counting change (#178). */
  viewCountingNotice?: ViewCountingNotice;
}

/**
 * Channel-level Analytics query, either via a predefined report type or a
 * custom dimensions+metrics pair. Rejects the --report + --dimensions/--metrics
 * combination (#70) — a check the MCP copy never gained before consolidation.
 */
export async function fetchChannelAnalytics(params: ChannelAnalyticsParams): Promise<ChannelAnalyticsResult> {
  if (
    params.report !== undefined &&
    (params.dimensions !== undefined || params.metrics !== undefined)
  ) {
    throw new Error('Cannot combine --report with --dimensions or --metrics. Use one or the other.');
  }

  // Same reasoning as the check above: a predefined report already fixes its
  // own sort, so honoring --sort here would mean silently redefining the
  // report, and ignoring it would mean silently discarding the flag.
  if (params.report !== undefined && params.sort !== undefined) {
    throw new Error('Cannot combine --report with --sort. Predefined reports carry their own sort order.');
  }

  let dimensions: string;
  let metrics: string;
  let reportName: string;
  let sort: string | undefined;

  if (params.report) {
    const reportConfig = CHANNEL_REPORT_TYPES[params.report];
    if (!reportConfig) {
      throw new Error(`Unknown report type: ${params.report}`);
    }
    dimensions = reportConfig.dimensions;
    metrics = reportConfig.metrics;
    sort = reportConfig.sort;
    reportName = params.report;
  } else if (params.dimensions && params.metrics) {
    dimensions = params.dimensions;
    metrics = params.metrics;
    sort = resolveCustomSort(dimensions, metrics, params.sort);
    reportName = 'custom';
  } else {
    throw new Error(
      'Must specify either --report type or both --dimensions and --metrics\n' +
      'Predefined report types:\n' +
      '  demographics    - Audience age and gender\n' +
      '  devices         - Device and OS breakdown\n' +
      '  geography       - Top countries\n' +
      '  traffic-sources - Traffic source types\n' +
      '  subscription-status - Subscribed vs non-subscribed\n' +
      'Or use custom query:\n' +
      '  --dimensions "deviceType,operatingSystem" --metrics "views,estimatedMinutesWatched"'
    );
  }
  debug(`Report: ${reportName}, Dimensions: ${dimensions}, Metrics: ${metrics}`);

  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  params.onProgress?.('Resolving channel...');
  const { channelId, channelTitle } = await lookupChannel(youtube, params.channel);
  debug('Resolved channel ID:', channelId);

  // Default: last 30 days.
  const endDate = params.endDate || toLocalYmd(new Date());
  const startDate = params.startDate ||
    toLocalYmd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  validateDateRange(startDate, endDate);
  debug(`Date range: ${startDate} to ${endDate}`);

  params.onProgress?.('Fetching analytics data...');
  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    dimensions,
    metrics,
    sort,
  }), { label: 'reports.query(channel analytics)' });

  return {
    channelId,
    channelTitle,
    reportType: reportName,
    dateRange: { startDate, endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
    viewCountingNotice: viewCountingNoticeFor(startDate, endDate, metrics),
  };
}

/** This report type enforces a hard limit of 25 results. */
export const CHANNEL_SEARCH_TERMS_MAX_RESULTS = 25;

/** Maximum video IDs per Analytics API `video==` filter (documented limit). */
export const CHANNEL_SEARCH_TERMS_MAX_VIDEOS = 500;

// YouTube's documented Shorts threshold. Note: Shorts can be up to 60s of
// vertical video; videos at exactly 60s are accepted as Shorts, but we use
// `>= 60s` for the long-form bucket to match YouTube Studio's own bucketing.
const SHORTS_DURATION_LIMIT_SECONDS = 60;

// videos.list accepts at most 50 IDs per call
const VIDEOS_LIST_CHUNK_SIZE = 50;

export type ChannelContentType = 'all' | 'video' | 'shorts';

const CHANNEL_CONTENT_TYPES: ReadonlyArray<string> = ['all', 'video', 'shorts'];

/**
 * Validate a content-type value (defaulting to 'all'). Exported so the CLI
 * command can fail fast before spending any API quota.
 */
export function validateContentType(raw: string | undefined): ChannelContentType {
  const contentType = raw ?? 'all';
  if (!CHANNEL_CONTENT_TYPES.includes(contentType)) {
    throw new Error(`Invalid content type "${contentType}". Valid values: ${CHANNEL_CONTENT_TYPES.join(', ')}`);
  }
  return contentType as ChannelContentType;
}

/**
 * #88/#90: filter video IDs CLIENT-SIDE by duration. The YouTube Analytics
 * API does not accept `creatorContentType` as a filter for the
 * `insightTrafficSourceDetail` + `YT_SEARCH` report — verified live that it
 * returns `Invalid value (...) given in field parameters.filters` even with
 * the correct enum values (VIDEO_ON_DEMAND / SHORTS). The only way to scope
 * search traffic by content type for this report is to pre-trim the
 * `video==` list to Shorts (<60s) or long-form (>=60s).
 */
async function filterVideoIdsByDuration(
  youtube: youtube_v3.Youtube,
  videoIds: string[],
  contentType: ChannelContentType,
): Promise<string[]> {
  if (contentType === 'all') {
    return videoIds;
  }
  const wantShorts = contentType === 'shorts';

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
    throw new Error(
      `No ${wantShorts ? 'Shorts' : 'long-form videos'} found for this channel. ` +
      `Try a different --content-type value or omit the flag for all videos.`
    );
  }
  return filtered;
}

export interface ChannelSearchTermsParams {
  /** Channel handle (@name) or ID (callers run requireChannel first). */
  channel: string;
  /** YYYY-MM-DD; defaults to all-time (ALL_TIME_START_DATE). */
  startDate?: string;
  /** YYYY-MM-DD; defaults to today (local). */
  endDate?: string;
  /** Max results; the API caps this report type at 25. */
  limit?: number;
  /** 'all' | 'video' | 'shorts'; validated here (see #88/#90). */
  contentType?: string;
  /** Progress hook — commands wire this to the spinner; MCP omits it. */
  onProgress?: (message: string) => void;
}

export interface ChannelSearchTermsResult {
  channelId: string;
  channelTitle: string;
  contentType: ChannelContentType;
  /** Video count in the final `video==` filter (after content-type trimming). */
  videosAnalyzed: number;
  dateRange: { startDate: string; endDate: string };
  columnHeaders: { name?: string | null }[];
  rows: unknown[][];
  /**
   * Set when the range reaches back before the 2026-08-24 view-counting
   * change. `SEARCH_TERMS_METRICS` always sends `views`, so the caveat
   * applies to every row this returns.
   */
  viewCountingNotice?: ViewCountingNotice;
}

// Metrics for insightTrafficSourceDetail with insightTrafficSourceType==YT_SEARCH.
// videoThumbnailImpressions/CTR are only valid for discovery-type sources and
// cause a 400 when combined with YT_SEARCH, so they stay out.
//
// engagedViews added in #185, live-verified against this query shape. It
// matters here in particular: measured channel-wide over 2026-05-01..2026-08-25
// this report returned 189 views against 115 engagedViews, so ranking search
// terms by `views` alone overstates how much of that search traffic engaged.
const SEARCH_TERMS_METRICS = 'views,engagedViews,estimatedMinutesWatched';

/**
 * YouTube-search terms that led viewers to a channel's videos. The Analytics
 * API has no channel-wide aggregate for this report, so the uploads playlist
 * is walked (up to CHANNEL_SEARCH_TERMS_MAX_VIDEOS IDs, the per-call filter
 * limit) and passed as an explicit `video==` filter, optionally trimmed to
 * Shorts/long-form client-side (#88/#90).
 *
 * Deliberately a single query, not chunked: this is a top-N report
 * (maxResults ≤ 25) and merging truncated per-chunk top-25 lists would
 * produce incorrect rankings. All-time queries with the full uploads list
 * are live-verified to succeed; if a much larger channel ever trips an API
 * size limit, it fails loudly and the fix is a deliberate date-range cap,
 * not silent chunking.
 */
export async function fetchChannelSearchTerms(params: ChannelSearchTermsParams): Promise<ChannelSearchTermsResult> {
  const contentType = validateContentType(params.contentType);

  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

  params.onProgress?.('Resolving channel...');
  const { channelId, channelTitle, uploadsPlaylistId } = await lookupChannel(youtube, params.channel);
  debug('Resolved channel ID:', channelId);
  if (!uploadsPlaylistId) {
    throw new Error('Unable to find the uploads playlist for this channel.');
  }

  params.onProgress?.(`Fetching video list from ${channelTitle || channelId}...`);
  let videoIds: string[] = [];
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
  } while (nextPageToken && videoIds.length < CHANNEL_SEARCH_TERMS_MAX_VIDEOS);

  debug(`Collected ${videoIds.length} video IDs`);
  if (videoIds.length === 0) {
    throw new Error('No videos found for this channel.');
  }

  if (contentType !== 'all') {
    params.onProgress?.(`Fetching video durations (${contentType === 'shorts' ? 'Shorts' : 'long-form'} filter)...`);
    videoIds = await filterVideoIdsByDuration(youtube, videoIds, contentType);
  }

  const endDate = params.endDate || toLocalYmd(new Date());
  const startDate = params.startDate || ALL_TIME_START_DATE;
  validateDateRange(startDate, endDate);
  const limit = Math.min(params.limit || CHANNEL_SEARCH_TERMS_MAX_RESULTS, CHANNEL_SEARCH_TERMS_MAX_RESULTS);

  const filters = `video==${videoIds.join(',')};insightTrafficSourceType==YT_SEARCH`;
  debug('Video count in filter:', videoIds.length);
  debug(`Date range: ${startDate} to ${endDate}`);

  params.onProgress?.('Fetching channel search terms...');
  // Query the resolved channel (not MINE) so a mismatch between the requested
  // channel and the authenticated one fails loudly instead of silently
  // returning empty rows for the unowned video IDs (CodeRabbit on #151).
  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    metrics: SEARCH_TERMS_METRICS,
    dimensions: 'insightTrafficSourceDetail',
    filters,
    sort: '-views',
    maxResults: limit,
  }), { label: 'reports.query(channel search terms)' });

  return {
    channelId,
    channelTitle,
    contentType,
    videosAnalyzed: videoIds.length,
    dateRange: { startDate, endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
    viewCountingNotice: viewCountingNoticeFor(startDate, endDate, SEARCH_TERMS_METRICS),
  };
}
