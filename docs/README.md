# staqan-yt-cli Documentation

Complete documentation for the staqan-yt-cli YouTube management tool.

## Table of Contents

- [Getting Started](#getting-started)
- [Commands](#commands)
- [Configuration](#configuration)
- [Output Formats](#output-formats)
- [Troubleshooting](#troubleshooting)

## Getting Started

### [Setup & Installation](setup.md)

Complete installation guide including:
- Homebrew installation (recommended)
- Building from source
- OAuth 2.0 credentials setup
- First-time authentication

### Quick Reference

```bash
# Authenticate
staqan-yt auth

# Configure defaults
staqan-yt config set default.channel @yourchannel

# List videos
staqan-yt list-videos @yourchannel --limit 10

# Get video info
staqan-yt get-video dQw4w9WgXcQ

# Get analytics
staqan-yt get-video-analytics dQw4w9WgXcQ
```

## Commands

Commands are organized by purpose. Click to view detailed documentation:

### Video Discovery

- **[get-video](commands/video-discovery.md#get-video)** - Get detailed metadata for a single video
- **[get-videos](commands/video-discovery.md#get-videos)** - Get metadata for multiple videos (batch)
- **[search-videos](commands/video-discovery.md#search-videos)** - Search for videos

### Channel Operations

- **[get-channel](commands/channel-operations.md#get-channel)** - Get channel information
- **[list-videos](commands/channel-operations.md#list-videos)** - List all videos from a channel
- **[list-playlists](commands/channel-operations.md#list-playlists)** - List channel playlists

### Metadata Management

- **[update-video](commands/metadata-management.md#update-video)** - Update video title/description
- **[get-video-localization](commands/metadata-management.md#get-video-localization)** - Get specific language localization
- **[get-video-localizations](commands/metadata-management.md#get-video-localizations)** - Get all localizations
- **[put-video-localization](commands/metadata-management.md#put-video-localization)** - Create new localization
- **[update-video-localization](commands/metadata-management.md#update-video-localization)** - Update existing localization

### Analytics & Insights

- **[get-video-analytics](commands/analytics.md#get-video-analytics)** - Video performance metrics
- **[get-video-retention](commands/analytics.md#get-video-retention)** - Audience retention curve
- **[get-search-terms](commands/analytics.md#get-search-terms)** - Search terms for a video
- **[get-traffic-sources](commands/analytics.md#get-traffic-sources)** - Traffic source breakdown
- **[get-channel-analytics](commands/analytics.md#get-channel-analytics)** - Channel-level analytics
- **[get-channel-search-terms](commands/analytics.md#get-channel-search-terms)** - Top search keywords for channel

### Reporting API (Thumbnail CTR & Bulk Reports)

- **[list-report-types](commands/reporting-api.md#list-report-types)** - List available report types
- **[list-report-jobs](commands/reporting-api.md#list-report-jobs)** - List report jobs with status
- **[get-report-data](commands/reporting-api.md#get-report-data)** - Get report data including thumbnail CTR
- **[fetch-reports](commands/reporting-api.md#fetch-reports)** - Archive all reports to prevent data loss

### Engagement

- **[list-comments](commands/engagement.md#list-comments)** - List video comments
- **[list-captions](commands/engagement.md#list-captions)** - List caption tracks
- **[get-caption](commands/engagement.md#get-caption)** - Download caption content

### Content Management

- **[get-video-tags](commands/content-management.md#get-video-tags)** - Get video tags
- **[update-video-tags](commands/content-management.md#update-video-tags)** - Update tags (add/remove/replace)
- **[get-thumbnail](commands/content-management.md#get-thumbnail)** - Get thumbnail URLs
- **[get-playlist](commands/content-management.md#get-playlist)** - Get playlist metadata
- **[get-playlists](commands/content-management.md#get-playlists)** - Get multiple playlists

### Configuration

- **[auth](commands/configuration.md#auth)** - Authenticate with YouTube API
- **[config](commands/configuration.md#config)** - Manage configuration
- **[mcp](commands/configuration.md#mcp)** - Start MCP server for AI integration

## Configuration

### [Configuration Guide](configuration.md)

Detailed configuration documentation:
- Setting default channel
- Setting default output format
- All configuration options
- MCP server setup for Claude Desktop

### Output Formats

All commands support multiple output formats via the `--output` flag:

- **json** - Machine-readable JSON
- **csv** - RFC 4180 CSV (for Excel/spreadsheets)
- **table** - ASCII table with borders
- **text** - Tab-delimited (for Unix pipelines)
- **pretty** - Colorful, human-friendly (default)

See [Output Formats Documentation](output-formats.md) for details.

## Troubleshooting

### [Troubleshooting Guide](troubleshooting.md)

Common issues and solutions:
- Authentication errors
- API quota exceeded
- Channel not found
- Credentials setup

## Additional Resources

- [Contributing Guide](../CONTRIBUTING.md) - Development conventions and patterns
- [Development Guide](../CLAUDE.md) - AI/robot development instructions
- [YouTube Data API Docs](https://developers.google.com/youtube/v3)
- [Issue Tracker](https://github.com/prog893/staqan-yt-cli/issues)

## Command Patterns

### AWS-Style Naming

Commands follow AWS API naming conventions:

**Singular = Single-item operations:**
```bash
get-video <videoId>        # Get ONE video
update-video <videoId>     # Update ONE video
```

**Plural = Batch/list operations:**
```bash
get-videos <id1> <id2>     # Get MULTIPLE videos
list-videos <channel>      # List videos in channel
```

### Global Options

All commands support these options:

- `--output <format>` - Output format (json, csv, table, text, pretty)
- `-v, --verbose` - Enable verbose/debug output
- `-h, --help` - Show help for the command

### Date Range Syntax

Commands that accept date ranges use `YYYY-MM-DD` format:

```bash
staqan-yt get-video-analytics VIDEO_ID \
  --start-date=2026-01-01 \
  --end-date=2026-01-31
```

## Quick Examples

### Export Channel Statistics

```bash
# Get all video IDs
staqan-yt list-videos @mychannel --output json | \
  jq -r '.[].id' > video_ids.txt

# Get analytics for all videos
cat video_ids.txt | \
  xargs -I {} staqan-yt get-video-analytics {} --output csv > analytics.csv
```

### Find Underperforming Videos

```bash
# Get videos with low views
staqan-yt list-videos @mychannel --limit 100 --output json | \
  jq '.[] | select(.viewCount | tonumber < 1000) | {title, viewCount}'
```

### Archive Thumbnail CTR Data

```bash
# Download all thumbnail CTR reports
staqan-yt fetch-reports --type=channel_reach_basic_a1

# Get CTR for specific video
staqan-yt get-report-data --type=channel_reach_basic_a1 --video-id=VIDEO_ID
```

### Batch Update Localizations

```bash
# Update Japanese titles for all videos
staqan-yt list-videos @mychannel --output json | \
  jq -r '.[].id' | \
  xargs -I {} staqan-yt update-video-localization {} \
    --language ja \
    --title "新しいタイトル" \
    --yes
```
