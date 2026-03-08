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
  privacyStatus: string;
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
  privacyStatus: string;
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
  privacyStatus: string;
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

export interface UpdateVideoOptions extends VerboseOption {
  title?: string;
  description?: string;
  dryRun?: boolean;
  yes?: boolean;
}

export interface LocalizationOptions extends VerboseOption, OutputOption {
  language?: string;
  languages?: string;
}

export interface PutLocalizationOptions extends VerboseOption {
  language: string;
  title: string;
  description: string;
}

export interface UpdateLocalizationOptions extends VerboseOption {
  language: string;
  title?: string;
  description?: string;
}

// Analytics command options
export interface AnalyticsOptions extends OutputOption, VerboseOption {
  startDate?: string;
  endDate?: string;
  metrics?: string;
}

export interface SearchTermsOptions extends OutputOption, VerboseOption {
  limit?: string;
}

export interface TrafficSourcesOptions extends OutputOption, VerboseOption {}

export interface RetentionOptions extends OutputOption, VerboseOption {}

// Tags command options
export interface GetTagsOptions extends OutputOption, VerboseOption {}

export interface UpdateTagsOptions extends VerboseOption {
  tags?: string;
  add?: string;
  remove?: string;
  dryRun?: boolean;
  yes?: boolean;
}

// Thumbnail command options
export interface GetThumbnailOptions extends OutputOption, VerboseOption {
  quality?: string;
}

export interface UpdateThumbnailOptions extends VerboseOption {
  file: string;
  dryRun?: boolean;
  yes?: boolean;
}

// Comments command options
export interface ListCommentsOptions extends OutputOption, VerboseOption, LimitOption {
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
export type CaptionTrackKind = 'standard' | 'ASR' | 'forced';

export type CaptionFormat = 'srt' | 'vtt' | 'sbv' | 'srv2' | 'ttml' | 'json';

export interface CaptionInfo {
  id: string;
  videoId: string;
  language: string;
  languageName: string;
  trackKind: CaptionTrackKind;
  isClosedCaptions: boolean;
  isLarge: boolean;
  isEasyReader: boolean;
  isAutoGenerated: boolean;
  isDraft: boolean;
}

// Captions command options
export interface ListCaptionsOptions extends OutputOption, VerboseOption {}

export interface GetCaptionOptions extends OutputOption, VerboseOption {
  download?: boolean;
  format?: CaptionFormat;
}

// Channel analytics command options
export interface ChannelAnalyticsOptions extends OutputOption, VerboseOption {
  report?: 'demographics' | 'devices' | 'geography' | 'traffic-sources' | 'subscription-status';
  startDate?: string;
  endDate?: string;
  dimensions?: string;
  metrics?: string;
}

// Channel search terms command options
export interface ChannelSearchTermsOptions extends OutputOption, VerboseOption, LimitOption {
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
}

export type ConfigKey = 'default.channel' | 'default.output';

// Completion types
export type CompletionType = 'video-id' | 'playlist-id' | 'report-type';

export interface CompletionCacheEntry {
  items: Array<{ id: string; title: string }>;
  fetchedAt: number;
}

export interface CompletionCache {
  [key: string]: CompletionCacheEntry;
}

// Cache-related types
export interface CacheIndexEntry {
  reportId: string;
  reportTypeId: string;
  startTime: string;          // YYYY-MM-DD
  endTime: string;            // YYYY-MM-DD
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
  jobId: string;
  startTime: string;          // From YouTube API
  endTime: string;            // From YouTube API
  startTimeActual: string;    // Actual data range in CSV (parsed)
  endTimeActual: string;      // Actual data range in CSV (parsed)
  downloadedAt: string;       // ISO 8601 timestamp
  expiresAt: string;          // ISO 8601 timestamp
  downloadUrl: string;        // Original download URL
  columns: string[];          // CSV column names
  isComplete: boolean;        // Completeness flag
  fileSize: number;
  row_count?: number;
}

export interface CacheCoverage {
  fullyCovered: string[];     // Date ranges fully in cache
  partiallyCovered: {         // Partial overlaps
    range: { start: string; end: string };
    cached: { start: string; end: string };
    missing: { start: string; end: string };
  }[];
  notCovered: string[];       // Date ranges not in cache
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
