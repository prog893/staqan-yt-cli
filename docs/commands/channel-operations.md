# Channel Operations Commands

Commands for working with YouTube channels and their content.

## get-channel

Get detailed metadata for a YouTube channel.

### Usage

```bash
staqan-yt get-channel [channelHandle]
```

### Arguments

- `channelHandle` - Channel handle (e.g. `@staqan`) or channel ID. If omitted, uses `default.channel` from config.

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get channel by handle
staqan-yt get-channel @mkbhd

# Get channel by ID
staqan-yt get-channel UCZY6mkkAfPYvbpBq09wLjzg

# Use default channel from config
staqan-yt config set default.channel @yourchannel
staqan-yt get-channel

# Output as JSON
staqan-yt get-channel @mkbhd --output json
```

### Output Fields

- `id` - Channel ID
- `title` - Channel name
- `handle` - Channel handle (@username)
- `description` - Channel description
- `publishedAt` - Channel creation date
- `thumbnail` - Channel thumbnail URL
- `subscriberCount` - Subscriber count
- `videoCount` - Total video count
- `viewCount` - Total lifetime view count

### Related Commands

- `list-videos` - List all videos from a channel
- `list-playlists` - List channel playlists
- `get-channel-analytics` - Get channel analytics

---

## list-videos

List all videos from a YouTube channel.

### Usage

```bash
staqan-yt list-videos [channelHandle]
```

### Arguments

- `channelHandle` - Channel handle (e.g. `@staqan`) or channel ID. If omitted, uses `default.channel` from config.

### Options

- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-l, --limit <number>` - Limit number of results (default: 50)
- `-t, --type <type>` - Filter by video type: `short` or `regular` (default: all)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# List videos from channel
staqan-yt list-videos @mkbhd --limit 10

# Use default channel from config
staqan-yt config set default.channel @yourchannel
staqan-yt list-videos --limit 20

# List only Shorts
staqan-yt list-videos @yourchannel --type short --limit 50

# List only regular videos
staqan-yt list-videos @yourchannel --type regular --limit 100

# Export to CSV
staqan-yt list-videos @yourchannel --output csv > videos.csv

# Export to JSON for processing
staqan-yt list-videos @yourchannel --output json > videos.json
```

### Output Fields

- `id` - Video ID
- `title` - Video title
- `description` - Video description (truncated)
- `channelId` - Channel ID
- `channelTitle` - Channel name
- `publishedAt` - Publication date
- `thumbnail` - Thumbnail URL
- `viewCount` - View count
- `likeCount` - Like count
- `commentCount` - Comment count
- `duration` - Video duration (ISO 8601)

### Filtering by Video Type

The `--type` option filters videos:

- `--type short` - Only YouTube Shorts (< 60 seconds, vertical format)
- `--type regular` - Only regular videos
- (no flag) - All videos

### Pagination

The YouTube API returns results in pages of up to 50 videos. The `--limit` option controls total results:

```bash
# Get first 100 videos
staqan-yt list-videos @yourchannel --limit 100

# Get all videos (be careful with large channels!)
staqan-yt list-videos @yourchannel --limit 999999
```

### Related Commands

- `get-channel` - Get channel metadata
- `search-videos` - Search within a channel
- `get-videos` - Get specific videos by ID

---

## list-playlists

List all playlists from a YouTube channel.

### Usage

```bash
staqan-yt list-playlists [channelHandle]
```

### Arguments

- `channelHandle` - Channel handle (e.g. `@staqan`) or channel ID. If omitted, uses `default.channel` from config.

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-l, --limit <number>` - Limit number of results (default: 50)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# List playlists from channel
staqan-yt list-playlists @mkbhd --limit 20

# Use default channel from config
staqan-yt config set default.channel @yourchannel
staqan-yt list-playlists

# Export to CSV
staqan-yt list-playlists @yourchannel --output csv > playlists.csv
```

### Output Fields

- `id` - Playlist ID
- `title` - Playlist title
- `description` - Playlist description (truncated)
- `channelId` - Channel ID
- `channelTitle` - Channel name
- `publishedAt` - Playlist creation date
- `thumbnail` - Thumbnail URL
- `videoCount` - Number of videos in playlist

### Related Commands

- `get-playlist` - Get specific playlist details
- `get-playlists` - Get multiple playlists at once

---

## Common Patterns

### Export All Videos to CSV

```bash
# Export all videos with full metadata
staqan-yt list-videos @yourchannel --limit 1000 --output csv > all_videos.csv
```

### Find Recently Uploaded Videos

```bash
# List videos sorted by publication date (newest first)
staqan-yt list-videos @yourchannel --limit 20 --output table
```

### Analyze Video Performance

```bash
# Export video stats for analysis
staqan-yt list-videos @yourchannel --output json | \
  jq '.[] | {title, viewCount: .viewCount | tonumber, likeCount: .likeCount | tonumber}' | \
  jq -s 'sort_by(.viewCount) | reverse'
```

### Count Videos by Type

```bash
# Count Shorts vs regular videos
echo "Shorts:"
staqan-yt list-videos @yourchannel --type short --output json | jq 'length'
echo "Regular:"
staqan-yt list-videos @yourchannel --type regular --output json | jq 'length'
```

### Batch Process Videos

```bash
# Get all video IDs and process them
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  while read id; do
    echo "Processing $id"
    # Your command here
  done
```

### Compare Channels

```bash
# Get video counts for multiple channels
for channel in @mkbhd @unboxtherapy @linustechtips; do
  count=$(staqan-yt list-videos $channel --output json | jq 'length')
  echo "$channel: $count videos"
done
```

## Tips

1. **Set `default.channel`** to avoid repeating channel handle
2. **Use `--output csv`** for spreadsheet analysis
3. **Use `--type`** to separate Shorts from regular videos
4. **Be careful with `--limit`** on large channels (high API quota usage)
5. **Pipe to `jq`** for JSON processing and filtering
6. **Use `--output table`** for quick terminal viewing

## Notes

- Channel handles must start with `@` (e.g., `@mkbhd`)
- Channel IDs work without the `@` prefix (e.g., `UCZY6mkkAfPYvbpBq09wLjzg`)
- Results are ordered by publication date (newest first)
- API quota cost: 1 unit per request (plus pagination)
