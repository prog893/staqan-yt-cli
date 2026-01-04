import { google, youtube_v3 } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { normalizeLanguage, getLanguageName } from './language';
import { VideoInfo, VideoListItem, VideoLocalization } from '../types';

/**
 * Get YouTube API client
 */
async function getYouTubeClient(): Promise<youtube_v3.Youtube> {
  const auth = await getAuthenticatedClient();
  return google.youtube({ version: 'v3', auth });
}

/**
 * Get channel ID from handle or username
 */
async function getChannelId(handleOrId: string): Promise<string> {
  const youtube = await getYouTubeClient();

  // If it starts with @, search by handle
  if (handleOrId.startsWith('@')) {
    // Try searching by handle using search endpoint
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: handleOrId,
      type: ['channel'],
      maxResults: 1,
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      return searchResponse.data.items[0].snippet!.channelId!;
    }

    throw new Error(`Channel not found: ${handleOrId}`);
  }

  // Try to get channel directly
  try {
    const response = await youtube.channels.list({
      part: ['id'],
      id: [handleOrId],
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id!;
    }
  } catch {
    // Continue to search
  }

  // Try searching by username
  const searchResponse = await youtube.search.list({
    part: ['snippet'],
    q: handleOrId,
    type: ['channel'],
    maxResults: 1,
  });

  if (searchResponse.data.items && searchResponse.data.items.length > 0) {
    return searchResponse.data.items[0].snippet!.channelId!;
  }

  throw new Error(`Channel not found: ${handleOrId}`);
}

/**
 * Get all videos from a channel
 */
async function getChannelVideos(channelHandle: string, maxResults = 50): Promise<VideoListItem[]> {
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(channelHandle);

  // Get uploads playlist ID
  const channelResponse = await youtube.channels.list({
    part: ['contentDetails'],
    id: [channelId],
  });

  if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
    throw new Error('Channel not found');
  }

  const uploadsPlaylistId = channelResponse.data.items[0].contentDetails!.relatedPlaylists!.uploads!;

  // Get videos from uploads playlist
  const videos: VideoListItem[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const playlistResponse: youtube_v3.Schema$PlaylistItemListResponse = (await youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, maxResults - videos.length),
      pageToken: nextPageToken,
    })).data;

    const items = playlistResponse.items || [];
    videos.push(...items.map((item: youtube_v3.Schema$PlaylistItem) => ({
      id: item.contentDetails!.videoId!,
      title: item.snippet!.title!,
      description: item.snippet!.description!,
      publishedAt: item.snippet!.publishedAt!,
      thumbnail: item.snippet!.thumbnails!.default!.url!,
    })));

    nextPageToken = playlistResponse.nextPageToken || undefined;
  } while (nextPageToken && videos.length < maxResults);

  return videos;
}

/**
 * Get detailed video information
 */
async function getVideoInfo(videoIds: string[]): Promise<VideoInfo[]> {
  const youtube = await getYouTubeClient();

  const response = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails', 'status'],
    id: videoIds,
  });

  const items = response.data.items || [];
  return items.map(item => ({
    id: item.id!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    channelTitle: item.snippet!.channelTitle!,
    publishedAt: item.snippet!.publishedAt!,
    tags: item.snippet!.tags || [],
    categoryId: item.snippet!.categoryId!,
    thumbnails: item.snippet!.thumbnails!,
    statistics: {
      viewCount: parseInt(item.statistics?.viewCount || '0'),
      likeCount: parseInt(item.statistics?.likeCount || '0'),
      commentCount: parseInt(item.statistics?.commentCount || '0'),
    },
    duration: item.contentDetails!.duration!,
    privacyStatus: item.status!.privacyStatus!,
  }));
}

/**
 * Update video metadata
 */
async function updateVideoMetadata(videoId: string, updates: { title?: string; description?: string }): Promise<youtube_v3.Schema$Video> {
  const youtube = await getYouTubeClient();

  // First get current video data
  const currentData = await youtube.videos.list({
    part: ['snippet'],
    id: [videoId],
  });

  if (!currentData.data.items || currentData.data.items.length === 0) {
    throw new Error('Video not found');
  }

  const snippet = currentData.data.items[0].snippet!;

  // Apply updates
  if (updates.title !== undefined) {
    snippet.title = updates.title;
  }
  if (updates.description !== undefined) {
    snippet.description = updates.description;
  }

  // Update video
  const response = await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet,
    },
  });

  return response.data;
}

/**
 * Search videos in a channel
 */
async function searchChannelVideos(channelHandle: string, query: string, maxResults = 25): Promise<VideoListItem[]> {
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(channelHandle);

  const response = await youtube.search.list({
    part: ['snippet'],
    channelId,
    q: query,
    type: ['video'],
    maxResults,
    order: 'date',
  });

  const items = response.data.items || [];
  return items.map(item => ({
    id: item.id!.videoId!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    publishedAt: item.snippet!.publishedAt!,
    thumbnail: item.snippet!.thumbnails!.default!.url!,
  }));
}

/**
 * Get video with localizations
 * @param videoId - YouTube video ID
 * @returns Video resource with snippet and localizations
 */
async function getVideoWithLocalizations(videoId: string): Promise<youtube_v3.Schema$Video> {
  const youtube = await getYouTubeClient();

  try {
    const response = await youtube.videos.list({
      part: ['snippet', 'localizations'],
      id: [videoId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Video not found: ${videoId}`);
    }

    return response.data.items[0];
  } catch (error) {
    throw new Error(`Failed to fetch video with localizations: ${(error as Error).message}`);
  }
}

/**
 * Get specific language localization (main metadata or localization)
 * @param videoId - YouTube video ID
 * @param language - Language code or human-readable name (optional, defaults to main metadata language)
 * @returns Object with language, languageName, title, description, isMainLanguage
 */
async function getVideoLocalization(videoId: string, language?: string): Promise<VideoLocalization> {
  const video = await getVideoWithLocalizations(videoId);

  // If no language specified, use the video's default language
  let langCode: string;
  if (!language) {
    langCode = video.snippet!.defaultLanguage || 'en';
    if (!video.snippet!.defaultLanguage) {
      console.warn('Warning: Video does not specify default language, assuming English (en)');
    }
  } else {
    const normalized = normalizeLanguage(language);
    if (!normalized) {
      throw new Error(`Invalid language: ${language}`);
    }
    langCode = normalized;
  }

  const defaultLanguage = video.snippet!.defaultLanguage || 'en';
  const isMainLanguage = langCode === defaultLanguage;

  if (isMainLanguage) {
    return {
      language: langCode,
      languageName: getLanguageName(langCode) || langCode,
      title: video.snippet!.title!,
      description: video.snippet!.description!,
      isMainLanguage: true,
    };
  }

  const localization = video.localizations?.[langCode];

  if (!localization) {
    throw new Error(`Localization not found for language: ${getLanguageName(langCode)} (${langCode})`);
  }

  return {
    language: langCode,
    languageName: getLanguageName(langCode) || langCode,
    title: localization.title!,
    description: localization.description!,
    isMainLanguage: false,
  };
}

/**
 * Get all video localizations (including main metadata language)
 * @param videoId - YouTube video ID
 * @param languageFilter - Optional array of language codes to filter
 * @returns Array of localization objects
 */
async function getAllVideoLocalizations(videoId: string, languageFilter: string[] | null = null): Promise<VideoLocalization[]> {
  const video = await getVideoWithLocalizations(videoId);
  const defaultLanguage = video.snippet!.defaultLanguage || 'en';
  const localizations: VideoLocalization[] = [];

  // Normalize filter if provided
  let filterCodes: string[] | null = null;
  if (languageFilter && languageFilter.length > 0) {
    filterCodes = languageFilter.map(lang => normalizeLanguage(lang)).filter((code): code is string => code !== null);
    if (filterCodes.length === 0) {
      throw new Error('No valid languages provided in filter');
    }
  }

  // Add main metadata language
  if (!filterCodes || filterCodes.includes(defaultLanguage)) {
    localizations.push({
      language: defaultLanguage,
      languageName: getLanguageName(defaultLanguage) || defaultLanguage,
      title: video.snippet!.title!,
      description: video.snippet!.description!,
      isMainLanguage: true,
    });
  }

  // Add localization entries (skip main language to avoid duplicates)
  if (video.localizations) {
    for (const [langCode, localization] of Object.entries(video.localizations)) {
      // Skip if this is the main metadata language
      if (langCode === defaultLanguage) {
        continue;
      }

      if (!filterCodes || filterCodes.includes(langCode)) {
        localizations.push({
          language: langCode,
          languageName: getLanguageName(langCode) || langCode,
          title: localization.title!,
          description: localization.description!,
          isMainLanguage: false,
        });
      }
    }
  }

  return localizations;
}

/**
 * Create new localization (fail if exists)
 * @param videoId - YouTube video ID
 * @param language - Language code or human-readable name
 * @param title - Localized title
 * @param description - Localized description
 * @returns Updated video resource
 */
async function putVideoLocalization(videoId: string, language: string, title: string, description: string): Promise<youtube_v3.Schema$Video> {
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  const defaultLanguage = video.snippet!.defaultLanguage || 'en';

  // Validation: Check main metadata has title/description (allow empty strings, but not null/undefined)
  if (video.snippet!.title == null || video.snippet!.description == null) {
    throw new Error('Cannot add localization: Main video metadata lacks title or description');
  }

  // Validation: Cannot create localization for main language
  if (langCode === defaultLanguage) {
    throw new Error(`Cannot create localization for main metadata language (${getLanguageName(langCode)}). Use update-video command instead.`);
  }

  // Validation: Check localization doesn't already exist
  if (video.localizations && video.localizations[langCode]) {
    throw new Error(`Localization already exists for ${getLanguageName(langCode)} (${langCode}). Use update-video-localization to modify.`);
  }

  // Build new localizations object
  const newLocalizations = video.localizations || {};
  newLocalizations[langCode] = { title, description };

  try {
    // Always update both snippet and localizations to ensure defaultLanguage is set
    const response = await youtube.videos.update({
      part: ['snippet', 'localizations'],
      requestBody: {
        id: videoId,
        snippet: {
          ...video.snippet,
          defaultLanguage: defaultLanguage,
          categoryId: video.snippet!.categoryId,
        },
        localizations: newLocalizations,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to create localization: ${(error as Error).message}`);
  }
}

/**
 * Update existing localization (fail if doesn't exist)
 * @param videoId - YouTube video ID
 * @param language - Language code or human-readable name
 * @param title - New title (null to keep existing)
 * @param description - New description (null to keep existing)
 * @returns Updated video resource
 */
async function updateVideoLocalization(videoId: string, language: string, title: string | null = null, description: string | null = null): Promise<youtube_v3.Schema$Video> {
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  const defaultLanguage = video.snippet!.defaultLanguage || 'en';

  // If updating main language, use snippet update
  if (langCode === defaultLanguage) {
    const updateData = {
      id: videoId,
      snippet: {
        ...video.snippet,
        title: title !== null ? title : video.snippet!.title,
        description: description !== null ? description : video.snippet!.description,
        categoryId: video.snippet!.categoryId,
      },
    };

    try {
      const response = await youtube.videos.update({
        part: ['snippet'],
        requestBody: updateData,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update main metadata: ${(error as Error).message}`);
    }
  }

  // Updating localization
  // Validation: Check localization exists
  if (!video.localizations || !video.localizations[langCode]) {
    throw new Error(`Localization not found for ${getLanguageName(langCode)} (${langCode}). Use put-video-localization to create.`);
  }

  const existingLocalization = video.localizations[langCode];
  const updatedLocalizations = { ...video.localizations };
  updatedLocalizations[langCode] = {
    title: title !== null ? title : existingLocalization.title!,
    description: description !== null ? description : existingLocalization.description!,
  };

  try {
    const response = await youtube.videos.update({
      part: ['localizations'],
      requestBody: {
        id: videoId,
        localizations: updatedLocalizations,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to update localization: ${(error as Error).message}`);
  }
}

export {
  getYouTubeClient,
  getChannelId,
  getChannelVideos,
  getVideoInfo,
  updateVideoMetadata,
  searchChannelVideos,
  getVideoWithLocalizations,
  getVideoLocalization,
  getAllVideoLocalizations,
  putVideoLocalization,
  updateVideoLocalization,
};
