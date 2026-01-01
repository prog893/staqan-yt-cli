const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./auth');

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

module.exports = {
  getYouTubeClient,
  getChannelId,
  getChannelVideos,
  getVideoInfo,
  updateVideoMetadata,
  searchChannelVideos,
};
