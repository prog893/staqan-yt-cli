import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
import { parseVideoId, chunkDateRange, retryWithBackoff, initCommand } from '../lib/utils';
import { requireChannel } from '../lib/config';

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
    description: 'Get channel-level analytics reports from YouTube Analytics API (demographics, devices, geography, traffic sources, subscription status, etc.)',
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
    description: 'Get video performance analytics including views, watch time, average view duration, likes, comments, and more',
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
          description: 'Comma-separated list of metrics (default: views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares)',
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
    name: 'youtube_list_report_types',
    description: 'List all available YouTube Reporting API report types (e.g., thumbnail CTR, demographics, traffic sources)',
    inputSchema: {
      type: 'object',
      properties: {
        output: {
          type: 'string',
          description: 'Output format: json, table, or text',
          enum: ['json', 'table', 'text'],
        },
      },
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
        output: {
          type: 'string',
          description: 'Output format: json, table, or text',
          enum: ['json', 'table', 'text'],
        },
      },
      required: [],
    },
  },
  {
    name: 'youtube_get_report_data',
    description: 'Get YouTube Reporting API report data including thumbnail impressions, CTR, and other metrics. IMPORTANT: Thumbnail CTR data is ONLY available through the Reporting API, not regular analytics.',
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
        output: {
          type: 'string',
          description: 'Output format: json, csv, text, table, or pretty',
          enum: ['json', 'csv', 'text', 'table', 'pretty'],
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
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

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
      const auth = await getAuthenticatedClient();
      const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
      const youtube = google.youtube({ version: 'v3', auth });

      // Resolve channel ID
      const channelId = await requireChannel(args.channelHandle);

      const parsedChannel = channelId.startsWith('@')
        ? { type: 'handle', value: channelId }
        : { type: 'id', value: channelId };

      let actualChannelId = parsedChannel.value;

      // Resolve handle to ID if needed
      if (parsedChannel.type === 'handle') {
        const channelResponse = await youtube.channels.list({
          part: ['id'],
          forHandle: parsedChannel.value.replace('@', ''),
        });

        if (channelResponse.data.items && channelResponse.data.items.length > 0) {
          actualChannelId = channelResponse.data.items[0].id!;
        }
      }

      // Determine date range (default: last 30 days)
      const endDate = args.endDate || new Date().toISOString().split('T')[0];
      const startDate = args.startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Determine dimensions and metrics
      let dimensions: string;
      let metrics: string;

      if (args.report) {
        const REPORT_TYPES: Record<string, { dimensions: string; metrics: string }> = {
          demographics: { dimensions: 'ageGroup,gender', metrics: 'views,estimatedMinutesWatched' },
          devices: { dimensions: 'deviceType,operatingSystem', metrics: 'views,estimatedMinutesWatched' },
          geography: { dimensions: 'country', metrics: 'views,estimatedMinutesWatched' },
          'traffic-sources': { dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched' },
          'subscription-status': { dimensions: 'subscribedStatus', metrics: 'views,estimatedMinutesWatched' },
        };
        const reportConfig = REPORT_TYPES[args.report];
        if (!reportConfig) {
          throw new Error(`Unknown report type: ${args.report}`);
        }
        dimensions = reportConfig.dimensions;
        metrics = reportConfig.metrics;
      } else if (args.dimensions && args.metrics) {
        dimensions = args.dimensions;
        metrics = args.metrics;
      } else {
        throw new Error('Must specify either --report type or both --dimensions and --metrics');
      }

      // Fetch analytics
      const response = await youtubeAnalytics.reports.query({
        ids: `channel==${actualChannelId}`,
        startDate,
        endDate,
        dimensions,
        metrics,
        sort: '-views',
      });

      if (!response.data.rows || response.data.rows.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No analytics data available for this channel and time period.',
            },
          ],
        };
      }

      const columnHeaders = response.data.columnHeaders || [];
      const rows = response.data.rows || [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              channelId: actualChannelId,
              reportType: args.report || 'custom',
              dateRange: { startDate, endDate },
              columnHeaders: columnHeaders.map(h => h.name),
              rows,
            }, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_video_analytics': {
      const parsedId = parseVideoId(args.videoId);

      // Get video info for publish date
      const videoResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [parsedId],
      });

      if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
        throw new Error(`Video not found: ${parsedId}`);
      }

      const video = videoResponse.data.items[0];
      const publishedAt = video.snippet?.publishedAt;

      if (!publishedAt) {
        throw new Error('Video publish date is missing');
      }

      // Calculate date range
      const endDate = args.endDate || new Date().toISOString().split('T')[0];
      const startDate = args.startDate || publishedAt.split('T')[0];

      // Default metrics
      const metrics = args.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

      // Chunk date range into 90-day periods
      const dateChunks = chunkDateRange(startDate, endDate);

      // Fetch analytics for each chunk
      const allRows: unknown[][] = [];
      let columnHeaders: { name?: string | null }[] = [];

      for (let i = 0; i < dateChunks.length; i++) {
        const chunk = dateChunks[i];

        const analyticsResponse = await retryWithBackoff(async () => {
          return await youtubeAnalytics.reports.query({
            ids: 'channel==MINE',
            startDate: chunk.start,
            endDate: chunk.end,
            metrics,
            dimensions: 'video',
            filters: `video==${parsedId}`,
          });
        });

        // Save headers from first response
        if (i === 0 && analyticsResponse.data.columnHeaders) {
          columnHeaders = analyticsResponse.data.columnHeaders;
        }

        // Aggregate rows
        if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
          allRows.push(...analyticsResponse.data.rows);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ columnHeaders, rows: allRows }, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_search_terms': {
      const parsedId = parseVideoId(args.videoId);
      const limit = args.limit || 50;

      const analyticsResponse = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2000-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'views',
        dimensions: 'insightTrafficSourceDetail',
        filters: `video==${parsedId};insightTrafficSourceType==YT_SEARCH`,
        maxResults: limit,
        sort: '-views',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analyticsResponse.data, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_channel_search_terms': {
      // Resolve channel
      const channelArg = await requireChannel(args.channelHandle);

      // Resolve handle → uploads playlist ID
      let uploadsPlaylistId = '';
      if (channelArg.startsWith('@')) {
        const channelResponse = await youtube.channels.list({
          part: ['contentDetails'],
          forHandle: channelArg.replace('@', ''),
        });
        uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || '';
      } else {
        const channelResponse = await youtube.channels.list({
          part: ['contentDetails'],
          id: [channelArg],
        });
        uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || '';
      }

      if (!uploadsPlaylistId) {
        throw new Error(`Could not find uploads playlist for channel: ${channelArg}`);
      }

      // Collect up to 500 video IDs from the uploads playlist
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
      } while (nextPageToken && videoIds.length < 500);

      if (videoIds.length === 0) {
        throw new Error('No videos found for this channel.');
      }

      const endDate = args.endDate || new Date().toISOString().split('T')[0];
      const startDate = args.startDate || '2005-02-14';
      const limit = Math.min(args.limit || 25, 25);
      const CONTENT_TYPE_FILTERS: Record<string, string> = {
        video: 'creatorContentType==LONG_FORM_CONTENT',
        shorts: 'creatorContentType==SHORT_FORM_CONTENT',
      };
      const contentTypeFilter = args.contentType && args.contentType !== 'all'
        ? CONTENT_TYPE_FILTERS[args.contentType]
        : undefined;

      const videoFilter = `video==${videoIds.join(',')}`;
      const sourceFilter = 'insightTrafficSourceType==YT_SEARCH';
      const filters = contentTypeFilter
        ? `${videoFilter};${sourceFilter};${contentTypeFilter}`
        : `${videoFilter};${sourceFilter}`;

      const analyticsResponse = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'insightTrafficSourceDetail',
        filters,
        sort: '-views',
        maxResults: limit,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              channelHandle: channelArg,
              videosAnalyzed: videoIds.length,
              dateRange: { startDate, endDate },
              ...analyticsResponse.data,
            }, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_traffic_sources': {
      const parsedId = parseVideoId(args.videoId);

      const analyticsResponse = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2000-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'views',
        dimensions: 'insightTrafficSourceType',
        filters: `video==${parsedId}`,
        sort: '-views',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analyticsResponse.data, null, 2),
          },
        ],
      };
    }

    case 'youtube_get_video_retention': {
      const parsedId = parseVideoId(args.videoId);

      const analyticsResponse = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2000-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'audienceWatchRatio,relativeRetentionPerformance',
        dimensions: 'elapsedVideoTimeRatio',
        filters: `video==${parsedId}`,
        sort: 'elapsedVideoTimeRatio',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analyticsResponse.data, null, 2),
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

    case 'youtube_list_report_types': {
      const listReportTypesCommand = require('./list-report-types');
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;

      try {
        const logs: string[] = [];
        console.log = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        console.error = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

        await listReportTypesCommand({ output: args.output || 'table', verbose: false });

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

    case 'youtube_list_report_jobs': {
      const listReportJobsCommand = require('./list-report-jobs');
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;

      try {
        const logs: string[] = [];
        console.log = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        console.error = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

        await listReportJobsCommand({ type: args.type, output: args.output || 'table', verbose: false });

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

    case 'youtube_get_report_data': {
      const getReportDataCommand = require('./get-report-data');
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;

      try {
        const logs: string[] = [];
        console.log = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
        console.error = (...args: any[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));

        await getReportDataCommand({
          type: args.type,
          videoId: args.videoId,
          startDate: args.startDate,
          endDate: args.endDate,
          output: args.output || 'json',
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

    case 'youtube_fetch_reports': {
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
      version: '1.3.0',
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
