# Video Discovery Commands

Commands for finding and retrieving video information.

## get-video

Get detailed metadata for a single video.

### Usage

```bash
staqan-yt get-video --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID (11 characters) or video URL (required)

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get video by ID
staqan-yt get-video --video-id dQw4w9WgXcQ

# Get video by URL
staqan-yt get-video --video-id https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Output as JSON
staqan-yt get-video --video-id dQw4w9WgXcQ --output json

# Output as table
staqan-yt get-video --video-id dQw4w9WgXcQ --output table
```

### Output Fields

- `id` - Video ID
- `title` - Video title
- `description` - Video description
- `channelId` - Channel ID
- `channelTitle` - Channel name
- `publishedAt` - Publication date
- `thumbnail` - Thumbnail URL (default quality)
- `viewCount` - View count
- `likeCount` - Like count
- `commentCount` - Comment count
- `duration` - Video duration (ISO 8601)
- `tags` - Video tags

### Related Commands

- `get-videos` - Get multiple videos at once
- `list-videos` - List all videos from a channel
- `search-videos` - Search for videos

---

## get-videos

Get detailed metadata for multiple videos in a single batch operation.

### Usage

```bash
staqan-yt get-videos --video-ids <videoIds...>
```

### Options

- `--video-ids <ids...>` - One or more YouTube video IDs (space-separated, required)

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get multiple videos
staqan-yt get-videos --video-ids dQw4w9WgXcQ abc123xyz def456uvw

# Output as CSV for analysis
staqan-yt get-videos --video-ids dQw4w9WgXcQ abc123xyz --output csv > videos.csv

# Get from file
cat video_ids.txt | xargs staqan-yt get-videos --video-ids --output json
```

### Output Fields

Same as `get-video`, with one object per video.

### Performance Note

This command is more efficient than calling `get-video` multiple times because it:
- Makes a single API call
- Returns all videos in one response
- Minimizes API quota usage

### Related Commands

- `get-video` - Get a single video
- `list-videos` - List all videos from a channel

---

## search-videos

Search for videos on YouTube or within a specific channel.

### Usage

```bash
staqan-yt search-videos --query <query>
```

### Options

- `--query <text>` - Search query string (required)

- `-g, --global` - Search all of YouTube (ignores channel filters)
- `-c, --channel <handle>` - Search within a specific channel (overrides config default)
- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-l, --limit <number>` - Limit number of results (default: 25)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Search within your default channel
staqan-yt config set default.channel @yourchannel
staqan-yt search-videos --query "iPhone review"

# Search within a specific channel
staqan-yt search-videos --query "craft beer" --channel @staqan

# Search all of YouTube
staqan-yt search-videos --query "how to cook" --global

# Limit results
staqan-yt search-videos --query "tutorial" --limit 50

# Output as CSV
staqan-yt search-videos --query "Python" --output csv > results.csv
```

### Output Fields

- `id` - Video ID
- `title` - Video title
- `description` - Video description (truncated)
- `channelId` - Channel ID
- `channelTitle` - Channel name
- `publishedAt` - Publication date
- `thumbnail` - Thumbnail URL

### Search Behavior

**Channel search (default):**
- Uses `default.channel` config if no `--channel` specified
- Returns videos from that specific channel
- Faster than global search

**Global search (`--global`):**
- Searches all of YouTube
- Ignores `default.channel` config
- Higher API quota cost (100 units per request)

### Related Commands

- `list-videos` - List all videos from a channel
- `get-channel-search-terms` - Get top search terms for a channel

---

## Common Patterns

### Find Videos in a Series

```bash
# Search for series episodes
staqan-yt search-videos --query "Part 1" --channel @yourchannel --output json | \
  jq -r '.[] | "\(.title) - \(.id)"'
```

### Export Search Results

```bash
# Search and export to CSV
staqan-yt search-videos --query "review" --channel @yourchannel --output csv > reviews.csv

# Search and export to JSON
staqan-yt search-videos --query "tutorial" --output json > tutorials.json
```

### Batch Get Video Details

```bash
# Search and get full details for results
staqan-yt search-videos --query "keyword" --output json | \
  jq -r '.[].id' | \
  xargs staqan-yt get-videos --video-ids --output json
```

### Find Most Viewed Videos

```bash
# List and sort by view count
staqan-yt list-videos @yourchannel --limit 50 --output json | \
  jq 'sort_by(.viewCount | tonumber) | reverse | .[0:10]'
```

## Tips

1. **Use `--output json`** for programmatic processing
2. **Use `--output csv`** for spreadsheet analysis
3. **Use `--output table`** for terminal viewing
4. **Set `default.channel`** to avoid repeating channel handle
5. **Use `--limit`** to control result size and API quota usage
