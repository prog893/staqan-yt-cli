# YouTube API Guide

This guide covers YouTube Data API v3 usage patterns for the staqan-yt-cli project.

## Required Scopes

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',      // Read operations
  'https://www.googleapis.com/auth/youtube.force-ssl',     // Write operations
];
```

Defined in `lib/auth.ts`.

## Authentication

```typescript
import { getAuthenticatedClient } from '../lib/auth';

async function yourCommand() {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // Use youtube for API calls
}
```

## Common Operations

### Get Video Details

```typescript
const response = await youtube.videos.list({
  part: 'snippet,statistics,contentDetails',
  id: videoIds.join(',')
});

if (!response.data.items || response.data.items.length === 0) {
  throw new Error('Video not found');
}

const video = response.data.items[0];
```

### List Channel Videos

```typescript
// First get uploads playlist ID
const channelResponse = await youtube.channels.list({
  part: 'contentDetails',
  handle: channelHandle.replace('@', '')
});

if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
  throw new Error('Channel not found');
}

const uploadsPlaylistId = channelResponse.data.items[0].contentDetails?.relatedPlaylists?.uploads;

if (!uploadsPlaylistId) {
  throw new Error('No uploads playlist found');
}

// Then get videos from playlist
const playlistResponse = await youtube.playlistItems.list({
  part: 'snippet',
  playlistId: uploadsPlaylistId,
  maxResults: 50
});

const videos = playlistResponse.data.items || [];
```

### Update Video Metadata

```typescript
await youtube.videos.update({
  part: 'snippet',
  requestBody: {
    id: videoId,
    snippet: {
      title: newTitle,
      description: newDescription,
      categoryId: '24' // Keep existing category
    }
  }
});
```

### Search Videos

```typescript
const response = await youtube.search.list({
  part: 'snippet',
  q: query,
  type: 'video',
  maxResults: 10
});

const results = response.data.items || [];
```

### Get Video Localizations

```typescript
const response = await youtube.videos.list({
  part: 'localizations',
  id: videoId
});

const localizations = response.data.items?.[0]?.localizations;
```

### Get Comments

```typescript
const response = await youtube.commentThreads.list({
  part: 'snippet',
  videoId: videoId,
  maxResults: 100
});

const comments = response.data.items || [];
```

### Get Playlists

```typescript
const response = await youtube.playlists.list({
  part: 'snippet,contentDetails',
  channelId: channelId,
  maxResults: 50
});

const playlists = response.data.items || [];
```

### Get Playlist Items

```typescript
const response = await youtube.playlistItems.list({
  part: 'snippet',
  playlistId: playlistId,
  maxResults: 50
});

const items = response.data.items || [];
```

## API Parts

The YouTube API uses the `part` parameter to specify which fields to return:

| Part | Description |
|------|-------------|
| `snippet` | Basic metadata (title, description, thumbnails, etc.) |
| `statistics` | View count, like count, comment count |
| `contentDetails` | Duration, definition, caption availability |
| `localizations` | Localized titles and descriptions |
| `status` | Privacy status, license, embedding settings |

**Best practice**: Only request the parts you need to save quota.

## API Quotas

**Default quota**: 10,000 units/day

**Cost per operation**:
- Read operations: 1-5 units
- Write operations: 50 units
- List operations: 1-100 units (depends on parts and maxResults)

**Quota-saving tips**:
1. Batch operations when possible (e.g., multiple video IDs in one call)
2. Only request the parts you need
3. Use caching for frequently accessed data
4. Filter on the server side (use API filters, not client-side)

## Pagination

For large result sets, use pagination:

```typescript
let nextPageToken: string | undefined;
const allVideos: Video[] = [];

do {
  const response = await youtube.playlistItems.list({
    part: 'snippet',
    playlistId: uploadsPlaylistId,
    maxResults: 50,
    pageToken: nextPageToken
  });

  allVideos.push(...(response.data.items || []));
  nextPageToken = response.data.nextPageToken;
} while (nextPageToken);
```

## Error Handling

### Common API Errors

```typescript
try {
  const response = await youtube.videos.list({ ... });
} catch (err) {
  if ((err as any).code === 400) {
    throw new Error('Invalid request parameters');
  } else if ((err as any).code === 401) {
    throw new Error('Authentication failed. Please run: staqan-yt auth');
  } else if ((err as any).code === 403) {
    throw new Error('API quota exceeded or insufficient permissions');
  } else if ((err as any).code === 404) {
    throw new Error('Resource not found');
  } else {
    throw new Error(`API error: ${(err as Error).message}`);
  }
}
```

## Type Safety

Use googleapis type definitions:

```typescript
import { youtube_v3 } from 'googleapis';

async function getVideo(videoId: string): Promise<youtube_v3.Schema$Video> {
  const response = await youtube.videos.list({
    part: 'snippet,statistics',
    id: videoId
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error('Video not found');
  }

  return response.data.items[0];
}
```

## Related Guides

- [Adding Commands Guide](adding-commands.md) - Command patterns
- [Error Handling Guide](error-handling.md) - API error handling
- [Architecture Guide](architecture.md) - API wrapper architecture
