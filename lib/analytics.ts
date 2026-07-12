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
