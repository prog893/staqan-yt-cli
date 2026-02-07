import { google, youtube_v3 } from 'googleapis';
import { getAuthenticatedClient } from './auth';
import { normalizeLanguage, getLanguageName } from './language';
import { VideoInfo, VideoListItem, VideoLocalization, VideoType, PlaylistInfo, PlaylistListItem } from '../types';
import { debug } from './utils';

/**
 * Check if a video is a YouTube Short by checking if the shorts URL redirects
 * @param videoId - YouTube video ID
 * @returns true if the video is a Short, false otherwise
 */
async function checkIfShort(videoId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    // If status is 200, it's a Short (no redirect)
    // If status is 303 or 302, it redirects to /watch?v= (regular video)
    return response.status === 200;
  } catch {
    // On error, default to regular video
    return false;
  }
}

/**
 * Check video types for multiple videos in parallel
 * @param videoIds - Array of YouTube video IDs
 * @returns Map of video ID to VideoType
 */
async function checkVideoTypes(videoIds: string[]): Promise<Map<string, VideoType>> {
  const results = await Promise.all(
    videoIds.map(async (id) => {
      const isShort = await checkIfShort(id);
      return [id, isShort ? 'short' : 'regular'] as [string, VideoType];
    })
  );
  return new Map(results);
}

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
  debug(`Getting channel ID for: ${handleOrId}`);
  const youtube = await getYouTubeClient();

  // If it starts with @, search by handle
  if (handleOrId.startsWith('@')) {
    debug('Searching by handle using search endpoint');
    // Try searching by handle using search endpoint
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: handleOrId,
      type: ['channel'],
      maxResults: 1,
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      const channelId = searchResponse.data.items[0].snippet!.channelId!;
      debug(`Found channel ID: ${channelId}`);
      return channelId;
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

  // Get videos from uploads playlist (without videoType first)
  const rawVideos: Omit<VideoListItem, 'videoType'>[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const playlistResponse: youtube_v3.Schema$PlaylistItemListResponse = (await youtube.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, maxResults - rawVideos.length),
      pageToken: nextPageToken,
    })).data;

    const items = playlistResponse.items || [];
    rawVideos.push(...items.map((item: youtube_v3.Schema$PlaylistItem) => ({
      id: item.contentDetails!.videoId!,
      title: item.snippet!.title!,
      description: item.snippet!.description!,
      publishedAt: item.snippet!.publishedAt!,
      thumbnail: item.snippet!.thumbnails!.default!.url!,
    })));

    nextPageToken = playlistResponse.nextPageToken || undefined;
  } while (nextPageToken && rawVideos.length < maxResults);

  // Check video types for all videos
  const videoTypes = await checkVideoTypes(rawVideos.map(v => v.id));

  // Add videoType to each video
  return rawVideos.map(video => ({
    ...video,
    videoType: videoTypes.get(video.id) || 'regular',
  }));
}

/**
 * Get detailed video information
 */
async function getVideoInfo(videoIds: string[]): Promise<VideoInfo[]> {
  debug(`Fetching info for ${videoIds.length} video(s)`, videoIds);
  const youtube = await getYouTubeClient();

  // Fetch video details and video types in parallel
  const [response, videoTypes] = await Promise.all([
    youtube.videos.list({
      part: ['snippet', 'statistics', 'contentDetails', 'status'],
      id: videoIds,
    }),
    checkVideoTypes(videoIds),
  ]);

  const items = response.data.items || [];
  debug(`Retrieved ${items.length} video(s) from API`);
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
    videoType: videoTypes.get(item.id!) || 'regular',
  }));
}

/**
 * Update video metadata
 */
async function updateVideoMetadata(videoId: string, updates: { title?: string; description?: string }): Promise<youtube_v3.Schema$Video> {
  debug(`Updating metadata for video: ${videoId}`, updates);
  const youtube = await getYouTubeClient();

  // First get current video data
  debug('Fetching current video data');
  const currentData = await youtube.videos.list({
    part: ['snippet'],
    id: [videoId],
  });

  if (!currentData.data.items || currentData.data.items.length === 0) {
    throw new Error('Video not found');
  }

  const snippet = currentData.data.items[0].snippet!;
  debug('Current snippet retrieved');

  // Apply updates
  if (updates.title !== undefined) {
    debug(`Updating title: ${snippet.title} -> ${updates.title}`);
    snippet.title = updates.title;
  }
  if (updates.description !== undefined) {
    debug(`Updating description (${snippet.description?.length || 0} -> ${updates.description.length} chars)`);
    snippet.description = updates.description;
  }

  // Update video
  debug('Sending update request to YouTube API');
  const response = await youtube.videos.update({
    part: ['snippet'],
    requestBody: {
      id: videoId,
      snippet,
    },
  });

  debug('Video metadata updated successfully');
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
  const rawVideos = items.map(item => ({
    id: item.id!.videoId!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    publishedAt: item.snippet!.publishedAt!,
    thumbnail: item.snippet!.thumbnails!.default!.url!,
  }));

  // Check video types for all videos
  const videoTypes = await checkVideoTypes(rawVideos.map(v => v.id));

  return rawVideos.map(video => ({
    ...video,
    videoType: videoTypes.get(video.id) || 'regular',
  }));
}

/**
 * Get video with localizations
 * @param videoId - YouTube video ID
 * @returns Video resource with snippet and localizations
 */
async function getVideoWithLocalizations(videoId: string): Promise<youtube_v3.Schema$Video> {
  debug(`Fetching video with localizations: ${videoId}`);
  const youtube = await getYouTubeClient();

  try {
    const response = await youtube.videos.list({
      part: ['snippet', 'localizations'],
      id: [videoId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Video not found: ${videoId}`);
    }

    const video = response.data.items[0];
    const localizationCount = Object.keys(video.localizations || {}).length;
    debug(`Retrieved video with ${localizationCount} localization(s)`);
    return video;
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
  debug(`Creating new localization for video: ${videoId}, language: ${language}`);
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  debug(`Normalized language code: ${langCode}`);
  const defaultLanguage = video.snippet!.defaultLanguage || 'en';
  debug(`Video default language: ${defaultLanguage}`);

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

  debug('Validations passed, building localization object');
  // Build new localizations object
  const newLocalizations = video.localizations || {};
  newLocalizations[langCode] = { title, description };

  try {
    debug('Sending create localization request to YouTube API');
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

    debug('Localization created successfully');
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
  debug(`Updating localization for video: ${videoId}, language: ${language}`);
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  debug(`Normalized language code: ${langCode}`);
  const defaultLanguage = video.snippet!.defaultLanguage || 'en';
  debug(`Video default language: ${defaultLanguage}`);

  // If updating main language, use snippet update
  if (langCode === defaultLanguage) {
    debug('Updating main metadata language via snippet');
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
      debug('Sending main metadata update request to YouTube API');
      const response = await youtube.videos.update({
        part: ['snippet'],
        requestBody: updateData,
      });

      debug('Main metadata updated successfully');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update main metadata: ${(error as Error).message}`);
    }
  }

  // Updating localization
  debug('Updating localization (not main language)');
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
  debug('Built updated localizations object');

  try {
    debug('Sending localization update request to YouTube API');
    const response = await youtube.videos.update({
      part: ['localizations'],
      requestBody: {
        id: videoId,
        localizations: updatedLocalizations,
      },
    });

    debug('Localization updated successfully');
    return response.data;
  } catch (error) {
    throw new Error(`Failed to update localization: ${(error as Error).message}`);
  }
}

/**
 * Get detailed playlist information
 * @param playlistId - YouTube playlist ID
 * @returns Playlist details with full metadata
 */
async function getPlaylistInfo(playlistId: string): Promise<PlaylistInfo> {
  debug(`Fetching playlist info for: ${playlistId}`);
  const youtube = await getYouTubeClient();

  const response = await youtube.playlists.list({
    part: ['snippet', 'contentDetails', 'status'],
    id: [playlistId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  const item = response.data.items[0];
  debug(`Retrieved playlist: ${item.snippet?.title}`);

  return {
    id: item.id!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    channelId: item.snippet!.channelId!,
    channelTitle: item.snippet!.channelTitle!,
    publishedAt: item.snippet!.publishedAt!,
    itemCount: item.contentDetails!.itemCount || 0,
    privacyStatus: item.status!.privacyStatus!,
    thumbnails: item.snippet!.thumbnails!,
  };
}

/**
 * Get multiple playlists by ID (batch operation)
 * @param playlistIds - Array of YouTube playlist IDs
 * @returns Array of playlist details
 */
async function getPlaylistsById(playlistIds: string[]): Promise<PlaylistInfo[]> {
  debug(`Fetching info for ${playlistIds.length} playlist(s)`, playlistIds);
  const youtube = await getYouTubeClient();

  // YouTube API allows up to 50 IDs per request
  const results: PlaylistInfo[] = [];
  const batchSize = 50;

  for (let i = 0; i < playlistIds.length; i += batchSize) {
    const batch = playlistIds.slice(i, i + batchSize);
    debug(`Fetching batch ${Math.floor(i / batchSize) + 1}: ${batch.join(', ')}`);

    const response = await youtube.playlists.list({
      part: ['snippet', 'contentDetails', 'status'],
      id: batch,
    });

    const items = response.data.items || [];
    debug(`Retrieved ${items.length} playlist(s) from API`);

    results.push(...items.map((item: youtube_v3.Schema$Playlist) => ({
      id: item.id!,
      title: item.snippet!.title!,
      description: item.snippet!.description!,
      channelId: item.snippet!.channelId!,
      channelTitle: item.snippet!.channelTitle!,
      publishedAt: item.snippet!.publishedAt!,
      itemCount: item.contentDetails!.itemCount || 0,
      privacyStatus: item.status!.privacyStatus!,
      thumbnails: item.snippet!.thumbnails!,
    })));
  }

  return results;
}

/**
 * List all playlists for a channel
 * @param channelHandle - Channel handle or ID
 * @param maxResults - Maximum number of playlists to return
 * @returns Array of playlist list items (lighter weight than full info)
 */
async function listChannelPlaylists(channelHandle: string, maxResults = 50): Promise<PlaylistListItem[]> {
  debug(`Listing playlists for channel: ${channelHandle}, maxResults: ${maxResults}`);
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(channelHandle);

  const playlists: PlaylistListItem[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    debug(`Fetching page with token: ${nextPageToken || 'none'}`);
    const playlistResponse: youtube_v3.Schema$PlaylistListResponse = (await youtube.playlists.list({
      part: ['snippet', 'contentDetails', 'status'],
      channelId,
      maxResults: Math.min(50, maxResults - playlists.length),
      pageToken: nextPageToken,
    })).data;

    const items = playlistResponse.items || [];
    debug(`Retrieved ${items.length} playlist(s) from API`);

    playlists.push(...items.map((item: youtube_v3.Schema$Playlist) => ({
      id: item.id!,
      title: item.snippet!.title!,
      description: item.snippet!.description!,
      channelId: item.snippet!.channelId!,
      channelTitle: item.snippet!.channelTitle!,
      publishedAt: item.snippet!.publishedAt!,
      itemCount: item.contentDetails!.itemCount || 0,
      privacyStatus: item.status!.privacyStatus!,
    })));

    nextPageToken = playlistResponse.nextPageToken || undefined;
  } while (nextPageToken && playlists.length < maxResults);

  debug(`Total playlists retrieved: ${playlists.length}`);
  return playlists;
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
  getPlaylistInfo,
  getPlaylistsById,
  listChannelPlaylists,
};
