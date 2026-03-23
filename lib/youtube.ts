import { google, youtube_v3 } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { getAuthenticatedClient } from './auth';
import { normalizeLanguage, getLanguageName } from './language';
import { acquireLock, getLockPath } from './lock';
import { VideoInfo, VideoListItem, VideoLocalization, VideoType, PrivacyStatus, PlaylistInfo, PlaylistListItem, CommentInfo, ChannelInfo, CaptionInfo, CaptionFormat } from '../types';
import { debug, warning, CACHE_DIR } from './utils';

// ─── Handle → channel ID cache ────────────────────────────────────────────────

const HANDLE_CACHE_PATH = path.join(CACHE_DIR, 'handle-to-channel-id.json');

async function loadHandleCache(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(HANDLE_CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function saveHandleCache(cache: Record<string, string>): Promise<void> {
  const lockPath = getLockPath('handles');
  let release: (() => Promise<void>) | null = null;

  try {
    await fs.mkdir(path.dirname(HANDLE_CACHE_PATH), { recursive: true });
    // Acquire lock with 5 second timeout
    release = await acquireLock(lockPath, { timeout: 5000 });
    await fs.writeFile(HANDLE_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');

    debug('Handle cache saved');
  } catch (err) {
    warning(`Cache save failed (handle cache): ${(err as Error).message} — data will be re-fetched on next run`);
  } finally {
    if (release) await release();
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

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
    // On network error, default to regular video (non-blocking)
    debug(`checkIfShort failed for ${videoId}, defaulting to regular`);
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
 * Get authenticated YouTube API client
 */
async function getYouTubeClient(): Promise<youtube_v3.Youtube> {
  const auth = await getAuthenticatedClient();
  return google.youtube({ version: 'v3', auth });
}

// ─── Channels ─────────────────────────────────────────────────────────────────

/**
 * Get channel ID from handle or username.
 * Short-circuits if input is already a channel ID (UC + 22 chars).
 * Caches resolved handle → ID mappings on disk to avoid repeat API calls.
 */
async function getChannelId(handleOrId: string): Promise<string> {
  // Short-circuit: already a channel ID — no API call needed
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(handleOrId)) {
    debug(`Channel ID detected directly: ${handleOrId}`);
    return handleOrId;
  }

  // Check FS handle cache before touching the API
  const handleCache = await loadHandleCache();
  if (handleCache[handleOrId]) {
    debug(`Channel ID cache hit for: ${handleOrId} → ${handleCache[handleOrId]}`);
    return handleCache[handleOrId];
  }

  debug(`Resolving channel ID for: ${handleOrId}`);
  const youtube = await getYouTubeClient();
  let channelId: string | null = null;

  // If it starts with @, search by handle
  if (handleOrId.startsWith('@')) {
    debug('Searching by handle using search endpoint');
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      q: handleOrId,
      type: ['channel'],
      maxResults: 1,
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      channelId = searchResponse.data.items[0].snippet!.channelId!;
      debug(`Found channel ID: ${channelId}`);
    }
  } else {
    // Try to get channel directly by ID
    try {
      const response = await youtube.channels.list({
        part: ['id'],
        id: [handleOrId],
      });

      if (response.data.items && response.data.items.length > 0) {
        channelId = response.data.items[0].id!;
      }
    } catch {
      // Continue to search
    }

    // Fall back to username search
    if (!channelId) {
      const searchResponse = await youtube.search.list({
        part: ['snippet'],
        q: handleOrId,
        type: ['channel'],
        maxResults: 1,
      });

      if (searchResponse.data.items && searchResponse.data.items.length > 0) {
        channelId = searchResponse.data.items[0].snippet!.channelId!;
      }
    }
  }

  if (!channelId) {
    throw new Error(`Channel not found: ${handleOrId}`);
  }

  // Persist to FS cache so future calls skip the API
  handleCache[handleOrId] = channelId;
  await saveHandleCache(handleCache);

  return channelId;
}

/**
 * Get detailed channel information
 * @param handleOrId - Channel handle, ID, or URL
 * @returns Channel details with full metadata
 */
async function getChannelInfo(handleOrId: string): Promise<ChannelInfo> {
  debug(`Fetching channel info for: ${handleOrId}`);
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(handleOrId);

  const response = await youtube.channels.list({
    part: ['snippet', 'statistics', 'brandingSettings', 'topicDetails'],
    id: [channelId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`Channel not found: ${handleOrId}`);
  }

  const item = response.data.items[0];
  debug(`Retrieved channel: ${item.snippet?.title}`);

  return {
    id: item.id!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    customUrl: item.snippet!.customUrl || null,
    handle: item.snippet!.customUrl || null,
    publishedAt: item.snippet!.publishedAt!,
    country: item.snippet!.country || null,
    statistics: {
      viewCount: parseInt(item.statistics?.viewCount || '0'),
      subscriberCount: parseInt(item.statistics?.subscriberCount || '0'),
      videoCount: parseInt(item.statistics?.videoCount || '0'),
      hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount || false,
    },
    brandingSettings: item.brandingSettings ? {
      channel: item.brandingSettings.channel ? {
        title: item.brandingSettings.channel.title || '',
        description: item.brandingSettings.channel.description || '',
        keywords: item.brandingSettings.channel.keywords || '',
        featuredChannelsUrls: item.brandingSettings.channel.featuredChannelsUrls || [],
      } : null,
    } : null,
    topicDetails: item.topicDetails ? {
      topicCategories: item.topicDetails.topicCategories || [],
      topicIds: item.topicDetails.topicIds || [],
    } : null,
  };
}

/**
 * Batch-fetch privacy statuses for a list of video IDs (50 per API call).
 */
async function fetchPrivacyStatuses(videoIds: string[]): Promise<Map<string, PrivacyStatus>> {
  if (videoIds.length === 0) return new Map();
  const youtube = await getYouTubeClient();
  const result = new Map<string, PrivacyStatus>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const response = await youtube.videos.list({ part: ['status'], id: batch });
    for (const item of response.data.items || []) {
      if (item.id && item.status?.privacyStatus) {
        result.set(item.id, item.status.privacyStatus as PrivacyStatus);
      }
    }
  }
  return result;
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

  const ids = rawVideos.map(v => v.id);

  // Fetch video types and privacy statuses in parallel
  const [videoTypes, privacyStatuses] = await Promise.all([
    checkVideoTypes(ids),
    fetchPrivacyStatuses(ids),
  ]);

  return rawVideos.map(video => ({
    ...video,
    videoType: videoTypes.get(video.id) || 'regular',
    privacyStatus: privacyStatuses.get(video.id),
  }));
}

// ─── Videos ───────────────────────────────────────────────────────────────────

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
    privacyStatus: item.status!.privacyStatus! as PrivacyStatus,
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
 * Search videos — optionally scoped to a channel.
 * @param query - Search query string
 * @param options.channelHandle - Restrict to this channel (handle or ID); omit for global search
 * @param options.maxResults - Maximum number of results (default: 25)
 * @returns Array of video list items with channel info
 */
async function searchVideos(
  query: string,
  options: { channelHandle?: string; maxResults?: number } = {}
): Promise<VideoListItem[]> {
  const { channelHandle, maxResults = 25 } = options;
  debug(`Search: query="${query}", channel=${channelHandle ?? 'global'}, maxResults=${maxResults}`);
  const youtube = await getYouTubeClient();

  const channelId = channelHandle ? await getChannelId(channelHandle) : undefined;

  const response = await youtube.search.list({
    part: ['snippet'],
    ...(channelId ? { channelId } : {}),
    q: query,
    type: ['video'],
    maxResults,
    order: channelId ? 'date' : 'relevance',
  });

  const items = response.data.items || [];
  const rawVideos = items.map(item => ({
    id: item.id!.videoId!,
    title: item.snippet!.title!,
    description: item.snippet!.description!,
    publishedAt: item.snippet!.publishedAt!,
    thumbnail: item.snippet!.thumbnails!.default!.url!,
    channelTitle: item.snippet!.channelTitle!,
    channelId: item.snippet!.channelId!,
  }));

  const videoTypes = await checkVideoTypes(rawVideos.map(v => v.id));

  return rawVideos.map(video => ({
    ...video,
    videoType: videoTypes.get(video.id) || 'regular',
  }));
}

// ─── Localizations ────────────────────────────────────────────────────────────

/**
 * Get video with localizations
 * @param videoId - YouTube video ID
 * @returns Video resource with snippet and localizations
 */
async function getVideoWithLocalizations(videoId: string): Promise<youtube_v3.Schema$Video> {
  debug(`Fetching video with localizations: ${videoId}`);
  const youtube = await getYouTubeClient();

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
      warning('Video does not specify default language, assuming English (en)');
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

    debug('Sending main metadata update request to YouTube API');
    const response = await youtube.videos.update({
      part: ['snippet'],
      requestBody: updateData,
    });

    debug('Main metadata updated successfully');
    return response.data;
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
}

// ─── Playlists ────────────────────────────────────────────────────────────────

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
    privacyStatus: item.status!.privacyStatus! as PrivacyStatus,
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
      privacyStatus: item.status!.privacyStatus! as PrivacyStatus,
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
      privacyStatus: item.status!.privacyStatus! as PrivacyStatus,
    })));

    nextPageToken = playlistResponse.nextPageToken || undefined;
  } while (nextPageToken && playlists.length < maxResults);

  debug(`Total playlists retrieved: ${playlists.length}`);
  return playlists;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * List comments for a video
 * @param videoId - YouTube video ID
 * @param maxResults - Maximum number of comments to return
 * @param order - Sort order: 'relevance' (top) or 'time' (newest first)
 * @returns Array of comment info
 */
async function listVideoComments(videoId: string, maxResults = 20, order: 'relevance' | 'time' = 'relevance'): Promise<CommentInfo[]> {
  debug(`Listing comments for video: ${videoId}, maxResults: ${maxResults}, order: ${order}`);
  const youtube = await getYouTubeClient();

  const comments: CommentInfo[] = [];
  let nextPageToken: string | undefined = undefined;

  do {
    debug(`Fetching comment thread page with token: ${nextPageToken || 'none'}`);
    const response: youtube_v3.Schema$CommentThreadListResponse = (await youtube.commentThreads.list({
      part: ['snippet'],
      videoId,
      maxResults: Math.min(100, maxResults - comments.length),
      order,
      pageToken: nextPageToken,
    })).data;

    const items = response.items || [];
    debug(`Retrieved ${items.length} comment thread(s) from API`);

    // Extract top-level comments from threads
    comments.push(...items.map((item: youtube_v3.Schema$CommentThread) => {
      const topLevelComment = item.snippet!.topLevelComment!;
      const snippet = topLevelComment.snippet!;

      return {
        id: topLevelComment.id!,
        videoId: snippet.videoId!,
        authorName: snippet.authorDisplayName!,
        authorChannelId: snippet.authorChannelId!.value!,
        textDisplay: snippet.textDisplay || '',
        textOriginal: snippet.textOriginal || '',
        likeCount: snippet.likeCount || 0,
        replyCount: item.snippet!.totalReplyCount || 0,
        isReply: false,
        parentId: null,
        publishedAt: snippet.publishedAt!,
        updatedAt: snippet.updatedAt!,
      };
    }));

    nextPageToken = response.nextPageToken || undefined;
  } while (nextPageToken && comments.length < maxResults);

  debug(`Total comments retrieved: ${comments.length}`);
  return comments;
}

// ─── Captions ─────────────────────────────────────────────────────────────────

/**
 * List all captions for a video
 * @param videoId - YouTube video ID
 * @returns Array of caption info
 */
async function listCaptions(videoId: string): Promise<CaptionInfo[]> {
  debug(`Listing captions for video: ${videoId}`);
  const youtube = await getYouTubeClient();

  const response = await youtube.captions.list({
    part: ['snippet'],
    videoId,
  });

  const items = response.data.items || [];
  debug(`Retrieved ${items.length} caption track(s)`);

  return items.map((item: youtube_v3.Schema$Caption) => {
    const snippet = item.snippet!;
    return {
      id: item.id!,
      videoId: snippet.videoId!,
      language: snippet.language || 'unknown',
      languageName: snippet.language || 'unknown',
      trackKind: (snippet.trackKind === 'ASR' || snippet.trackKind === 'forced' || snippet.trackKind === 'standard')
        ? snippet.trackKind
        : 'standard',
      isClosedCaptions: false,
      isLarge: false,
      isEasyReader: false,
      isAutoGenerated: snippet.audioTrackType === 'unknown' || snippet.trackKind === 'ASR',
      isDraft: false,
    };
  });
}

/**
 * Download caption content
 * @param captionId - Caption track ID
 * @param format - Output format (srt, vtt, sbv, srv2, ttml, or json for raw)
 * @returns Caption content as string
 */
async function downloadCaption(captionId: string, format: CaptionFormat = 'json'): Promise<string> {
  debug(`Downloading caption: ${captionId}, format: ${format}`);
  const youtube = await getYouTubeClient();

  // YouTube API downloads caption content
  // The download endpoint returns the caption content
  const response = await youtube.captions.download({
    id: captionId,
  });

  // The response is the actual caption content
  const content = response.data as string;

  // If format is json, just return the raw content
  if (format === 'json') {
    return content;
  }

  // For other formats, YouTube returns the format that was uploaded
  // The user would need to convert if needed
  return content;
}

export {
  getYouTubeClient,
  getChannelId,
  getChannelInfo,
  getChannelVideos,
  getVideoInfo,
  updateVideoMetadata,
  searchVideos,
  getVideoWithLocalizations,
  getVideoLocalization,
  getAllVideoLocalizations,
  putVideoLocalization,
  updateVideoLocalization,
  getPlaylistInfo,
  getPlaylistsById,
  listChannelPlaylists,
  listVideoComments,
  listCaptions,
  downloadCaption,
};
