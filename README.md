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
- **Thumbnail CTR Data** - Access thumbnail impressions and click-through rate via YouTube Reporting API
- **Report Archival** - Download and cache reports to prevent data loss (30-60 day expiration)
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

**Reporting API (Thumbnail CTR & Bulk Reports):**
- `youtube_list_report_types` - List available YouTube Reporting API report types
- `youtube_list_report_jobs` - List report jobs with status and expiration warnings
- `youtube_get_report_data` - Get report data including thumbnail impressions and CTR (ONLY available via Reporting API)
- `youtube_fetch_reports` - Download and cache all reports for archival (prevents data loss)

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

### Setup & Configuration

#### Authentication

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

#### Configuration Management

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

---

### Channel

#### Get Channel Information

```bash
staqan-yt get-channel [channelHandle] [options]
```

Get detailed metadata for a YouTube channel.

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)

---

#### Get Channel Analytics

```bash
staqan-yt get-channel-analytics [channelHandle] [options]
```

Get channel-level analytics reports (demographics, devices, geography, traffic sources, subscription status).

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--report-type <type>` - Report type: `demographics`, `devices`, `geography`, `traffic-sources`, `subscription-status` (default: `demographics`)
- `--start-date <date>` - Start date (YYYY-MM-DD, default: 30 days ago)
- `--end-date <date>` - End date (YYYY-MM-DD, default: today)
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

**Example:**
```bash
# View device type breakdown
staqan-yt get-channel-analytics --report-type devices

# Geography data for last 90 days
staqan-yt get-channel-analytics --report-type geography --start-date 2024-01-01 --output csv
```

---

#### List Channel Playlists

```bash
staqan-yt list-playlists [channelHandle] [options]
```

List all playlists from a YouTube channel.

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)
- `-l, --limit <number>` - Limit number of results (default: 50)

---

### Video Discovery

#### List Channel Videos

```bash
staqan-yt list-videos [channelHandle] [options]
```

List all videos from a YouTube channel.

**Arguments:**
- `channelHandle` - (Optional) Channel @handle, username, or URL. Uses `default.channel` from config if not provided.

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)
- `-l, --limit <number>` - Limit number of results (default: 50)

**Examples:**

```bash
# Using @handle
staqan-yt list-videos @mkbhd

# Using channel URL
staqan-yt list-videos https://www.youtube.com/@mkbhd

# Limit results and JSON output
staqan-yt list-videos @mkbhd --limit 10 --output json
```

---

#### Get Video Information

```bash
staqan-yt get-video <videoId> [options]
```

Get detailed metadata for a single video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)

---

#### Get Multiple Videos

```bash
staqan-yt get-videos <videoIds...> [options]
```

Get detailed metadata for multiple videos in batch.

**Arguments:**
- `videoIds` - One or more video IDs or URLs

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)

---

#### Search Videos

```bash
staqan-yt search-videos <query> [options]
```

Search for videos on YouTube or within a specific channel.

**Arguments:**
- `query` - Search query string

**Options:**
- `--global` - Search all of YouTube (instead of default channel)
- `--channel <handle>` - Search within specific channel
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)

**Examples:**

```bash
# Global search (all of YouTube)
staqan-yt search-videos "craft beer tutorial" --global

# Channel-specific search
staqan-yt search-videos "smartphone review" --channel @mkbhd

# Using config default
staqan-yt search-videos "smartphone review"  # Uses default.channel from config

# With output format
staqan-yt search-videos "python tutorial" --global --output json
```

---

### Video Metadata

#### Update Video

```bash
staqan-yt update-video <videoId> [options]
```

Update video title and/or description.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--title <string>` - New video title
- `--description <string>` - New video description
- `--dry-run` - Validate without making changes

**Example:**
```bash
staqan-yt update-video dQw4w9WgXcQ --title "New Title" --description "New Desc" --dry-run
```

---

#### Get Video Tags

```bash
staqan-yt get-video-tags <videoId> [options]
```

Get video tags.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `text` (default: `text`)

---

#### Update Video Tags

```bash
staqan-yt update-video-tags <videoId> [options]
```

Update video tags (replace, add, or remove).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--replace <tags>` - Replace all tags (comma-separated)
- `--add <tags>` - Add tags (comma-separated)
- `--remove <tags>` - Remove tags (comma-separated)
- `--dry-run` - Validate without making changes

**Examples:**
```bash
# Replace all tags
staqan-yt update-video-tags dQw4w9WgXcQ --replace "tech,review,2024"

# Add tags
staqan-yt update-video-tags dQw4w9WgXcQ --add "new,tag"

# Remove tags
staqan-yt update-video-tags dQw4w9WgXcQ --remove "old,tag"
```

---

#### Get Thumbnail

```bash
staqan-yt get-thumbnail <videoId> [options]
```

Get video thumbnail URLs.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `text` (default: `text`)

---

### Localizations

#### Get Video Localizations

```bash
staqan-yt get-video-localizations <videoIds...> [options]
```

Get all video localizations including main metadata language. Supports multiple videos.

**Arguments:**
- `videoIds` - One or more video IDs or URLs

**Options:**
- `--languages <codes>` - Filter by languages (comma-separated, e.g., "en,es,ja")
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

#### Get Video Localization

```bash
staqan-yt get-video-localization <videoId> [options]
```

Get specific video localization (defaults to main metadata language).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--lang <code>` - Language code (e.g., "en", "es", "ja")
- `--output <format>` - Output format: `json`, `pretty` (default: `pretty`)

---

#### Put Video Localization

```bash
staqan-yt put-video-localization <videoId> [options]
```

Create new video localization (fails if already exists).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--lang <code>` - Language code (required)
- `--title <string>` - Localized title (required)
- `--description <string>` - Localized description

---

#### Update Video Localization

```bash
staqan-yt update-video-localization <videoId> [options]
```

Update existing video localization (fails if does not exist).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--lang <code>` - Language code (required)
- `--title <string>` - Localized title
- `--description <string>` - Localized description

---

### Analytics & Insights

#### Get Video Analytics

```bash
staqan-yt get-video-analytics <videoId> [options]
```

Get video performance analytics (views, watch time, CTR, etc.).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--start-date <date>` - Start date (YYYY-MM-DD, default: video publish date)
- `--end-date <date>` - End date (YYYY-MM-DD, default: today)
- `--metrics <list>` - Comma-separated metrics (default: views,estimatedMinutesWatched,etc.)
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

#### Get Video Retention

```bash
staqan-yt get-video-retention <videoId> [options]
```

Get audience retention curve (% of viewers at each point in video).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--start-date <date>` - Start date (YYYY-MM-DD)
- `--end-date <date>` - End date (YYYY-MM-DD)
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

#### Get Search Terms

```bash
staqan-yt get-search-terms <videoId> [options]
```

Get YouTube search terms that led viewers to this video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

#### Get Traffic Sources

```bash
staqan-yt get-traffic-sources <videoId> [options]
```

Get traffic source breakdown (search, suggested, external, etc.).

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

### Reporting API

> **💡 Important Note:** Thumbnail CTR (Click-Through Rate) data is **ONLY available** through the YouTube Reporting API, not the regular YouTube Analytics API. Use `get-report-data` with `--type=channel_reach_basic_a1` to access thumbnail impressions and CTR metrics.

#### List Report Types

```bash
staqan-yt list-report-types [options]
```

List all available YouTube Reporting API report types.

**Options:**
- `--output <format>` - Output format: `json`, `table` (default: `table`)

---

#### List Report Jobs

```bash
staqan-yt list-report-jobs [options]
```

List YouTube Reporting API jobs with status and expiration warnings.

**Options:**
- `--output <format>` - Output format: `json`, `table` (default: `table`)

---

#### Get Report Data

```bash
staqan-yt get-report-data [options]
```

Get YouTube Reporting API report data (thumbnail impressions, CTR, etc.).

**Options:**
- `--type <id>` - Report type ID (e.g., `channel_reach_basic_a1`)
- `--video-id <id>` - Filter by video ID
- `--start-date <date>` - Start date (YYYY-MM-DD)
- `--end-date <date>` - End date (YYYY-MM-DD)
- `--output <format>` - Output format: `json`, `csv`, `text`, `pretty` (default: `pretty`)

**Example:**
```bash
# Get CTR data for specific video
staqan-yt get-report-data --type=channel_reach_basic_a1 --video-id=eeYl2dxv57g

# Get all data for date range
staqan-yt get-report-data --type=channel_reach_basic_a1 --start-date=2026-02-01 --end-date=2026-02-28
```

> **⚡ Performance Tip:** The `get-report-data` command automatically caches downloaded reports. Subsequent requests for the same date range will be instant (loaded from cache).

---

#### Fetch Reports (Archival)

```bash
staqan-yt fetch-reports [options]
```

Download and cache all available report data for archival. This command downloads reports to prevent data loss when YouTube expires reports (30-60 days).

**Options:**
- `-t, --type <id>` - Fetch specific report type
- `-T, --types <ids>` - Fetch multiple report types (comma-separated)
- `--start-date <date>` - Filter by start date (YYYY-MM-DD)
- `--end-date <date>` - Filter by end date (YYYY-MM-DD)
- `-f, --force` - Re-download even if cached
- `--verify` - Verify cached file completeness
- `-v, --verbose` - Enable verbose output

**Example:**
```bash
# Archive all thumbnail CTR reports
staqan-yt fetch-reports --type=channel_reach_basic_a1

# Archive all report types
staqan-yt fetch-reports

# Verify cached files
staqan-yt fetch-reports --verify
```

> **💡 Why Use This?** YouTube reports expire after 30-60 days and are permanently deleted. Use `fetch-reports` periodically to archive your data before it disappears.

---

### Playlist

#### Get Playlist

```bash
staqan-yt get-playlist <playlistId> [options]
```

Get detailed metadata for a single playlist.

**Arguments:**
- `playlistId` - Playlist ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `pretty` (default: `pretty`)

---

#### Get Playlists

```bash
staqan-yt get-playlists <playlistIds...> [options]
```

Get detailed metadata for multiple playlists in batch.

**Arguments:**
- `playlistIds` - One or more playlist IDs or URLs

**Options:**
- `--output <format>` - Output format: `json`, `pretty` (default: `pretty`)

---

### Comments & Captions

#### List Comments

```bash
staqan-yt list-comments <videoId> [options]
```

List comments for a YouTube video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `csv`, `text`, `pretty` (default: `pretty`)

---

#### List Captions

```bash
staqan-yt list-captions <videoId> [options]
```

List all caption tracks for a YouTube video.

**Arguments:**
- `videoId` - Video ID or URL

**Options:**
- `--output <format>` - Output format: `json`, `table`, `text`, `pretty` (default: `pretty`)

---

#### Get Caption

```bash
staqan-yt get-caption <captionId> [options]
```

Download caption content to stdout (get caption ID from list-captions).

**Arguments:**
- `captionId` - Caption track ID

**Options:**
- `--format <srt|vtt>` - Output format (default: `srt`)

---

### Other Commands

#### MCP Server

```bash
staqan-yt mcp
```

Start MCP server for AI assistant integration.

---

#### Help

```bash
staqan-yt help [command]
```

Display help for a specific command.

---

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
├── docs/
│   └── CLI_PATTERNS.md                 # CLI patterns and conventions
└── README.md
```

### Code Patterns and Conventions

When contributing new commands or features, follow the established patterns documented in **[docs/CLI_PATTERNS.md](docs/CLI_PATTERNS.md)**:

- **Spinner Progress** - Use ora spinner with counter for multi-item operations
- **Output Formatting** - Support json, csv, table, text, and pretty formats
- **Error Handling** - Use spinner.fail() with descriptive messages
- **Verbose Mode** - Support --verbose flag with debug() logging
- **Date Chunking** - Handle API date limits with chunkDateRange()

Example:
```typescript
const spinner = ora('Processing...').start();

for (let i = 0; i < items.length; i++) {
  spinner.text = `Processing ${i + 1}/${items.length}...`;
  // ... work ...
}

spinner.succeed(`Processed ${items.length} item(s)`);
```

See **[docs/CLI_PATTERNS.md](docs/CLI_PATTERNS.md)** for detailed patterns and examples.

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
