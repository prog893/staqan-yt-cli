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
}

export type ConfigKey = 'default.channel' | 'default.output';

// Re-export googleapis types for convenience
export type { youtube_v3 } from 'googleapis';
