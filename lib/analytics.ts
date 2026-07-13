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

import { google } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { chunkDateRange, debug, toLocalYmd, validateDateRange, withRateLimitRetry } from './utils';

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

interface VideoSnippetInfo {
  title: string;
  publishedAt: string;
  duration: string;
}

/** Shared lookup: title/publishedAt/duration for display and date defaulting. */
async function lookupVideoSnippet(videoId: string): Promise<VideoSnippetInfo> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
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
  const { title } = await lookupVideoSnippet(params.videoId);
  const auth = await getAuthenticatedClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

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
  const { title } = await lookupVideoSnippet(params.videoId);
  const auth = await getAuthenticatedClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

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
  const { title, publishedAt, duration } = await lookupVideoSnippet(params.videoId);
  const auth = await getAuthenticatedClient();
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

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
