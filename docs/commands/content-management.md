# Content Management Commands

Commands for managing video tags, thumbnails, and playlists.

## get-video-tags

Get video tags.

### Usage

```bash
staqan-yt get-video-tags <videoId>
```

### Arguments

- `videoId` - YouTube video ID or video URL

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get tags as list
staqan-yt get-video-tags dQw4w9WgXcQ

# Export to JSON
staqan-yt get-video-tags dQw4w9WgXcQ --output json

# Export to text (one per line)
staqan-yt get-video-tags dQw4w9WgXcQ --output text

# Count tags
staqan-yt get-video-tags dQw4w9WgXcQ --output json | jq 'length'
```

### Output Structure

Array of tag strings:
```json
["youtube", "tutorial", "how to", "programming"]
```

### Use Cases

- **SEO analysis** - Review video keywords
- **Tag optimization** - Improve discoverability
- **Competitor analysis** - See what tags others use
- **Content planning** - Find popular tags in your niche

---

## update-video-tags

Update video tags (replace, add, or remove).

### Usage

```bash
staqan-yt update-video-tags <videoId>
```

### Arguments

- `videoId` - YouTube video ID or video URL

### Options

- `--tags <tags>` - Replace all tags with comma-separated list
- `--add <tags>` - Add comma-separated tags
- `--remove <tags>` - Remove comma-separated tags
- `--dry-run` - Preview changes without applying them
- `-y, --yes` - Skip confirmation prompt
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Replace all tags
staqan-yt update-video-tags dQw4w9WgXcQ \
  --tags "youtube,tutorial,how to,programming"

# Add tags to existing
staqan-yt update-video-tags dQw4w9WgXcQ \
  --add "coding,development,tech"

# Remove specific tags
staqan-yt update-video-tags dQw4w9WgXcQ \
  --remove "old tag,outdated"

# Preview changes (dry run)
staqan-yt update-video-tags dQw4w9WgXcQ \
  --add "new tag" \
  --dry-run

# Apply without confirmation
staqan-yt update-video-tags dQw4w9WgXcQ \
  --add "new tag" \
  --yes
```

### Operation Modes

**Replace (`--tags`):**
- Replaces ALL existing tags
- Use this for complete tag overhaul

**Add (`--add`):**
- Adds new tags to existing ones
- Preserves all current tags

**Remove (`--remove`):**
- Removes specified tags if they exist
- Keeps all other tags

### Safety Features

1. **`--dry-run`** - Preview changes without applying
2. **Confirmation prompt** - Requires confirmation unless `--yes` used
3. **Case-insensitive matching** - Tag removal works regardless of case

### Tag Best Practices

**Quantity:**
- YouTube allows up to 500 characters total
- Use 10-15 relevant tags
- Focus on quality over quantity

**Relevance:**
- Match video content exactly
- Use specific keywords
- Include broad and narrow terms

**Formats:**
- Multi-word tags: `"how to code"`
- Single words: `programming`
- Phrases: `"web development"`

---

## get-thumbnail

Get video thumbnail URLs in all available qualities.

### Usage

```bash
staqan-yt get-thumbnail <videoId>
```

### Arguments

- `videoId` - YouTube video ID or video URL

### Options

- `--quality <quality>` - Specific quality (default, medium, high, standard, maxres)
- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get all thumbnail qualities
staqan-yt get-thumbnail dQw4w9WgXcQ

# Get specific quality
staqan-yt get-thumbnail dQw4w9WgXcQ --quality maxres

# Export to JSON
staqan-yt get-thumbnail dQw4w9WgXcQ --output json

# Get URL only (text format)
staqan-yt get-thumbnail dQw4w9WgXcQ --quality maxres --output text
```

### Thumbnail Qualities

| Quality | Resolution | Use Case |
|---------|-----------|----------|
| `default` | 120x90 | Small previews |
| `medium` | 320x180 | Embeds, mobile |
| `high` | 480x360 | Standard quality |
| `standard` | 640x480 | High quality |
| `maxres` | 1280x720 | Best quality |

### Output Structure

```json
{
  "default": "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
  "medium": "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
  "high": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "standard": "https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg",
  "maxres": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
}
```

### Use Cases

- **Download thumbnails** - Save images for analysis
- **A/B testing** - Compare thumbnail performance
- **Social media** - Use thumbnails for promotion
- **Archive** - Backup all thumbnail versions

### Download Thumbnails

```bash
# Get URL and download
url=$(staqan-yt get-thumbnail VIDEO_ID --quality maxres --output text)
curl -o thumbnail.jpg "$url"

# Download all qualities
staqan-yt get-thumbnail VIDEO_ID --output json | \
  jq -r '.[]' | \
  while read url; do
    filename=$(basename "$url")
    curl -o "$filename" "$url"
  done
```

---

## get-playlist

Get detailed metadata for a single playlist.

### Usage

```bash
staqan-yt get-playlist <playlistId>
```

### Arguments

- `playlistId` - Playlist ID or URL

### Options

- `--output <format>` - Output format: json, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get by playlist ID
staqan-yt get-playlist PLrAXtmRdnEQy4V3aW8Lq9a4hWqPdMaE

# Get by URL
staqan-yt get-playlist "https://www.youtube.com/playlist?list=PLrAXtmRdnEQy4V3aW8Lq9a4hWqPdMaE"

# Export to JSON
staqan-yt get-playlist PLrAXtmRdnEQy4V3aW8Lq9a4hWqPdMaE --output json
```

### Output Fields

- `id` - Playlist ID
- `title` - Playlist title
- `description` - Playlist description
- `channelId` - Channel ID
- `channelTitle` - Channel name
- `publishedAt` - Creation date
- `videoCount` - Number of videos
- `thumbnail` - Thumbnail URL

### Related Commands

- `list-playlists` - List all channel playlists
- `get-playlists` - Get multiple playlists at once

---

## get-playlists

Get detailed metadata for multiple playlists (batch operation).

### Usage

```bash
staqan-yt get-playlists <playlistIds...>
```

### Arguments

- `playlistIds...` - One or more playlist IDs (space-separated)

### Options

- `--output <format>` - Output format: json, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get multiple playlists
staqan-yt get-playlists PLID1 PLID2 PLID3

# Export to JSON
staqan-yt get-playlists PLID1 PLID2 --output json
```

### Output

Same as `get-playlist`, with one object per playlist.

### Related Commands

- `get-playlist` - Get a single playlist
- `list-playlists` - List all channel playlists

---

## Common Patterns

### Analyze Competitor Tags

```bash
# Get tags from top videos in your niche
for video_id in VIDEO_ID1 VIDEO_ID2 VIDEO_ID3; do
  echo "Tags for $video_id:"
  staqan-yt get-video-tags "$video_id" --output text
  echo ""
done
```

### Batch Update Tags

```bash
# Add tags to multiple videos
cat video_ids.txt | while read id; do
  staqan-yt update-video-tags "$id" --add "new tag,another tag" --yes
done
```

### Download All Thumbnails

```bash
# Download maxres thumbnails for all videos
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  while read id; do
    url=$(staqan-yt get-thumbnail "$id" --quality maxres --output text)
    curl -o "${id}.jpg" "$url"
  done
```

### Find Missing Tags

```bash
# Find videos without specific tags
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  while read id; do
    tags=$(staqan-yt get-video-tags "$id" --output json)
    if ! echo "$tags" | jq -e '.[] | contains("keyword")' > /dev/null; then
      echo "$id missing 'keyword' tag"
    fi
  done
```

### Compare Tag Strategies

```bash
# Analyze tag usage across videos
for video_id in VIDEO_ID1 VIDEO_ID2 VIDEO_ID3; do
  count=$(staqan-yt get-video-tags "$video_id" --output json | jq 'length')
  echo "$video_id: $count tags"
done
```

### Optimize Tags Based on CTR

```bash
# Get high CTR videos and their tags
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv | \
  awk -F, 'NR>1 && $5 > 5.0 {print $2}' | \
  while read id; do
    echo "$id:"
    staqan-yt get-video-tags "$id" --output text
    echo ""
  done
```

## Tips

### Tags

1. **Research first** - See what tags competitors use
2. **Be specific** - Use precise, relevant tags
3. **Mix broad and narrow** - Both general and specific terms
4. **Update regularly** - Adjust based on performance
5. **Avoid tag stuffing** - Quality over quantity

### Thumbnails

1. **Use maxres** - Highest quality for analysis
2. **Download for A/B testing** - Compare versions
3. **Archive all qualities** - Different use cases
4. **Check with CTR data** - See which thumbnails perform best
5. **Consistent branding** - Maintain visual style

### Playlists

1. **Organize by topic** - Group related content
2. **Use descriptive titles** - Improve discoverability
3. **Update regularly** - Add new videos
4. **Cross-promote** - Link in video descriptions

## API Quota Costs

Content management API quota usage:
- **get-video-tags**: 1 unit
- **update-video-tags**: 50 units (write operation)
- **get-thumbnail**: 1 unit
- **get-playlist**: 1 unit
- **get-playlists**: 1 unit (batch, same as single)

## Notes

- **Tags** - Max 500 characters total, use wisely
- **Thumbnails** - Generated by YouTube, not custom uploads
- **Playlists** - Can be public, unlisted, or private
- **Write operations** - Higher quota cost (50 units)
- **Batch operations** - More efficient than individual calls
