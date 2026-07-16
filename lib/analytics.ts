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
 * Allowlist of Analytics API dimensions valid for video-level queries.
 * See https://developers.google.com/youtube/v3/docs/analytics_api/dimensions/dims
 * and docs/dimension-compatibility.md for the live-tested combination matrix.
 */
export const VIDEO_DIMENSIONS: ReadonlySet<string> = new Set([
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
export const INVALID_DIMENSION_COMBOS: ReadonlyArray<ReadonlyArray<string>> = [
  // creatorContentType is not a valid dimension for traffic-source detail reports
  // (see PR #90 — original issue: get-channel-search-terms #88).
  ['creatorContentType', 'insightTrafficSourceDetail'],
];

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

  return dims.join(',');
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
}

export const DEFAULT_VIDEO_METRICS =
  'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

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

  const metrics = params.metrics || DEFAULT_VIDEO_METRICS;
  const dimensions = validateVideoDimensions(params.dimensions ?? 'video');

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
    metrics: 'views',
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
    metrics: 'views',
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
 */
export const CHANNEL_REPORT_TYPES: Record<string, { dimensions: string; metrics: string }> = {
  demographics: {
    dimensions: 'ageGroup,gender',
    metrics: 'views,estimatedMinutesWatched',
  },
  devices: {
    dimensions: 'deviceType,operatingSystem',
    metrics: 'views,estimatedMinutesWatched',
  },
  geography: {
    dimensions: 'country',
    metrics: 'views,estimatedMinutesWatched',
  },
  'traffic-sources': {
    dimensions: 'insightTrafficSourceType',
    metrics: 'views,estimatedMinutesWatched',
  },
  'subscription-status': {
    dimensions: 'subscribedStatus',
    metrics: 'views,estimatedMinutesWatched',
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

  let dimensions: string;
  let metrics: string;
  let reportName: string;

  if (params.report) {
    const reportConfig = CHANNEL_REPORT_TYPES[params.report];
    if (!reportConfig) {
      throw new Error(`Unknown report type: ${params.report}`);
    }
    dimensions = reportConfig.dimensions;
    metrics = reportConfig.metrics;
    reportName = params.report;
  } else if (params.dimensions && params.metrics) {
    dimensions = params.dimensions;
    metrics = params.metrics;
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
    sort: '-views',
  }), { label: 'reports.query(channel analytics)' });

  return {
    channelId,
    channelTitle,
    reportType: reportName,
    dateRange: { startDate, endDate },
    columnHeaders: response.data.columnHeaders || [],
    rows: response.data.rows || [],
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
}

// Metrics for insightTrafficSourceDetail with insightTrafficSourceType==YT_SEARCH.
// videoThumbnailImpressions/CTR are only valid for discovery-type sources and
// cause a 400 when combined with YT_SEARCH. Keep only the two safe ones.
const SEARCH_TERMS_METRICS = 'views,estimatedMinutesWatched';

/**
 * YouTube-search terms that led viewers to a channel's videos. The Analytics
 * API has no channel-wide aggregate for this report, so the uploads playlist
 * is walked (up to CHANNEL_SEARCH_TERMS_MAX_VIDEOS IDs, the per-call filter
 * limit) and passed as an explicit `video==` filter, optionally trimmed to
 * Shorts/long-form client-side (#88/#90).
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
  const response = await withRateLimitRetry(() => youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
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
  };
}
