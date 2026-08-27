/**
 * Shared type definitions for staqan-yt-cli
 */

import { youtube_v3 } from 'googleapis';

// Video type enum
export type VideoType = 'short' | 'regular';

// Playlist-related types
export interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  itemCount: number;
  privacyStatus: PrivacyStatus;
  thumbnails: youtube_v3.Schema$ThumbnailDetails;
}

export interface PlaylistListItem {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  itemCount: number;
  // Required (not optional): playlists.list always returns status in the same
  // API response — no extra authenticated call needed, unlike VideoListItem.
  privacyStatus: PrivacyStatus;
}

// Comment-related types
export interface CommentInfo {
  id: string;
  videoId: string;
  authorName: string;
  authorChannelId: string;
  textDisplay: string;
  textOriginal: string;
  likeCount: number;
  replyCount: number;
  isReply: boolean;
  parentId: string | null;
  publishedAt: string;
  updatedAt: string;
}

// Video-related types
export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  tags: string[];
  categoryId: string;
  thumbnails: youtube_v3.Schema$ThumbnailDetails;
  statistics: VideoStatistics;
  duration: string;
  privacyStatus: PrivacyStatus;
  videoType: VideoType;
}

export interface VideoStatistics {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface VideoListItem {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  videoType: VideoType;
  channelTitle?: string;  // For global search results
  channelId?: string;     // For global search results
  // Optional: requires a separate authenticated videos.list call (see fetchPrivacyStatuses).
  // Contrast with PlaylistListItem where privacy is always present in the same response.
  privacyStatus?: PrivacyStatus;
}

// Localization types
export interface VideoLocalization {
  language: string;
  languageName: string;
  title: string;
  description: string;
  isMainLanguage: boolean;
}

export interface LanguageInfo {
  code: string;
  name: string;
  aliases: string[];
}

export interface LanguageMap {
  [key: string]: LanguageInfo;
}

// ID option types for commands (replacing positional arguments)
export interface VideoIdOption {
  videoId?: string;
}

export interface VideoIdsOption {
  videoIds?: string[];
}

export interface PlaylistIdOption {
  playlistId?: string;
}

export interface PlaylistIdsOption {
  playlistIds?: string[];
}

export interface CaptionIdOption {
  captionId?: string;
}

export interface QueryOption {
  query?: string;
}

// Command option types
export interface VerboseOption {
  verbose?: boolean;
}

export type OutputFormat = 'json' | 'table' | 'text' | 'pretty' | 'csv';

export interface OutputOption {
  output?: OutputFormat;
}

export interface LimitOption {
  limit?: string;
}

export interface TypeFilterOption {
  type?: 'short' | 'regular';
}

export type PrivacyStatus = 'public' | 'private' | 'unlisted';

export interface PrivacyFilterOption {
  privacy?: PrivacyStatus[];
}

export interface ChannelOption {
  channel?: string;
}

export interface UpdateVideoOptions extends VerboseOption, OutputOption {
  title?: string;
  description?: string;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalizationOptions extends VerboseOption, OutputOption, VideoIdOption {
  language?: string;
  languages?: string;
}

export interface PutLocalizationOptions extends VerboseOption, OutputOption, VideoIdOption {
  language: string;
  title: string;
  description: string;
}

export interface UpdateLocalizationOptions extends VerboseOption, OutputOption, VideoIdOption {
  language: string;
  title?: string;
  description?: string;
}

// Analytics command options
export interface AnalyticsOptions extends OutputOption, VerboseOption, VideoIdOption {
  startDate?: string;
  endDate?: string;
  metrics?: string;
  dimensions?: string;
}

export interface SearchTermsOptions extends OutputOption, VerboseOption, VideoIdOption {
  limit?: string;
}

export interface TrafficSourcesOptions extends OutputOption, VerboseOption, VideoIdOption {}

export interface RetentionOptions extends OutputOption, VerboseOption, VideoIdOption {}

// Tags command options
export interface GetTagsOptions extends OutputOption, VerboseOption, VideoIdOption {}

export interface UpdateTagsOptions extends VerboseOption, OutputOption, VideoIdOption {
  replace?: string;
  add?: string;
  remove?: string;
  dryRun?: boolean;
  yes?: boolean;
}

// Thumbnail command options
export interface GetThumbnailOptions extends OutputOption, VerboseOption, VideoIdOption {}

export interface UpdateThumbnailOptions extends VerboseOption {
  file: string;
  dryRun?: boolean;
  yes?: boolean;
}

export interface DownloadThumbnailOptions extends OutputOption, VerboseOption, VideoIdOption {
  quality?: string;
  path?: string;
}

// Comments command options
export interface ListCommentsOptions extends OutputOption, VerboseOption, LimitOption, VideoIdOption {
  sort?: 'top' | 'new';
}

// Search videos command options
export interface SearchVideosOptions extends OutputOption, LimitOption, VerboseOption {
  global?: boolean;
  channel?: string;
}

// OAuth types
export interface OAuth2Credentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export interface OAuth2Token {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope: string;
}

export interface ChannelInfo {
  id: string;
  title: string;
  description: string;
  customUrl: string | null;
  handle: string | null;
  publishedAt: string;
  country: string | null;
  statistics: {
    viewCount: number;
    subscriberCount: number;
    videoCount: number;
    hiddenSubscriberCount: boolean;
  };
  brandingSettings: {
    channel: {
      title: string;
      description: string;
      keywords: string;
      featuredChannelsUrls: string[];
    } | null;
  } | null;
  topicDetails: {
    topicCategories: string[];
    topicIds: string[];
  } | null;
}

// Caption-related types
export type CaptionTrackKind = 'manual' | 'automatic';

// Processing state of a caption track: `syncing` is still being timed against
// the audio, and `failed` means the upload was rejected (see `failureReason`).
// A track can exist and still show nothing on the video, so this is reported
// alongside the track.
//
// `serving` is necessary but NOT sufficient for the track to be visible: a
// draft track is also reported as `serving` (live-verified). Visibility is
// `status === 'serving' && !isDraft`.
export type CaptionTrackStatus = 'serving' | 'syncing' | 'failed' | 'unknown';

// Which audio track the captions belong to. `primary` is the main audio,
// `descriptive` is audio description, `commentary` is a commentary track.
export type CaptionAudioTrackType = 'unknown' | 'primary' | 'commentary' | 'descriptive';

// Formats the API converts to, passed straight through as `tfmt` on
// captions.download. Live-verified: these four return genuinely different
// bytes, and `scc` is rejected with HTTP 404 on every track type tried
// (manual, ASR, multiple languages), so it is not offered (issue #167).
export const CAPTION_TFMT_FORMATS = ['srt', 'vtt', 'sbv', 'ttml'] as const;
export type CaptionTfmtFormat = typeof CAPTION_TFMT_FORMATS[number];

// Values accepted by `get-caption --format`. `raw` omits `tfmt` entirely,
// which returns the track in whatever format it was uploaded in.
export const CAPTION_FORMATS = ['raw', 'srt', 'vtt', 'sbv', 'ttml'] as const;
export type CaptionFormat = typeof CAPTION_FORMATS[number];

// `json` was the previous default and never produced JSON: with `tfmt` never
// sent, it returned the track's original format. `tfmt=json` is in fact an
// HTTP 400. Kept as an alias for `raw` so existing scripts keep working
// rather than failing on a renamed default.
export const CAPTION_FORMAT_ALIASES: Record<string, CaptionFormat> = { json: 'raw' };

// File extensions accepted for caption uploads (put-caption). The API
// accepts any bytes and only fails during processing, so uploads are
// gated client-side to these subtitle formats YouTube documents.
export const CAPTION_UPLOAD_EXTENSIONS = ['.srt', '.sbv', '.vtt', '.ttml', '.dfxp', '.scc'] as const;

export interface CaptionInfo {
  id: string;
  videoId: string;
  language: string;
  /** Human-readable language name, falling back to the code when unmapped. */
  languageName: string;
  /** Track label set by the uploader. Empty for auto-generated tracks. */
  name: string;
  trackKind: CaptionTrackKind;
  isClosedCaptions: boolean;
  isLarge: boolean;
  isEasyReader: boolean;
  isAutoGenerated: boolean;
  /** Timing was machine-synced against the audio from an untimed transcript. */
  isAutoSynced: boolean;
  isDraft: boolean;
  status: CaptionTrackStatus;
  audioTrackType: CaptionAudioTrackType;
  /** Why processing failed. Only populated when status is `failed`. */
  failureReason: string | null;
  /** ISO 8601 timestamp of the last modification, or null if absent. */
  lastUpdated: string | null;
}

// Captions command options
export interface ListCaptionsOptions extends OutputOption, VerboseOption, VideoIdOption {}

export interface GetCaptionOptions extends OutputOption, VerboseOption, CaptionIdOption {
  download?: boolean;
  // Raw user input, narrowed to CaptionFormat by the command after alias
  // resolution. Typing this as CaptionFormat would claim commander validates
  // it, which it does not, and hides retired values like `scc` from the
  // client-side check.
  format?: string;
}

export interface PutCaptionOptions extends OutputOption, VerboseOption, VideoIdOption {
  language: string;
  file: string;
  name?: string;
  draft?: boolean;
  force?: boolean;
}

// Channel analytics command options
export interface ChannelAnalyticsOptions extends ChannelOption, OutputOption, VerboseOption {
  report?: 'demographics' | 'devices' | 'geography' | 'traffic-sources' | 'subscription-status';
  startDate?: string;
  endDate?: string;
  dimensions?: string;
  metrics?: string;
  sort?: string;
}

// Channel search terms command options
export interface ChannelSearchTermsOptions extends ChannelOption, OutputOption, VerboseOption, LimitOption {
  contentType?: 'all' | 'video' | 'shorts';
  startDate?: string;
  endDate?: string;
}

// Utility types
export interface ChannelHandle {
  type: 'handle' | 'id';
  value: string;
}

// Config types
export interface Config {
  default?: {
    channel?: string;
    output?: OutputFormat;
  };
  cache?: {
    enabled?: boolean;
    directory?: string;
    verifyOnLoad?: boolean;
  };
  lock?: {
    timeout?: number;  // Lock acquisition timeout in milliseconds (default: 60000)
  };
}

export type ConfigKey = 'default.channel' | 'default.output' | 'lock.timeout';

// Help text for each config key
export const CONFIG_KEY_HELP: Record<ConfigKey, string> = {
	'default.channel': 'Default channel handle or ID (e.g., @staqan)',
	'default.output': 'Default output format (json|table|text|pretty|csv)',
	'lock.timeout': 'Lock acquisition timeout in ms (default: 60000)',
};

// Derived from CONFIG_KEY_HELP so the two can never drift apart
export const CONFIG_KEYS = Object.keys(CONFIG_KEY_HELP) as ConfigKey[];

// Completion types
export type CompletionType = 'video-id' | 'playlist-id' | 'report-type';

export interface CompletionCacheEntry {
  items: Array<{ id: string; title: string }>;
  fetchedAt: number;
}

export type CompletionCache = Record<string, CompletionCacheEntry>;

// Cache-related types
export interface CacheIndexEntry {
  reportId: string;
  reportTypeId: string;
  channelId: string;          // Channel this report belongs to
  startTime: string;          // YYYY-MM-DD
  endTime: string;            // YYYY-MM-DD
  /**
   * Report createTime from the YouTube API (ISO 8601).
   *
   * YouTube reissues a report for the same window when it has corrected data,
   * so a window can have several reportIds and only the newest is valid. This
   * is the ordering key for that. Optional because entries written before it
   * was persisted do not carry it; see pickNewestPerWindow for the fallback.
   */
  createTime?: string;
  downloadedAt: string;       // ISO 8601 timestamp
  expiresAt: string;          // ISO 8601 timestamp
  fileSize: number;           // bytes
  row_count?: number;         // Optional: for verification
}

export interface CacheIndex {
  version: string;            // For future migrations
  lastUpdated: string;        // ISO 8601 timestamp
  entries: CacheIndexEntry[];
}

export interface ReportMetadata {
  reportId: string;
  reportTypeId: string;
  channelId: string;          // Channel this report belongs to
  startTime: string;          // From YouTube API
  endTime: string;            // From YouTube API
  createTime?: string;        // Report createTime from the API; orders reissues of the same window
  startTimeActual: string;    // Actual data range in CSV (parsed)
  endTimeActual: string;      // Actual data range in CSV (parsed)
  downloadedAt: string;       // ISO 8601 timestamp
  expiresAt: string;          // ISO 8601 timestamp
  columns: string[];          // CSV column names
  fileSize: number;
  row_count?: number;

  /**
   * The three fields below came from the API response at download time and
   * cannot be recovered from anything on disk. They are optional so that a
   * sidecar rebuilt by `rebuildReportMetadata` can leave them readably absent
   * rather than defaulted: a plausible-looking value here would turn a
   * detectable gap into an undetectable lie.
   *
   * Note `isComplete` in particular. Absent means "never recorded", which is
   * not the same as `false` ("recorded as incomplete"), and consumers must
   * test it with `=== false` rather than for falsiness.
   */
  jobId?: string;
  downloadUrl?: string;       // Original download URL
  isComplete?: boolean;       // Completeness flag

  /**
   * Set only on a sidecar reconstructed after the original was found damaged.
   * Its absence means the record came from the API response at download time.
   */
  rebuiltAt?: string;         // ISO 8601 timestamp
}

/**
 * What the local cache cannot supply for a requested date range.
 *
 * Deliberately reduced to this single field. The previous shape also carried
 * `fullyCovered` and `partiallyCovered`, both of which were removed:
 *
 *  - `fullyCovered` meant "this cached report lies entirely inside the request",
 *    which reads like the opposite of what it was. Driving the cache-load loop
 *    from it meant a request contained within one wider archived report matched
 *    nothing and returned zero rows.
 *  - `partiallyCovered.missing` produced inverted ranges (start after end) in
 *    exactly that containment case: a Jan 1-31 report against a Jan 10-20
 *    request yielded a "missing" range of 2026-02-01 to 2025-12-31.
 *
 * `missingRanges` comes straight from findDateGaps, which was already the only
 * correct source, so nothing of value was lost.
 */
export interface CacheCoverage {
  /** Sub-ranges of the request that no cached report covers. Empty when fully covered. */
  missingRanges: { start: string; end: string }[];
}

export interface ReportData {
  reportId: string;
  startTime: string;
  endTime: string;
  data: Record<string, string>[];
  source: 'cache' | 'api';
}

// Re-export googleapis types for convenience
export type { youtube_v3 } from 'googleapis';
