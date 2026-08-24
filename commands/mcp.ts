import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import https from 'https';
import http from 'http';
import { rename, unlink, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  getChannelVideos,
  getVideoInfo,
  updateVideoMetadata,
  searchVideos,
  getVideoLocalization,
  getAllVideoLocalizations,
  putVideoLocalization,
  updateVideoLocalization,
} from '../lib/youtube';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, initCommand, toLocalYmd, validateDateOption } from '../lib/utils';
import { fetchVideoAnalytics, fetchTrafficSources, fetchSearchTerms, fetchVideoRetention, fetchChannelAnalytics, fetchChannelSearchTerms, ALL_TIME_START_DATE } from '../lib/analytics';
import { fetchReportTypes, fetchReportJobs, fetchReportData } from '../lib/reports';
import { requireChannel } from '../lib/config';
import { getVersion } from '../lib/version';

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'youtube_get_video',
    description: 'Get detailed metadata for one or more YouTube videos including title, description, statistics, duration, and more',
    inputSchema: {
      type: 'object',
      properties: {
        videoIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of YouTube video IDs (11 characters each, e.g., dQw4w9WgXcQ)',
          minItems: 1,
        },
      },
      required: ['videoIds'],
    },
  },
  {
    name: 'youtube_list_videos',
    description: 'List videos from a YouTube channel (returns up to 50 most recent videos)',
    inputSchema: {
      type: 'object',
      properties: {
        channelHandle: {
          type: 'string',
          description: 'Channel handle (e.g., @mkbhd) or channel ID',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of videos to return (default: 50)',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['channelHandle'],
    },
  },
  {
    name: 'youtube_search_videos',
    description: 'Search for videos on YouTube. Can search globally or within a specific channel.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        channelHandle: {
          type: 'string',
          description: 'Optional: Channel handle (e.g., @mkbhd) or channel ID to restrict search',
        },
        global: {
          type: 'boolean',
          description: 'Search all of YouTube (default: false, searches in config default channel)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results (default: 25)',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'youtube_update_video',
    description: 'Update a video\'s title and/or description',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        title: {
          type: 'string',
          description: 'New title for the video (optional)',
        },
        description: {
          type: 'string',
          description: 'New description for the video (optional)',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_localization',
    description: 'Get a specific language localization for a video (title and description in that language)',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., "es", "fr", "de") or human-readable name (e.g., "Spanish", "French"). If omitted, returns main metadata language.',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_all_localizations',
    description: 'Get all available localizations for a video (all languages with translations)',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        languageFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of language codes to filter results (e.g., ["es", "fr", "de"])',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_create_localization',
    description: 'Create a new localization for a video in a specific language. Fails if localization already exists.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., "es", "fr", "de") or human-readable name',
        },
        title: {
          type: 'string',
          description: 'Localized title',
        },
        description: {
          type: 'string',
          description: 'Localized description',
        },
      },
      required: ['videoId', 'language', 'title', 'description'],
    },
  },
  {
    name: 'youtube_update_localization',
    description: 'Update an existing localization for a video. Fails if localization doesn\'t exist.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        language: {
          type: 'string',
          description: 'Language code (e.g., "es", "fr", "de") or human-readable name',
        },
        title: {
          type: 'string',
          description: 'New localized title (optional, omit to keep existing)',
        },
        description: {
          type: 'string',
          description: 'New localized description (optional, omit to keep existing)',
        },
      },
      required: ['videoId', 'language'],
    },
  },
  {
    name: 'youtube_get_channel_analytics',
    description: 'Get channel-level analytics reports from YouTube Analytics API (demographics, devices, geography, traffic sources, subscription status, etc.). When the result carries `viewCountingNotice`, the requested range reaches back before the 2026-08-24 view-counting change, so the metrics named in its `affectedMetrics` (`views` and/or `redViews`) are not measured consistently across the range (or against later data); report that caveat rather than presenting a total as comparable. `engagedViews` keeps the stricter pre-change definition throughout.',
    inputSchema: {
      type: 'object',
      properties: {
        channelHandle: {
          type: 'string',
          description: 'Channel handle (e.g., @mkbhd) or channel ID',
        },
        report: {
          type: 'string',
          description: 'Predefined report type: demographics, devices, geography, traffic-sources, subscription-status',
          enum: ['demographics', 'devices', 'geography', 'traffic-sources', 'subscription-status'],
        },
        dimensions: {
          type: 'string',
          description: 'Custom dimensions (comma-separated, requires metrics)',
        },
        metrics: {
          type: 'string',
          description: 'Custom metrics (comma-separated, requires dimensions)',
        },
        sort: {
          type: 'string',
          description: 'Sort a custom query by one of its selected dimensions or metrics, "-field" for descending. Not valid with report. Defaults to the first of views, engagedViews, estimatedMinutesWatched present in metrics; a query selecting none of those is returned in the API\'s own order unless sort is given.',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (defaults to 30 days ago)',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (defaults to today)',
        },
      },
      required: [],
    },
  },
  {
    name: 'youtube_get_video_analytics',
    description: 'Get video performance analytics including views, watch time, average view duration, likes, comments, and more. When the result carries `viewCountingNotice`, the requested range reaches back before the 2026-08-24 view-counting change, so the metrics named in its `affectedMetrics` (`views` and/or `redViews`) are not measured consistently across the range (or against later data); report that caveat rather than presenting a total as comparable. `engagedViews` keeps the stricter pre-change definition throughout. Note the default start date is the video\'s upload date, so all-time queries on older videos always reach back past the change.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (defaults to video upload date)',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (defaults to today)',
        },
        metrics: {
          type: 'string',
          description: 'Comma-separated list of metrics (default: views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares). `views` counts every playback from the first frame; `engagedViews` applies the stricter pre-2026-08-24 definition and is the figure tied to monetization. On Shorts the two differ sharply (measured: 197 views against 8 engagedViews), so report the one the question calls for rather than assuming they agree. Both are accepted by every valid dimension.',
        },
        dimensions: {
          type: 'string',
          description: 'Comma-separated Analytics API dimensions to break results out by (default: video = aggregate). E.g. "day", "insightTrafficSourceType", "country,deviceType". See docs/dimension-compatibility.md for valid combinations.',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_search_terms',
    description: 'Get YouTube search terms that led viewers to this video (top 50 by default)',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of search terms to return (default: 50)',
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_channel_search_terms',
    description: 'Get top YouTube search keywords driving traffic to an entire channel (aggregated across all videos). Returns up to 25 terms due to API limit. Defaults to lifetime data.',
    inputSchema: {
      type: 'object',
      properties: {
        channelHandle: {
          type: 'string',
          description: 'Channel handle (e.g. @staqan) or channel ID. Uses default.channel config if omitted.',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format. Defaults to all-time (2005-02-14).',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to today.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of search terms to return (max 25, API restriction). Default: 25.',
          minimum: 1,
          maximum: 25,
        },
        contentType: {
          type: 'string',
          enum: ['all', 'video', 'shorts'],
          description: 'Filter by content type: all (default), video (non-shorts only), shorts (Shorts only).',
        },
      },
      required: [],
    },
  },
  {
    name: 'youtube_get_traffic_sources',
    description: 'Get traffic source breakdown showing where viewers came from (YouTube search, suggested videos, external websites, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_video_retention',
    description: 'Get audience retention data showing percentage of viewers at each point in the video',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_video_tags',
    description: 'Get all tags associated with a video',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_update_video_tags',
    description: 'Update video tags - can replace all tags, add new tags, or remove specific tags',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace all tags with this array (optional)',
        },
        addTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Add these tags to existing tags (optional)',
        },
        removeTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Remove these tags from existing tags (optional)',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_get_thumbnail',
    description: 'Get thumbnail URLs for a video in all available qualities (default, medium, high, standard, maxres)',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        quality: {
          type: 'string',
          description: 'Specific quality to return (optional): default, medium, high, standard, or maxres',
          enum: ['default', 'medium', 'high', 'standard', 'maxres'],
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_download_thumbnail',
    description: 'Download a video thumbnail as a JPEG image. Without filePath, returns the image inline; with filePath, saves to disk and returns the path.',
    inputSchema: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description: 'YouTube video ID (11 characters)',
        },
        quality: {
          type: 'string',
          description: 'Thumbnail size quality (default: maxres). Falls back to the next available quality if the requested one is not present.',
          enum: ['default', 'medium', 'high', 'standard', 'maxres'],
        },
        filePath: {
          type: 'string',
          description: 'Absolute path or path relative to cwd to save the JPEG to. Omit to receive the image inline.',
        },
      },
      required: ['videoId'],
    },
  },
  {
    name: 'youtube_list_report_types',
    description: 'List all available YouTube Reporting API report types (e.g., thumbnail CTR, demographics, traffic sources)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'youtube_list_report_jobs',
    description: 'List YouTube Reporting API jobs with status and expiration warnings',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Filter by report type ID (e.g., channel_reach_basic_a1)',
        },
      },
      required: [],
    },
  },
  {
    name: 'youtube_get_report_data',
    description: 'Get YouTube Reporting API report data including thumbnail impressions, CTR, and other metrics. IMPORTANT: Thumbnail CTR data is ONLY available through the Reporting API, not regular analytics. Check `uncoveredRanges` in the result before treating the rows as complete: `availableRange` is only an outer bound, and any dates listed there had no source data (expired from the API and never archived locally).',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Report type ID (e.g., channel_reach_basic_a1 for thumbnail CTR data)',
        },
        videoId: {
          type: 'string',
          description: 'Filter by video ID',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'youtube_fetch_reports',
    description: 'Download and cache all available YouTube Reporting API reports for archival. Prevents data loss when YouTube expires reports (30-60 days). Downloads only missing reports unless --force is used.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Fetch specific report type',
        },
        types: {
          type: 'string',
          description: 'Fetch multiple report types (comma-separated)',
        },
        startDate: {
          type: 'string',
          description: 'Filter by start date (YYYY-MM-DD)',
        },
        endDate: {
          type: 'string',
          description: 'Filter by end date (YYYY-MM-DD)',
        },
        force: {
          type: 'boolean',
          description: 'Re-download even if cached',
        },
        verify: {
          type: 'boolean',
          description: 'Verify cached file completeness',
        },
      },
      required: [],
    },
  },
];

// Tool handler
async function handleToolCall(name: string, args: any) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  switch (name) {
    case 'youtube_get_video': {
      const videos = await getVideoInfo(args.videoIds);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(videos, null, 2),
          },
        ],
      };
    }

    case 'youtube_list_videos': {
      const videos = await getChannelVideos(
        args.channelHandle,
        args.maxResults || 50
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(videos, null, 2),
          },
        ],
      };
    }

    case 'youtube_search_videos': {
      const { query, channelHandle, global, maxResults = 25 } = args;

      let resolvedChannel: string | undefined;
      if (global !== true) {
        resolvedChannel = channelHandle || await requireChannel(undefined);
      }
      const results = await searchVideos(query, { channelHandle: resolvedChannel, maxResults });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }

    case 'youtube_update_video': {
      const updates: { title?: string; description?: string } = {};
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;

      if (Object.keys(updates).length === 0) {
        throw new Error('At least one of title or description must be provided');
      }

      const result = await updateVideoMetadata(args.videoId, updates);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_localization': {
      const localization = await getVideoLocalization(
        args.videoId,
        args.language
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(localization, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_all_localizations': {
      const localizations = await getAllVideoLocalizations(
        args.videoId,
        args.languageFilter || null
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(localizations, null, 2),
          },
        ],
      };
    }

    case 'youtube_create_localization': {
      const result = await putVideoLocalization(
        args.videoId,
        args.language,
        args.title,
        args.description
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_update_localization': {
      const result = await updateVideoLocalization(
        args.videoId,
        args.language,
        args.title || null,
        args.description || null
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
    case 'youtube_get_channel_analytics': {
      // Shared data layer (lib/analytics.ts, #102). Consolidation also fixed
      // two drifts: unresolved channels now fail loudly (#123) and the
      // report + dimensions/metrics conflict is rejected (#70).
      if (args.startDate) validateDateOption('startDate', args.startDate);
      if (args.endDate) validateDateOption('endDate', args.endDate);

      const result = await fetchChannelAnalytics({
        channel: await requireChannel(args.channelHandle),
        startDate: args.startDate,
        endDate: args.endDate,
        report: args.report,
        dimensions: args.dimensions,
        metrics: args.metrics,
        sort: args.sort,
      });

      if (result.rows.length === 0) {
        // The notice describes the requested date range, not the rows, so it
        // still applies when nothing came back: a caller comparing this empty
        // result against pre-cutoff archived data needs the same caveat. The
        // CLI already emits its notice before its own empty-rows branch, and
        // dropping it here was the one place the two surfaces disagreed.
        const noData = 'No analytics data available for this channel and time period.';
        return {
          content: [
            {
              type: 'text',
              text: result.viewCountingNotice
                ? `${noData}\n\n${JSON.stringify({ viewCountingNotice: result.viewCountingNotice }, null, 2)}`
                : noData,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_video_analytics': {
      // Shared data layer (lib/analytics.ts, #102) — same code path as the
      // get-video-analytics CLI command, so features like --dimensions can't
      // drift between the two surfaces again.
      if (args.startDate) validateDateOption('startDate', args.startDate);
      if (args.endDate) validateDateOption('endDate', args.endDate);

      const result = await fetchVideoAnalytics({
        videoId: parseVideoId(args.videoId),
        startDate: args.startDate,
        endDate: args.endDate,
        metrics: args.metrics,
        dimensions: args.dimensions,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_search_terms': {
      // Shared data layer (lib/analytics.ts, #102). MCP keeps its all-time
      // default (the CLI command defaults to the last 30 days).
      const result = await fetchSearchTerms({
        videoId: parseVideoId(args.videoId),
        startDate: ALL_TIME_START_DATE,
        endDate: toLocalYmd(new Date()),
        limit: args.limit || 50,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_channel_search_terms': {
      // Shared data layer (lib/analytics.ts, #102) — carries the #88/#90
      // client-side Shorts duration filter exactly once.
      if (args.startDate) validateDateOption('startDate', args.startDate);
      if (args.endDate) validateDateOption('endDate', args.endDate);

      const result = await fetchChannelSearchTerms({
        channel: await requireChannel(args.channelHandle),
        startDate: args.startDate,
        endDate: args.endDate,
        limit: args.limit,
        contentType: args.contentType,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_traffic_sources': {
      // Shared data layer (lib/analytics.ts, #102). MCP keeps its all-time
      // default (the CLI command defaults to the last 30 days).
      const result = await fetchTrafficSources({
        videoId: parseVideoId(args.videoId),
        startDate: ALL_TIME_START_DATE,
        endDate: toLocalYmd(new Date()),
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_video_retention': {
      // Shared data layer (lib/analytics.ts, #102): single lifetime query
      // from the upload date; result now includes title/duration context.
      const result = await fetchVideoRetention({ videoId: parseVideoId(args.videoId) });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_video_tags': {
      const parsedId = parseVideoId(args.videoId);

      const response = await youtube.videos.list({
        part: ['snippet'],
        id: [parsedId],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${parsedId}`);
      }

      const video = response.data.items[0];
      const tags = video.snippet?.tags || [];
      const title = video.snippet?.title || 'Untitled';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ videoId: parsedId, title, tags }, null, 2),
          },
        ],
      };
    }

    case 'youtube_update_video_tags': {
      const parsedId = parseVideoId(args.videoId);

      // Fetch current video info
      const response = await youtube.videos.list({
        part: ['snippet'],
        id: [parsedId],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${parsedId}`);
      }

      const video = response.data.items[0];
      const currentTags = video.snippet?.tags || [];

      // Calculate new tags
      let newTags: string[] = [];

      if (args.tags) {
        // Replace all tags
        newTags = args.tags;
      } else {
        // Start with current tags
        newTags = [...currentTags];

        // Add tags
        if (args.addTags) {
          args.addTags.forEach((tag: string) => {
            if (!newTags.includes(tag)) {
              newTags.push(tag);
            }
          });
        }

        // Remove tags
        if (args.removeTags) {
          newTags = newTags.filter(tag => !args.removeTags.includes(tag));
        }
      }

      // Update video
      const snippet = video.snippet!;
      snippet.tags = newTags;

      const updateResponse = await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: parsedId,
          snippet,
        },
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              videoId: parsedId,
              previousTags: currentTags,
              newTags,
              result: updateResponse.data
            }, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_thumbnail': {
      const parsedId = parseVideoId(args.videoId);

      const response = await youtube.videos.list({
        part: ['snippet'],
        id: [parsedId],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Video not found: ${parsedId}`);
      }

      const video = response.data.items[0];
      const thumbnails = video.snippet?.thumbnails;
      const title = video.snippet?.title || 'Untitled';

      // If specific quality requested
      if (args.quality && thumbnails) {
        const quality = args.quality as 'default' | 'medium' | 'high' | 'standard' | 'maxres';
        const thumbnail = thumbnails[quality];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                videoId: parsedId,
                title,
                quality: args.quality,
                thumbnail,
              }, null, 2),
            },
          ],
        };
      }

      // Return all thumbnails
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ videoId: parsedId, title, thumbnails }, null, 2),
          },
        ],
      };
    }

    case 'youtube_download_thumbnail': {
      const QUALITY_ORDER = ['maxres', 'standard', 'high', 'medium', 'default'] as const;
      type ThumbQuality = typeof QUALITY_ORDER[number];

      const parsedId = parseVideoId(args.videoId);
      const requestedQualityInput = args.quality ?? 'maxres';
      if (!(QUALITY_ORDER as readonly string[]).includes(requestedQualityInput)) {
        throw new Error(`Invalid quality "${requestedQualityInput}". Valid values: ${QUALITY_ORDER.join(', ')}`);
      }
      const requestedQuality = requestedQualityInput as ThumbQuality;

      const thumbResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [parsedId],
      });

      if (!thumbResponse.data.items || thumbResponse.data.items.length === 0) {
        throw new Error(`Video not found: ${parsedId}`);
      }

      const thumbnails = thumbResponse.data.items[0].snippet?.thumbnails;
      if (!thumbnails) {
        throw new Error(`No thumbnail data for video: ${parsedId}`);
      }

      let resolvedQuality: ThumbQuality | null = null;
      let thumbnailUrl: string | null = null;

      if (thumbnails[requestedQuality]?.url) {
        resolvedQuality = requestedQuality;
        thumbnailUrl = thumbnails[requestedQuality]!.url!;
      } else {
        const startIdx = QUALITY_ORDER.indexOf(requestedQuality);
        for (let i = startIdx + 1; i < QUALITY_ORDER.length; i++) {
          const q = QUALITY_ORDER[i];
          if (thumbnails[q]?.url) {
            resolvedQuality = q;
            thumbnailUrl = thumbnails[q]!.url!;
            break;
          }
        }
      }

      if (!resolvedQuality || !thumbnailUrl) {
        throw new Error(`No thumbnail available for video: ${parsedId}`);
      }

      const imageBytes = await new Promise<Buffer>((resolve, reject) => {
        const parsedUrl = new URL(thumbnailUrl!);
        const transport = parsedUrl.protocol === 'https:' ? https : http;
        const req = transport.get(thumbnailUrl!, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        });
        req.setTimeout(30_000, () => {
          req.destroy(new Error('Thumbnail download timed out'));
        });
        req.on('error', reject);
      });

      if (args.filePath) {
        const dest = path.resolve(args.filePath);
        const tempDest = `${dest}.${randomUUID()}.tmp`;
        try {
          await writeFile(tempDest, imageBytes);
          await rename(tempDest, dest);
        } catch (err) {
          await unlink(tempDest).catch(() => {});
          throw err;
        }
        const note = resolvedQuality !== requestedQuality
          ? ` (requested "${requestedQuality}", used "${resolvedQuality}")`
          : '';
        return {
          content: [{ type: 'text', text: `Saved thumbnail to ${dest}${note}.` }],
        };
      }

      const note = resolvedQuality !== requestedQuality
        ? ` (requested "${requestedQuality}", used "${resolvedQuality}")`
        : '';
      return {
        content: [
          { type: 'text', text: `Thumbnail for ${parsedId} — quality: ${resolvedQuality}${note}` },
          { type: 'image', data: imageBytes.toString('base64'), mimeType: 'image/jpeg' },
        ],
      };
    }

    case 'youtube_list_report_types': {
      // Shared data layer (lib/reports.ts, #102 phase 4) — no more console
      // monkey-patching to scrape the command's formatted output.
      const reportTypes = await fetchReportTypes();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ reportTypes }, null, 2),
          },
        ],
      };
    }

    case 'youtube_list_report_jobs': {
      // Shared data layer (lib/reports.ts, #102 phase 4).
      const result = await fetchReportJobs({ type: args.type });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_report_data': {
      // Shared data layer (lib/reports.ts, #102 phase 4) — same cache-merging
      // pipeline as the get-report-data CLI command. The result carries the
      // status ('job-created' | 'no-reports-yet' | 'ok'), rows, and range
      // metadata instead of scraped CLI output.
      if (args.startDate) validateDateOption('startDate', args.startDate);
      if (args.endDate) validateDateOption('endDate', args.endDate);

      const result = await fetchReportData({
        type: args.type,
        videoId: args.videoId,
        startDate: args.startDate,
        endDate: args.endDate,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'youtube_fetch_reports': {
      // Deliberately still invokes the command with captured console output:
      // fetch-reports is interactive-heavy (per-report progress, verify mode)
      // and #132/#139 made command reuse survivable in-process. Decided in
      // the 2026-07-13 phase plan on #102 — extract only if it grows an
      // MCP-specific consumer that needs structured data.
      const fetchReportsCommand = require('./fetch-reports');
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;

      try {
        const logs: string[] = [];
        console.log = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        console.error = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

        await fetchReportsCommand({
          type: args.type,
          types: args.types,
          startDate: args.startDate,
          endDate: args.endDate,
          force: args.force,
          verify: args.verify,
          verbose: false,
        });

        console.log = originalConsoleLog;
        console.error = originalConsoleError;

        return {
          content: [
            {
              type: 'text',
              text: logs.join('\n'),
            },
          ],
        };
      } catch (err) {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        throw err;
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Main MCP command
async function mcpCommand(options: { verbose?: boolean } = {}): Promise<void> {
  initCommand(options);
  const server = new Server(
    {
      name: 'staqan-yt-mcp',
      version: getVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleToolCall(request.params.name, request.params.arguments);
    } catch (err) {
      const error = err as Error;
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server start to stderr (stdout is reserved for MCP protocol)
  console.error('staqan-yt MCP server started successfully');
}

export = mcpCommand;
