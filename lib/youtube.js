const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./auth');
const { normalizeLanguage, getLanguageName } = require('./language');

/**
 * Get YouTube API client
 */
async function getYouTubeClient() {
  const auth = await getAuthenticatedClient();
  return google.youtube({ version: 'v3', auth });
}

/**
 * Get channel ID from handle or username
 */
async function getChannelId(handleOrId) {
  const youtube = await getYouTubeClient();

  // If it starts with @, search by handle
  if (handleOrId.startsWith('@')) {
    const handle = handleOrId.substring(1);

    // Try searching by handle using search endpoint
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: handleOrId,
      type: 'channel',
      maxResults: 1,
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      return searchResponse.data.items[0].snippet.channelId;
    }

    throw new Error(`Channel not found: ${handleOrId}`);
  }

  // Try to get channel directly
  try {
    const response = await youtube.channels.list({
      part: 'id',
      id: handleOrId,
    });

    if (response.data.items && response.data.items.length > 0) {
      return response.data.items[0].id;
    }
  } catch (err) {
    // Continue to search
  }

  // Try searching by username
  const searchResponse = await youtube.search.list({
    part: 'snippet',
    q: handleOrId,
    type: 'channel',
    maxResults: 1,
  });

  if (searchResponse.data.items && searchResponse.data.items.length > 0) {
    return searchResponse.data.items[0].snippet.channelId;
  }

  throw new Error(`Channel not found: ${handleOrId}`);
}

/**
 * Get all videos from a channel
 */
async function getChannelVideos(channelHandle, maxResults = 50) {
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(channelHandle);

  // Get uploads playlist ID
  const channelResponse = await youtube.channels.list({
    part: 'contentDetails',
    id: channelId,
  });

  if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
    throw new Error('Channel not found');
  }

  const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

  // Get videos from uploads playlist
  const videos = [];
  let nextPageToken = null;

  do {
    const playlistResponse = await youtube.playlistItems.list({
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: Math.min(50, maxResults - videos.length),
      pageToken: nextPageToken,
    });

    videos.push(...playlistResponse.data.items.map(item => ({
      id: item.contentDetails.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails.default.url,
    })));

    nextPageToken = playlistResponse.data.nextPageToken;
  } while (nextPageToken && videos.length < maxResults);

  return videos;
}

/**
 * Get detailed video information
 */
async function getVideoInfo(videoIds) {
  const youtube = await getYouTubeClient();

  const response = await youtube.videos.list({
    part: 'snippet,statistics,contentDetails,status',
    id: videoIds.join(','),
  });

  return response.data.items.map(item => ({
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    tags: item.snippet.tags || [],
    categoryId: item.snippet.categoryId,
    thumbnails: item.snippet.thumbnails,
    statistics: {
      viewCount: parseInt(item.statistics.viewCount || 0),
      likeCount: parseInt(item.statistics.likeCount || 0),
      commentCount: parseInt(item.statistics.commentCount || 0),
    },
    duration: item.contentDetails.duration,
    privacyStatus: item.status.privacyStatus,
  }));
}

/**
 * Update video metadata
 */
async function updateVideoMetadata(videoId, updates) {
  const youtube = await getYouTubeClient();

  // First get current video data
  const currentData = await youtube.videos.list({
    part: 'snippet',
    id: videoId,
  });

  if (!currentData.data.items || currentData.data.items.length === 0) {
    throw new Error('Video not found');
  }

  const snippet = currentData.data.items[0].snippet;

  // Apply updates
  if (updates.title !== undefined) {
    snippet.title = updates.title;
  }
  if (updates.description !== undefined) {
    snippet.description = updates.description;
  }

  // Update video
  const response = await youtube.videos.update({
    part: 'snippet',
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
async function searchChannelVideos(channelHandle, query, maxResults = 25) {
  const youtube = await getYouTubeClient();
  const channelId = await getChannelId(channelHandle);

  const response = await youtube.search.list({
    part: 'snippet',
    channelId,
    q: query,
    type: 'video',
    maxResults,
    order: 'date',
  });

  return response.data.items.map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnail: item.snippet.thumbnails.default.url,
  }));
}

/**
 * Get video with localizations
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video resource with snippet and localizations
 */
async function getVideoWithLocalizations(videoId) {
  const youtube = await getYouTubeClient();

  try {
    const response = await youtube.videos.list({
      part: 'snippet,localizations',
      id: videoId,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`Video not found: ${videoId}`);
    }

    return response.data.items[0];
  } catch (error) {
    throw new Error(`Failed to fetch video with localizations: ${error.message}`);
  }
}

/**
 * Get specific language localization (main metadata or localization)
 * @param {string} videoId - YouTube video ID
 * @param {string} language - Language code or human-readable name (optional, defaults to main metadata language)
 * @returns {Promise<Object>} - { language, languageName, title, description, isMainLanguage }
 */
async function getVideoLocalization(videoId, language) {
  const video = await getVideoWithLocalizations(videoId);

  // If no language specified, use the video's default language
  let langCode;
  if (!language) {
    langCode = video.snippet.defaultLanguage || 'en';
    if (!video.snippet.defaultLanguage) {
      console.warn('Warning: Video does not specify default language, assuming English (en)');
    }
  } else {
    langCode = normalizeLanguage(language);

    if (!langCode) {
      throw new Error(`Invalid language: ${language}`);
    }
  }

  const defaultLanguage = video.snippet.defaultLanguage || 'en';
  const isMainLanguage = langCode === defaultLanguage;

  if (isMainLanguage) {
    return {
      language: langCode,
      languageName: getLanguageName(langCode),
      title: video.snippet.title,
      description: video.snippet.description,
      isMainLanguage: true,
    };
  }

  const localization = video.localizations?.[langCode];

  if (!localization) {
    throw new Error(`Localization not found for language: ${getLanguageName(langCode)} (${langCode})`);
  }

  return {
    language: langCode,
    languageName: getLanguageName(langCode),
    title: localization.title,
    description: localization.description,
    isMainLanguage: false,
  };
}

/**
 * Get all video localizations (including main metadata language)
 * @param {string} videoId - YouTube video ID
 * @param {string[]} languageFilter - Optional array of language codes to filter
 * @returns {Promise<Object[]>} - Array of localization objects
 */
async function getAllVideoLocalizations(videoId, languageFilter = null) {
  const video = await getVideoWithLocalizations(videoId);
  const defaultLanguage = video.snippet.defaultLanguage || 'en';
  const localizations = [];

  // Normalize filter if provided
  let filterCodes = null;
  if (languageFilter && languageFilter.length > 0) {
    filterCodes = languageFilter.map(lang => normalizeLanguage(lang)).filter(Boolean);
    if (filterCodes.length === 0) {
      throw new Error('No valid languages provided in filter');
    }
  }

  // Add main metadata language
  if (!filterCodes || filterCodes.includes(defaultLanguage)) {
    localizations.push({
      language: defaultLanguage,
      languageName: getLanguageName(defaultLanguage),
      title: video.snippet.title,
      description: video.snippet.description,
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
          languageName: getLanguageName(langCode),
          title: localization.title,
          description: localization.description,
          isMainLanguage: false,
        });
      }
    }
  }

  return localizations;
}

/**
 * Create new localization (fail if exists)
 * @param {string} videoId - YouTube video ID
 * @param {string} language - Language code or human-readable name
 * @param {string} title - Localized title
 * @param {string} description - Localized description
 * @returns {Promise<Object>} - Updated video resource
 */
async function putVideoLocalization(videoId, language, title, description) {
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  const defaultLanguage = video.snippet.defaultLanguage || 'en';

  // Validation: Check main metadata has title/description (allow empty strings, but not null/undefined)
  if (video.snippet.title == null || video.snippet.description == null) {
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
      part: 'snippet,localizations',
      requestBody: {
        id: videoId,
        snippet: {
          ...video.snippet,
          defaultLanguage: defaultLanguage,
          categoryId: video.snippet.categoryId,
        },
        localizations: newLocalizations,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to create localization: ${error.message}`);
  }
}

/**
 * Update existing localization (fail if doesn't exist)
 * @param {string} videoId - YouTube video ID
 * @param {string} language - Language code or human-readable name
 * @param {string|null} title - New title (null to keep existing)
 * @param {string|null} description - New description (null to keep existing)
 * @returns {Promise<Object>} - Updated video resource
 */
async function updateVideoLocalization(videoId, language, title = null, description = null) {
  const youtube = await getYouTubeClient();
  const video = await getVideoWithLocalizations(videoId);
  const langCode = normalizeLanguage(language);

  if (!langCode) {
    throw new Error(`Invalid language: ${language}`);
  }

  const defaultLanguage = video.snippet.defaultLanguage || 'en';

  // If updating main language, use snippet update
  if (langCode === defaultLanguage) {
    const updateData = {
      id: videoId,
      snippet: {
        ...video.snippet,
        title: title !== null ? title : video.snippet.title,
        description: description !== null ? description : video.snippet.description,
        categoryId: video.snippet.categoryId,
      },
    };

    try {
      const response = await youtube.videos.update({
        part: 'snippet',
        requestBody: updateData,
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update main metadata: ${error.message}`);
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
    title: title !== null ? title : existingLocalization.title,
    description: description !== null ? description : existingLocalization.description,
  };

  try {
    const response = await youtube.videos.update({
      part: 'localizations',
      requestBody: {
        id: videoId,
        localizations: updatedLocalizations,
      },
    });

    return response.data;
  } catch (error) {
    throw new Error(`Failed to update localization: ${error.message}`);
  }
}

module.exports = {
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
