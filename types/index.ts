/**
 * Shared type definitions for staqan-yt-cli
 */

import { youtube_v3 } from 'googleapis';

// Video type enum
export type VideoType = 'short' | 'regular';

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
