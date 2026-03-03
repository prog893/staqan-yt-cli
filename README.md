# staqan-yt-cli

A powerful command-line interface for managing YouTube videos and metadata using the YouTube Data API v3.

> **For developers:** See [CLAUDE.md](CLAUDE.md) for development guidelines, architecture principles, and AWS naming conventions.

## Features

- **OAuth 2.0 Authentication** - Secure authentication with Google
- **Channel Video Listing** - List all videos from any YouTube channel
- **Video Metadata Retrieval** - Get detailed information about videos
- **Metadata Updates** - Update video titles and descriptions
- **Video Localizations** - Manage multilingual titles and descriptions (English, Japanese, Russian)
- **Channel Search** - Search for specific videos within a channel
- **Playlist Management** - List and retrieve YouTube playlists
- **Comments** - List video comments for engagement monitoring
- **Channel Analytics** - Channel-level analytics reports (demographics, devices, geography, traffic sources, subscription status)
- **Video Analytics & SEO** - Performance metrics, search terms, traffic sources
- **Bulk Reports** - YouTube Reporting API access for CTR, impressions, and historical data
- **Tags Management** - View and update video tags for better discoverability
- **Thumbnail Access** - Retrieve video thumbnail URLs in all available qualities
- **Multiple Output Formats** - JSON, table, text, pretty, or CSV output for any workflow
- **User-Friendly Interface** - Colorful output with loading spinners

## Installation

### Option 1: Homebrew (Recommended for macOS)

Install from the staqan-yt-cli tap:

```bash
brew tap prog893/staqan-yt https://github.com/prog893/staqan-yt-cli.git
brew install staqan-yt
```

Or install directly from the formula URL:

```bash
brew install https://raw.githubusercontent.com/prog893/staqan-yt-cli/main/Formula/staqan-yt.rb
```

**Note:** Homebrew will automatically install Bun as a build dependency and compile the tool from source. This works seamlessly with private repositories since Homebrew can use your git credentials.

### Option 2: Install from Source (Development)

**Prerequisites:**
- Bun runtime ([Install Bun](https://bun.sh))

```bash
# Clone the repository
git clone https://github.com/prog893/staqan-yt-cli.git
cd staqan-yt-cli

# Install dependencies
bun install

# Build a single-file executable
bun build ./bin/staqan-yt.ts --compile --outfile staqan-yt

# Move to a directory in your PATH
sudo mv staqan-yt /usr/local/bin/
```

## OAuth Setup

Before using the CLI, you need to set up OAuth 2.0 credentials:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3:
   - Navigate to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to [API Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Desktop application" as the application type
4. Name it (e.g., "staqan-yt-cli")
5. Click "Create"
6. Download the credentials JSON file

### 3. Save Credentials

Save the downloaded credentials file to:
```
~/.staqan-yt-cli/credentials.json
```

Or create the directory and copy:
```bash
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
```

### 4. Required OAuth Scopes

The CLI requires these scopes:
- `https://www.googleapis.com/auth/youtube.readonly` - Read YouTube data
- `https://www.googleapis.com/auth/youtube.force-ssl` - Manage YouTube videos
- `https://www.googleapis.com/auth/yt-analytics.readonly` - Access YouTube Analytics data (for analytics commands)

**Note:** If you've already authenticated, you'll need to re-authenticate to access analytics features: `staqan-yt auth`

## Authentication

Run the auth command to authenticate:

```bash
staqan-yt auth
```

This will:
1. Open your browser for Google OAuth consent
2. Save the authentication token to `~/.staqan-yt-cli/token.json`
3. Allow you to use all CLI commands

## MCP Server Integration

The CLI includes an MCP (Model Context Protocol) server that enables AI assistants like Claude Desktop to manage your YouTube videos through natural language.

### What is MCP?

MCP is a protocol that allows AI assistants to access external tools and data sources. With staqan-yt's MCP server, you can ask Claude to perform YouTube operations directly from the chat interface.

### Setup for Claude Desktop

1. **Authenticate with YouTube** (one-time setup):
   ```bash
   staqan-yt auth
   ```

2. **Configure Claude Desktop** by editing your config file:

   **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

   **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

   **Linux:** `~/.config/Claude/claude_desktop_config.json`

3. **Add staqan-yt MCP server:**
   ```json
   {
     "mcpServers": {
       "youtube": {
         "command": "staqan-yt",
         "args": ["mcp"]
       }
     }
   }
   ```

4. **Restart Claude Desktop**

### Available MCP Tools

The MCP server exposes **15 operations** covering all CLI functionality:

**Video Metadata:**
- `youtube_get_video` - Get detailed metadata for one or more videos
- `youtube_list_videos` - List videos from a YouTube channel
- `youtube_search_videos` - Search for videos within a channel
- `youtube_update_video` - Update video title and/or description

**Localizations:**
- `youtube_get_localization` - Get specific language localization
- `youtube_get_all_localizations` - Get all available localizations
- `youtube_create_localization` - Create new localization for a language
- `youtube_update_localization` - Update existing localization

**Analytics:**
- `youtube_get_channel_analytics` - Get channel-level analytics reports (demographics, devices, geography, etc.)
- `youtube_get_video_analytics` - Get performance metrics (views, watch time, engagement)
- `youtube_get_search_terms` - Get YouTube search terms that led to video
- `youtube_get_traffic_sources` - Get traffic source breakdown
- `youtube_get_video_retention` - Get audience retention curve
- `youtube_list_report_types` - List available YouTube Reporting API report types
- `youtube_get_report` - Download bulk reports (CTR, impressions, historical data)

**Tags & Thumbnails:**
- `youtube_get_video_tags` - Get video tags
- `youtube_update_video_tags` - Update tags (add, remove, replace)
- `youtube_get_thumbnail` - Get thumbnail URLs in all qualities

### Example Usage with Claude

Once configured, you can use natural language in Claude Desktop:

```
You: "Get information about video dQw4w9WgXcQ"
Claude: [Uses youtube_get_video tool and shows results]

You: "List the 10 most recent videos from @mkbhd"
Claude: [Uses youtube_list_videos tool]

You: "Update the title of video abc123xyz to 'My New Title'"
Claude: [Uses youtube_update_video tool]

You: "Search for videos about 'iPhone' in @mkbhd's channel"
Claude: [Uses youtube_search_videos tool]
```

### Benefits of MCP Integration

- **Natural language interface** - No need to remember command syntax
- **Batch operations** - Process multiple videos in one conversation
- **Context awareness** - Claude remembers previous results in the conversation
- **AI-powered workflows** - Combine YouTube operations with other tasks
- **Error handling** - Claude can interpret errors and suggest fixes

### Manual MCP Server Testing

You can test the MCP server manually using stdio:

```bash
# List available tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | staqan-yt mcp

# The server returns JSON-RPC responses with tool definitions
```

## Usage

### General Syntax

```bash
staqan-yt <command> [options]
```

### Commands

### Command Reference

#### get-video (singular)
Get metadata for a single video:
```bash
staqan-yt get-video dQw4w9WgXcQ --output json
```

#### get-videos (plural - batch operation)
Get metadata for multiple videos:
```bash
staqan-yt get-videos dQw4w9WgXcQ abc123xyz def456uvw --output json
```

#### list-videos
List all videos from a channel:
```bash
staqan-yt list-videos @channelname --limit 50 --output json
```

#### search-videos
Search for videos on YouTube or within a specific channel:

**Global search (all of YouTube):**
```bash
staqan-yt search-videos "craft beer tutorial" --global
```

**Channel-specific search:**
```bash
staqan-yt search-videos "smartphone review" --channel @mkbhd
```

**Using config default:**
```bash
staqan-yt search-videos "smartphone review"  # Uses default.channel from config
```

**With output format:**
```bash
staqan-yt search-videos "python tutorial" --global --output json
staqan-yt search-videos "react" --channel @Fireship --output csv
```

#### update-video (singular)
Update a single video's metadata:
```bash
staqan-yt update-video dQw4w9WgXcQ --title "New Title" --description "New Desc" --dry-run
```

#### get-playlist (singular)
Get metadata for a single playlist:
```bash
staqan-yt get-playlist PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO- --output json
```

#### get-playlists (plural - batch operation)
Get metadata for multiple playlists:
```bash
staqan-yt get-playlists PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO- PLjkl012MNOP345 --output json
```

#### list-playlists
List all playlists from a channel:
```bash
staqan-yt list-playlists @channelname --limit 50 --output json
```

---

## Commands

#### 1. Authentication

```bash
staqan-yt auth
```

Authenticate with YouTube API using OAuth 2.0.

**Example:**
```bash
$ staqan-yt auth
Starting authentication process...
ℹ Opening browser for authentication...
✓ Authentication successful!
```

---

#### 2. Configuration Management

```bash
staqan-yt config [action] [key] [value]
```

Manage CLI configuration settings (set default channel, output format).

**Actions:**
- `list` - Show all configuration settings (default if no action provided)
- `set <key> <value>` - Set a configuration value
- `get <key>` - Get a specific configuration value

**Available Configuration Keys:**
- `default.channel` - Default channel handle or ID (e.g., @staqan)
- `default.output` - Default output format: `json`, `table`, `text`, `pretty`, or `csv` (default: `pretty`)

**Examples:**

```bash
# View current configuration
staqan-yt config list
# or simply
staqan-yt config

# Set default channel
staqan-yt config set default.channel @staqan

# Set default output format to CSV
staqan-yt config set default.output csv

# Get specific config value
staqan-yt config get default.channel
```

**How Defaults Work:**
- When `default.channel` is set, `list-videos` lists videos from that channel by default
- When `default.channel` is set, `search-videos` searches within that channel by default
- Use `--global` flag with `search-videos` to override and search all of YouTube
- Use `--channel @handle` flag with `search-videos` to override and search a different channel
- When `default.output` is set, commands will use that format by default (you can still override with `--output` flag)
- CLI flags always take precedence over config defaults

**Output Format Options:**
- `json` - Machine-readable JSON for scripting and automation
- `table` - ASCII table format for easy reading in terminal
- `text` - Tab-delimited output for piping to `awk`, `cut`, etc. (AWS CLI style)
- `pretty` - Colorful, human-friendly output with formatting (default)
- `csv` - RFC 4180 CSV format for Excel and data analysis

**Example Workflow:**
```bash
# Set up your defaults once
staqan-yt config set default.channel @staqan
staqan-yt config set default.output csv

# Now these commands work without extra arguments
staqan-yt list-videos --limit 5        # Uses @staqan from config, outputs CSV

# Export to Excel
staqan-yt list-videos --limit 50 > videos.csv

# You can always override the format
staqan-yt list-videos --limit 5 --output table  # Show as ASCII table instead
staqan-yt search-videos "craft beer"   # Uses @staqan from config, outputs CSV

# Override defaults when needed
staqan-yt list-videos @otherChannel --limit 5  # Uses different channel
```

---

#### 3. List Channel Videos

```bash
staqan-yt list-videos [channelHandle] [options]
```

List all videos from a YouTube channel.

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-l, --limit <number>` - Limit number of results (default: 50)

**Examples:**

```bash
# Using @handle
staqan-yt channel-videos @mkbhd

# Using channel URL
staqan-yt channel-videos https://www.youtube.com/@mkbhd

# Limit results and JSON output
staqan-yt channel-videos @mkbhd --limit 10 --output json
```

**Sample Output:**
```
✓ Found 50 video(s)

[1] Amazing Tech Review
  ID: dQw4w9WgXcQ
  Published: Jan 15, 2024
  URL: https://youtube.com/watch?v=dQw4w9WgXcQ

[2] Another Great Video
  ID: abc123xyz78
  Published: Jan 10, 2024
  URL: https://youtube.com/watch?v=abc123xyz78
```

---

#### 3. Get Video Information

```bash
staqan-yt video-info <videoIds...> [options]
```

Get detailed metadata for one or more videos.

**Arguments:**
- `videoIds` - One or more video IDs or URLs

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Single video
staqan-yt video-info dQw4w9WgXcQ

# Multiple videos
staqan-yt video-info dQw4w9WgXcQ abc123xyz78

# Using URLs
staqan-yt video-info https://youtube.com/watch?v=dQw4w9WgXcQ

# JSON output
staqan-yt video-info dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Retrieved information for 1 video(s)

Amazing Tech Review

Video ID:     dQw4w9WgXcQ
Channel:      TechChannel
Published:    Jan 15, 2024
Duration:     PT10M30S
Privacy:      public

Statistics:
  Views:      1,234,567
  Likes:      45,678
  Comments:   1,234

Tags:
  tech, review, smartphone, 2024

Description:
  In this video, we review the latest smartphone...

URL:          https://youtube.com/watch?v=dQw4w9WgXcQ
```

---

#### 4. Update Video Metadata

```bash
staqan-yt update-metadata <videoId> [options]
```

Update video title and/or description.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `-t, --title <title>` - New video title
- `-d, --description <description>` - New video description
- `--dry-run` - Preview changes without applying them
- `-y, --yes` - Skip confirmation prompt

**Examples:**

```bash
# Update title only
staqan-yt update-metadata dQw4w9WgXcQ --title "New Title"

# Update description only
staqan-yt update-metadata dQw4w9WgXcQ --description "New description text"

# Update both
staqan-yt update-metadata dQw4w9WgXcQ \
  --title "New Title" \
  --description "New description"

# Preview without applying
staqan-yt update-metadata dQw4w9WgXcQ --title "Test" --dry-run

# Skip confirmation
staqan-yt update-metadata dQw4w9WgXcQ --title "New Title" --yes
```

**Sample Output:**
```
✓ Current metadata retrieved

Current metadata:
Title:       Old Video Title
Description: Old description text...

Proposed changes:
Title:       New Video Title
Description: (no change)

Apply these changes? (y/N): y
✓ Metadata updated successfully

✓ Video updated: https://youtube.com/watch?v=dQw4w9WgXcQ
```

---

#### 5. Search Channel Videos

```bash
staqan-yt search-videos <query> [options]
```

Search for videos on YouTube or within a specific channel.

**Arguments:**
- `query` - Search query string

**Options:**
- `-g, --global` - Search all of YouTube (ignores channel filters)
- `-c, --channel <handle>` - Search within a specific channel (overrides config default)
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-l, --limit <number>` - Limit number of results (default: 25)
- `-v, --verbose` - Enable verbose output with debug information

**Examples:**

```bash
# Global YouTube search
staqan-yt search-videos "python tutorial" --global

# Search within a specific channel
staqan-yt search-videos "smartphone review" --channel @mkbhd

# Search using default channel from config
staqan-yt search-videos "smartphone review"

# Limit results and output format
staqan-yt search-videos "machine learning" --global --limit 10 --output json

# Export search results to CSV
staqan-yt search-videos "rust programming" --global --output csv > results.csv
```

**Sample Output:**
```
✓ Found 5 video(s)

[1] Python Tutorial for Beginners
  ID: dQw4w9WgXcQ
  Channel: @programming
  Published: Jan 15, 2024
  URL: https://youtube.com/watch?v=dQw4w9WgXcQ

[2] Learn Python in 1 Hour
  ID: abc123xyz78
  Channel: @codemaster
  Published: Dec 20, 2023
  URL: https://youtube.com/watch?v=abc123xyz78
```

---

#### 6. Get All Video Localizations

```bash
staqan-yt get-video-localizations <videoId> [options]
```

Get all video localizations including the main metadata language.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--languages <langs>` - Comma-separated list of languages to filter (e.g., "en,ja,ru")
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get all localizations
staqan-yt get-video-localizations dQw4w9WgXcQ

# Filter specific languages
staqan-yt get-video-localizations dQw4w9WgXcQ --languages "ja,ru"

# JSON output
staqan-yt get-video-localizations dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Retrieved 2 localization(s)

Localizations for video: dQw4w9WgXcQ

[MAIN] English (en)
  Title:      Original Video Title
  Description: Original video description...

[LOCALIZATION] Japanese (ja)
  Title:      日本語タイトル
  Description: 日本語の説明...
```

---

#### 7. Get Single Video Localization

```bash
staqan-yt get-video-localization <videoId> [options]
```

Get a specific language localization. Defaults to main metadata language if not specified.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--language <lang>` - Language code (en, ja, ru) or name (English, Japanese, Russian)
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get main metadata language (default)
staqan-yt get-video-localization dQw4w9WgXcQ

# Get Japanese localization
staqan-yt get-video-localization dQw4w9WgXcQ --language ja

# Case-insensitive language names
staqan-yt get-video-localization dQw4w9WgXcQ --language JAPANESE

# JSON output
staqan-yt get-video-localization dQw4w9WgXcQ --language ja --output json
```

**Sample Output:**
```
✓ Localization retrieved successfully

[LOCALIZATION] Japanese (ja)

Title:
日本語タイトル

Description:
日本語の説明文がここに表示されます...
```

---

#### 8. Create Video Localization

```bash
staqan-yt put-video-localization <videoId> --language <lang> --title <title> --description <desc>
```

Create a new localization for a video. Fails if localization already exists.

**Arguments:**
- `videoId` - Video ID or URL

**Options (all required):**
- `--language <lang>` - Language code or name (en/English, ja/Japanese, ru/Russian)
- `--title <title>` - Localized title
- `--description <desc>` - Localized description

**Examples:**

```bash
# Create Japanese localization
staqan-yt put-video-localization dQw4w9WgXcQ \
  --language Japanese \
  --title "日本語タイトル" \
  --description "日本語の説明"

# Using ISO code
staqan-yt put-video-localization dQw4w9WgXcQ \
  --language ja \
  --title "タイトル" \
  --description "説明文"
```

**Sample Output:**
```
✓ Successfully created Japanese (ja) localization

Video ID: dQw4w9WgXcQ
Title: 日本語タイトル
```

**Validation:**
- Cannot create localization for main metadata language (use `update-video` instead)
- Fails if localization already exists (use `update-video-localization` instead)
- Main video must have title and description

---

#### 9. Update Video Localization

```bash
staqan-yt update-video-localization <videoId> --language <lang> [--title <title>] [--description <desc>]
```

Update an existing localization or main metadata. Fails if localization doesn't exist.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--language <lang>` (required) - Language code or name
- `--title <title>` (optional) - New localized title
- `--description <desc>` (optional) - New localized description

**Examples:**

```bash
# Update title only
staqan-yt update-video-localization dQw4w9WgXcQ \
  --language ja \
  --title "新しいタイトル"

# Update description only
staqan-yt update-video-localization dQw4w9WgXcQ \
  --language Japanese \
  --description "新しい説明"

# Update both
staqan-yt update-video-localization dQw4w9WgXcQ \
  --language ja \
  --title "新タイトル" \
  --description "新説明"

# Update main metadata (if language matches main)
staqan-yt update-video-localization dQw4w9WgXcQ \
  --language en \
  --title "Updated English Title"
```

**Sample Output:**
```
✓ Successfully updated Japanese (ja) localization

Video ID: dQw4w9WgXcQ
New title: 新しいタイトル
Description updated
```

**Note:** If the language matches the video's main metadata language, updates the main snippet instead of localizations.

---

#### 10. Get Video Tags

```bash
staqan-yt get-video-tags <videoId> [options]
```

Retrieve all tags for a video. Tags are important for YouTube SEO and discoverability.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get tags
staqan-yt get-video-tags dQw4w9WgXcQ

# JSON output
staqan-yt get-video-tags dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Retrieved 19 tag(s)

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8

Tags (19):
  1. STAQAN
  2. うちゅうブルーイング
  3. クラフトビール
  4. craftbeer
  5. beer
  ...
```

---

#### 11. Update Video Tags

```bash
staqan-yt update-video-tags <videoId> [options]
```

Update video tags. You can replace all tags, add new tags, or remove specific tags.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--tags <tags>` - Replace all tags with comma-separated list
- `--add <tags>` - Add comma-separated tags (keeps existing)
- `--remove <tags>` - Remove comma-separated tags
- `--dry-run` - Preview changes without applying them
- `-y, --yes` - Skip confirmation prompt

**Examples:**

```bash
# Replace all tags
staqan-yt update-video-tags dQw4w9WgXcQ \
  --tags "music,video,awesome"

# Add new tags (keeps existing)
staqan-yt update-video-tags dQw4w9WgXcQ \
  --add "tutorial,2024"

# Remove specific tags
staqan-yt update-video-tags dQw4w9WgXcQ \
  --remove "old,deprecated"

# Preview changes
staqan-yt update-video-tags dQw4w9WgXcQ \
  --tags "new,tags" --dry-run
```

**Sample Output:**
```
✓ Current tags retrieved

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8

Current tags:
  craftbeer
  beer
  japan

New tags:
  craftbeer
  beer
  japan
  + tutorial
  + 2024

Apply these changes? (y/N): y
✓ Tags updated successfully
```

---

#### 12. Get Video Thumbnail

```bash
staqan-yt get-thumbnail <videoId> [options]
```

Retrieve video thumbnail URLs in all available qualities.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--quality <quality>` - Show specific quality only (default, medium, high, standard, maxres)
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get all thumbnail sizes
staqan-yt get-thumbnail dQw4w9WgXcQ

# Get specific quality
staqan-yt get-thumbnail dQw4w9WgXcQ --quality maxres

# JSON output
staqan-yt get-thumbnail dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Retrieved thumbnail information

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8

Available Thumbnails:

  DEFAULT:
    URL:   https://i.ytimg.com/vi/moYDTCX0GO8/default.jpg
    Size:  120x90

  MEDIUM:
    URL:   https://i.ytimg.com/vi/moYDTCX0GO8/mqdefault.jpg
    Size:  320x180

  HIGH:
    URL:   https://i.ytimg.com/vi/moYDTCX0GO8/hqdefault.jpg
    Size:  480x360

  MAXRES:
    URL:   https://i.ytimg.com/vi/moYDTCX0GO8/maxresdefault.jpg
    Size:  1280x720
```

---

#### 13. Get Playlist (singular)

```bash
staqan-yt get-playlist <playlistId> [options]
```

Get detailed metadata for a single playlist.

**Arguments:**
- `playlistId` - Playlist ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-v, --verbose` - Enable verbose logging

**Examples:**

```bash
# Get playlist details
staqan-yt get-playlist PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-

# Using playlist URL
staqan-yt get-playlist https://www.youtube.com/playlist?list=PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-

# JSON output
staqan-yt get-playlist PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO- --output json
```

**Sample Output:**
```
✓ Retrieved playlist: My Awesome Playlist

My Awesome Playlist

Playlist ID:   PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-
Channel:       STAQAN (@staqan)
Videos:        42
Privacy:       public
Published:     Jan 15, 2024

Description:
  A collection of my favorite videos about craft beer and brewing...

URL:           https://youtube.com/playlist?list=PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-
```

---

#### 14. Get Playlists (plural - batch operation)

```bash
staqan-yt get-playlists <playlistIds...> [options]
```

Get detailed metadata for multiple playlists at once.

**Arguments:**
- `playlistIds` - One or more playlist IDs or URLs

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-v, --verbose` - Enable verbose logging

**Examples:**

```bash
# Get multiple playlists
staqan-yt get-playlists PLabc123 PLdef456 PLghi789

# Using URLs
staqan-yt get-playlists \
  https://www.youtube.com/playlist?list=PLabc123 \
  https://www.youtube.com/playlist?list=PLdef456

# JSON output
staqan-yt get-playlists PLabc123 PLdef456 --output json
```

**Sample Output:**
```
✓ Retrieved information for 2 playlist(s)

[1] My Awesome Playlist

Playlist ID:   PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-
Channel:       STAQAN (@staqan)
Videos:        42
Privacy:       public
Published:     Jan 15, 2024

URL:           https://youtube.com/playlist?list=PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-

────────────────────────────────────────────────────────────────────────────────

[2] Another Great Playlist

Playlist ID:   PLjkl012MNOP345
Channel:       STAQAN (@staqan)
Videos:        15
Privacy:       public
Published:     Dec 20, 2023

URL:           https://youtube.com/playlist?list=PLjkl012MNOP345
```

---

#### 15. List Playlists

```bash
staqan-yt list-playlists [channelHandle] [options]
```

List all playlists from a YouTube channel.

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-l, --limit <number>` - Limit number of results (default: 50)
- `-v, --verbose` - Enable verbose logging

**Examples:**

```bash
# List playlists for a channel
staqan-yt list-playlists @mkbhd

# Using default channel from config
staqan-yt list-playlists

# Limit results
staqan-yt list-playlists @mkbhd --limit 10

# JSON output
staqan-yt list-playlists @mkbhd --output json
```

**Sample Output:**
```
✓ Found 5 playlist(s)

[1] MKBHD Videos
  ID: PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-
  Videos: 500
  Published: Jan 15, 2024
  URL: https://youtube.com/playlist?list=PLrAXtmRdnEQy4NANFFH59wXOyi5Mk5cO-

[2] MKBHD Shorts
  ID: PLjkl012MNOP345
  Videos: 150
  Published: Dec 20, 2023
  URL: https://youtube.com/playlist?list=PLjkl012MNOP345

[3] MKBHD Reviews [Private]
  ID: PLghi789xyz012
  Videos: 25
  Published: Nov 10, 2023
  URL: https://youtube.com/playlist?list=PLghi789xyz012
```

---

#### 16. List Comments

```bash
staqan-yt list-comments <videoId> [options]
```

List comments for a YouTube video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)
- `-l, --limit <number>` - Limit number of results (default: 20)
- `-s, --sort <order>` - Sort order: `top` (by relevance) or `new` (by recency, default: `top`)
- `-v, --verbose` - Enable verbose logging

**Examples:**

```bash
# List top 20 comments (default)
staqan-yt list-comments dQw4w9WgXcQ

# List 50 most recent comments
staqan-yt list-comments dQw4w9WgXcQ --limit 50 --sort new

# Export to CSV
staqan-yt list-comments dQw4w9WgXcQ --output csv > comments.csv

# JSON output
staqan-yt list-comments dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✔ Found 5 comment(s)

[1] @YouTube
  ID: Ugzge340dBgB75hWBm54AaABAg
  can confirm: he never gave us up
  ♥ Likes: 175045 | Replies: 1001
  Posted: Apr 23, 2025

[2] @Oatman69
  ID: UgyEnXfdC-umwvTt8JF4AaABAg
  Gonna flag this for nudity so I can rick roll the YouTube staff
  ♥ Likes: 544998 | Replies: 587
  Posted: Nov 23, 2019
```

**Use Cases:**
- **Engagement monitoring** - See top comments on a video
- **Moderation** - Review flagged comments
- **Feedback analysis** - Export comments for sentiment analysis
- **Community insights** - Understand audience response

**Note:** This command fetches top-level comments only. Replies are counted but not expanded.

---

#### 17. Get Video Analytics

```bash
staqan-yt get-video-analytics <videoId> [options]
```

Get comprehensive video performance analytics including views, watch time, and engagement metrics.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--start-date <date>` - Start date (YYYY-MM-DD), defaults to 30 days ago
- `--end-date <date>` - End date (YYYY-MM-DD), defaults to today
- `--metrics <metrics>` - Comma-separated list of metrics to fetch
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Available Metrics:**
- `views` - Number of views
- `estimatedMinutesWatched` - Total watch time
- `averageViewDuration` - Average view duration in seconds
- `averageViewPercentage` - Average percentage watched
- `likes`, `dislikes`, `comments`, `shares` - Engagement metrics

**Examples:**

```bash
# Get last 30 days of analytics
staqan-yt get-video-analytics dQw4w9WgXcQ

# Custom date range
staqan-yt get-video-analytics dQw4w9WgXcQ \
  --start-date 2024-12-01 \
  --end-date 2025-01-06

# Specific metrics only
staqan-yt get-video-analytics dQw4w9WgXcQ \
  --metrics "views,likes,comments"

# JSON output
staqan-yt get-video-analytics dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Analytics data retrieved

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8
Date Range: 2024-12-07 to 2025-01-06

Analytics Metrics:

  Views: 51
  Estimated Minutes Watched: 423
  Average View Duration: 498.5
  Average View Percentage: 52.8%
  Likes: 12
  Comments: 3
```

**Note:** Requires YouTube Analytics API to be enabled and re-authentication with `staqan-yt auth`

---

#### 14. Get Search Terms

```bash
staqan-yt get-search-terms <videoId> [options]
```

Get YouTube search terms that led viewers to your video. Critical for SEO optimization.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `-l, --limit <number>` - Limit number of results (default: 50)
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get top 50 search terms
staqan-yt get-search-terms dQw4w9WgXcQ

# Get top 10 search terms
staqan-yt get-search-terms dQw4w9WgXcQ --limit 10

# JSON output
staqan-yt get-search-terms dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Search terms data retrieved

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8
Date Range: 2025-12-07 to 2026-01-06

Top Search Terms (1):

  1. 宇宙ビール
      2 views

Total views from search: 2
```

**Use Case:** Analyze which search queries are driving traffic to optimize titles, descriptions, and tags.

---

#### 15. Get Traffic Sources

```bash
staqan-yt get-traffic-sources <videoId> [options]
```

Get traffic source breakdown showing how viewers found your video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`, or from config)

**Examples:**

```bash
# Get traffic sources
staqan-yt get-traffic-sources dQw4w9WgXcQ

# JSON output
staqan-yt get-traffic-sources dQw4w9WgXcQ --output json
```

**Sample Output:**
```
✓ Traffic sources data retrieved

【本当にすごい！日本のクラフトビール】第一回 うちゅうブルーイング
Video ID: moYDTCX0GO8
Date Range: 2025-12-07 to 2026-01-06

Traffic Sources:

  YouTube Search:
    Views:      32
    Percentage: 62.75%

  Suggested Videos:
    Views:      4
    Percentage: 7.84%

  Channel Page:
    Views:      8
    Percentage: 15.69%

  Subscriber Feed:
    Views:      5
    Percentage: 9.80%

Total Views: 51
```

**Traffic Source Types:**
- **YouTube Search** - Found via YouTube search
- **Suggested Videos** - Recommended alongside other videos
- **External** - Links from external websites
- **Browse Features** - YouTube homepage, trending, etc.
- **Channel Page** - Direct channel visits
- **Playlists** - Found in playlists
- **Notifications** - Push notifications
- **Subscriber Feed** - Subscriber home feed

---

#### 16. Get Channel Analytics
```bash
staqan-yt get-channel-analytics [channelHandle] [options]
```

Get channel-level analytics reports from YouTube Analytics API (demographics, devices, geography, etc.).

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--report <type>` - Predefined report type: `demographics`, `devices`, `geography`, `traffic-sources`, or `subscription-status`
- `--start-date <date>` - Start date (YYYY-MM-DD), defaults to 30 days ago
- `--end-date <date>` - End date (YYYY-MM-DD), defaults to today
- `--dimensions <dims>` - Custom dimensions (comma-separated, requires `--metrics`)
- `--metrics <metrics>` - Custom metrics (comma-separated, requires `--dimensions`)
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`), or from config
- `-v, --verbose` - Enable verbose output with debug information

**Predefined Report Types:**

| Report Type | Dimensions | Metrics |
|-------------|------------|---------|
| demographics | ageGroup,gender | views,estimatedMinutesWatched |
| devices | deviceType,operatingSystem | views,estimatedMinutesWatched |
| geography | country | views,estimatedMinutesWatched |
| traffic-sources | insightTrafficSourceType | views,estimatedMinutesWatched |
| subscription-status | subscribedStatus | views,estimatedMinutesWatched |

**Examples:**
```bash
# Predefined reports
staqan-yt get-channel-analytics @channel --report demographics
staqan-yt get-channel-analytics @channel --report devices --output csv

# Custom query
staqan-yt get-channel-analytics @channel \
  --dimensions "deviceType,operatingSystem" \
  --metrics "views,estimatedMinutesWatched" \
  --start-date 2025-01-01 \
  --end-date 2025-01-31

# Using config default channel
staqan-yt get-channel-analytics --report geography
```

**Sample Output:**
```
✓ Analytics data retrieved

My Channel
Channel ID: UCxxxxxxxxxxxxxxxxxx
Report Type: demographics
Date Range: 2025-01-13 to 2026-02-13

Age Group:    age13-17
Views:        12,345
Watch Time:    234,567

Age Group:    age18-24
Views:        45,678
Watch Time:    890,123

...
Total: 10 result(s)
```

**Important:**
- Requires YouTube Analytics API to be enabled in Google Cloud Console
- Requires re-authentication after enabling analytics API: `staqan-yt auth`
- Channel must have sufficient views and activity to report analytics
- **Demographic Limitation:** The `demographics` report type (age, gender) requires channel owner permissions and may not be available for all channels, especially smaller or newer channels. If unavailable, try: `devices`, `geography`, `traffic-sources`, or `subscription-status`.
---

---

#### 18. List Report Types

```bash
staqan-yt list-report-types [options]
```

List all available YouTube Reporting API report types for bulk data downloads.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text` (default: `table`)
- `-v, --verbose` - Enable verbose output with debug information

**Examples:**
```bash
# List all report types
staqan-yt list-report-types

# JSON output
staqan-yt list-report-types --output json
```

---

#### 19. List Report Jobs

```bash
staqan-yt list-report-jobs [options]
```

List YouTube Reporting API jobs with status, expiration warnings, and sliding window information.

**Options:**
- `--type <id>` - Filter by report type ID (e.g., `channel_reach_basic_a1`)
- `--output <format>` - Output format: `json`, `table`, `text` (default: `table`)
- `-v, --verbose` - Enable verbose output with debug information

**Examples:**
```bash
# List all jobs
staqan-yt list-report-jobs

# List jobs for specific report type
staqan-yt list-report-jobs --type=channel_reach_basic_a1
```

**Sample Output:**
```
Job ID:     39b972ed-68b3-470a-8521-5cd50adc7b43
Report Type: channel_reach_basic_a1
Name:       channel_reach_basic_a1 Report Job
Created:    2026-02-20T17:43:35Z
Status:     Active (11 days ago)

  Reports: 47 available
    Latest: 2026-03-02 to 2026-03-03 (created 2026-03-04T00:34:10Z)
    Oldest: 2026-02-24 to 2026-02-25 (created 2026-02-26T06:53:07Z)

📊 Sliding window phase: Growing (will stabilize at 60 days around 2026-04-20)
⚠️  Reports expire after 30 days (historical) or 60 days (regular)
💡 Download reports before expiration to avoid data loss
```

---

#### 20. Get Report Data

```bash
staqan-yt get-report-data --type <id> [options]
```

Get YouTube Reporting API report data (thumbnail impressions, CTR, etc.). Automatically creates jobs if needed.

**Required:**
- `--type <id>` - Report type ID (e.g., `channel_reach_basic_a1` for thumbnail data)

**Options:**
- `--video-id <id>` - Filter by video ID
- `--start-date <date>` - Start date (YYYY-MM-DD)
- `--end-date <date>` - End date (YYYY-MM-DD)
- `--output <format>` - Output format: `json`, `csv` (default: `json`)
- `-v, --verbose` - Enable verbose output with debug information

**Common Report Types:**

| Report Type | Contains | Use For |
|-------------|----------|---------|
| `channel_reach_basic_a1` | Thumbnail impressions, CTR | Thumbnail performance |
| `channel_reach_combined_a1` | CTR + traffic sources + devices | Detailed CTR breakdown |

**Examples:**
```bash
# Get latest data for all videos
staqan-yt get-report-data --type=channel_reach_basic_a1

# Get data for specific video
staqan-yt get-report-data --type=channel_reach_basic_a1 --video-id=eeYl2dxv57g

# Get date range
staqan-yt get-report-data --type=channel_reach_basic_a1 \
  --start-date=2026-02-24 \
  --end-date=2026-03-02

# CSV output
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv
```

**Sample Output:**
```json
[
  {
    "date": "20260228",
    "channel_id": "UCBQQNUsrd9mgCjsrLogKW6Q",
    "video_id": "eeYl2dxv57g",
    "video_thumbnail_impressions": "18",
    "video_thumbnail_impressions_ctr": "0"
  }
]
```

**Important Notes:**

⚠️ **48-Hour Initial Wait**
- First-time job creation requires 48 hours for first report
- After 48h: daily reports generated automatically
- Job runs forever (no need to recreate)

⚠️ **Data Expiration (Sliding Window)**
- Historical reports: 30 days from creation
- Regular reports: 60 days from creation
- Once stable: 60-day rolling window
- **Download before expiration or lose data forever**

⚠️ **Date Range Limitations**
- Cannot retrieve data older than 60 days (unless downloaded previously)
- Expired data is permanently deleted from YouTube's servers
- Error messages will indicate missing date ranges

**Setup Steps:**
1. Enable YouTube Reporting API: https://console.cloud.google.com/apis/library/youtubereporting.googleapis.com
2. Re-authenticate: `staqan-yt auth`
3. Run `staqan-yt get-report-data --type=channel_reach_basic_a1`
4. **Wait 48 hours** for first report
5. Run again to fetch data

---
### Localization Features

**Supported Languages:**
- English (en, English, english, eng)
- Japanese (ja, Japanese, japanese, jpn, jp)
- Russian (ru, Russian, russian, rus)

**Language Input:**
- Case-insensitive: `Japanese`, `JAPANESE`, `japanese` all work
- Accepts ISO codes: `ja`, `en`, `ru`
- Accepts full names: `Japanese`, `English`, `Russian`

**Main Metadata vs Localizations:**
- Main metadata: The video's primary title/description (stored in `snippet`)
- Localizations: Additional language versions (stored in `localizations`)
- The main metadata language is detected automatically from `snippet.defaultLanguage`

---

### Global Options

All commands support:
- `-h, --help` - Display help information
- `-V, --version` - Display version number

## Use Cases

### Batch Update Video Titles

```bash
# Get all videos as JSON
staqan-yt channel-videos @mychannel --output json > videos.json

# Parse and update each video
cat videos.json | jq -r '.[].id' | while read id; do
  staqan-yt update-metadata "$id" --title "Updated: $(date +%Y-%m-%d)" --yes
done
```

### Find All Videos in a Series

```bash
staqan-yt search-channel @mychannel "Part" --limit 100 --output json | \
  jq -r '.[] | "\(.title) - \(.id)"'
```

### Export Video Statistics

```bash
# Get video IDs
staqan-yt channel-videos @mychannel --output json | jq -r '.[].id' > ids.txt

# Get detailed info for each
cat ids.txt | xargs staqan-yt video-info --output json > stats.json
```

## Configuration Files

The CLI stores configuration in `~/.staqan-yt-cli/`:

```
~/.staqan-yt-cli/
├── credentials.json    # OAuth client credentials
└── token.json          # Authentication token (auto-generated)
```

**Important:** Keep these files secure and never commit them to version control.

## Troubleshooting

### "Credentials not found" Error

Make sure you've saved your OAuth credentials to `~/.staqan-yt-cli/credentials.json`

### "No authentication token found" Error

Run `staqan-yt auth` to authenticate.

### "Failed to refresh token" Error

Your token has expired. Re-authenticate with `staqan-yt auth`

### "Channel not found" Error

- Verify the channel handle/ID is correct
- Try using the channel URL instead
- Make sure the channel is public

### API Quota Exceeded

YouTube Data API has daily quotas. If exceeded:
- Wait 24 hours for quota reset
- Request quota increase in Google Cloud Console
- Optimize your queries to use fewer API calls

## Development

### Running Locally

```bash
# Install dependencies
bun install

# Run CLI in development mode
bun run dev <command>

# Or build a single-file executable
bun build ./bin/staqan-yt.ts --compile --outfile staqan-yt
./staqan-yt <command>
```

### Project Structure

```
staqan-yt-cli/
├── bin/
│   └── staqan-yt.ts                    # CLI entry point
├── lib/
│   ├── auth.ts                         # OAuth authentication
│   ├── youtube.ts                      # YouTube API wrapper
│   ├── language.ts                     # Language mapping utility
│   └── utils.ts                        # Helper functions
├── commands/
│   ├── auth.ts                         # Auth command
│   ├── channel-videos.ts               # Channel videos command
│   ├── video-info.ts                   # Video info command
│   ├── update-metadata.ts              # Update metadata command
│   ├── search-channel.ts               # Search channel command
│   ├── get-video-localizations.ts      # Get all localizations command
│   ├── get-video-localization.ts       # Get single localization command
│   ├── put-video-localization.ts       # Create localization command
│   └── update-video-localization.ts    # Update localization command
├── types/
│   └── index.ts                        # TypeScript type definitions
├── Formula/
│   └── staqan-yt.rb                    # Homebrew formula (source-based)
├── package.json
├── tsconfig.json                       # TypeScript configuration
├── CLAUDE.md                           # Development guidelines
└── README.md
```

## API Rate Limits

YouTube Data API v3 has the following limits:
- **Quota:** 10,000 units per day (default)
- **Queries per second:** 100 QPS per user

Cost per operation:
- `search.list`: 100 units
- `videos.list`: 1 unit
- `channels.list`: 1 unit
- `playlistItems.list`: 1 unit
- `videos.update`: 50 units

Plan your usage accordingly to stay within quotas.

## Security

- Never commit `credentials.json` or `token.json` to version control
- Keep your OAuth client secret secure
- Tokens expire and are automatically refreshed
- Use environment-specific credentials for production

## License

MIT

## Author

STAQAN

## Support

For issues and feature requests, please create an issue on GitHub.

---

**Note:** This CLI uses the YouTube Data API v3. Make sure you comply with [YouTube's Terms of Service](https://www.youtube.com/t/terms) and [API Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service).
