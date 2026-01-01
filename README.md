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
- **JSON Output** - Machine-readable output for automation
- **User-Friendly Interface** - Colorful output with loading spinners

## Installation

### Prerequisites

- Node.js 14.0.0 or higher
- npm or yarn
- Google Cloud Project with YouTube Data API v3 enabled

### Install from Source

```bash
# Clone the repository
cd /Users/prog893/Desktop/staqan-yt-cli

# Install dependencies
npm install

# Link the CLI globally (optional)
npm link
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

## Authentication

Run the auth command to authenticate:

```bash
staqan-yt auth
```

This will:
1. Open your browser for Google OAuth consent
2. Save the authentication token to `~/.staqan-yt-cli/token.json`
3. Allow you to use all CLI commands

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
staqan-yt get-video dQw4w9WgXcQ --json
```

#### get-videos (plural - batch operation)
Get metadata for multiple videos:
```bash
staqan-yt get-videos dQw4w9WgXcQ abc123xyz def456uvw --json
```

#### list-videos
List all videos from a channel:
```bash
staqan-yt list-videos @channelname --limit 50 --json
```

#### search-videos
Search for videos within a channel:
```bash
staqan-yt search-videos @channelname "keyword" --json
```

#### update-video (singular)
Update a single video's metadata:
```bash
staqan-yt update-video dQw4w9WgXcQ --title "New Title" --description "New Desc" --dry-run
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

#### 2. List Channel Videos

```bash
staqan-yt channel-videos <channelHandle> [options]
```

List all videos from a YouTube channel.

**Arguments:**
- `channelHandle` - Channel @handle, username, or URL

**Options:**
- `-j, --json` - Output in JSON format
- `-l, --limit <number>` - Limit number of results (default: 50)

**Examples:**

```bash
# Using @handle
staqan-yt channel-videos @mkbhd

# Using channel URL
staqan-yt channel-videos https://www.youtube.com/@mkbhd

# Limit results and JSON output
staqan-yt channel-videos @mkbhd --limit 10 --json
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
- `-j, --json` - Output in JSON format

**Examples:**

```bash
# Single video
staqan-yt video-info dQw4w9WgXcQ

# Multiple videos
staqan-yt video-info dQw4w9WgXcQ abc123xyz78

# Using URLs
staqan-yt video-info https://youtube.com/watch?v=dQw4w9WgXcQ

# JSON output
staqan-yt video-info dQw4w9WgXcQ --json
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
staqan-yt search-channel <channelHandle> <query> [options]
```

Search for videos within a channel by keyword.

**Arguments:**
- `channelHandle` - Channel @handle, username, or URL
- `query` - Search query

**Options:**
- `-j, --json` - Output in JSON format
- `-l, --limit <number>` - Limit number of results (default: 25)

**Examples:**

```bash
# Search by keyword
staqan-yt search-channel @mkbhd "smartphone review"

# Limit results
staqan-yt search-channel @mkbhd "2024" --limit 10

# JSON output
staqan-yt search-channel @mkbhd "tutorial" --json
```

**Sample Output:**
```
✓ Found 5 matching video(s)

[1] Smartphone Review 2024
  ID: dQw4w9WgXcQ
  Published: Jan 15, 2024
  URL: https://youtube.com/watch?v=dQw4w9WgXcQ

[2] Best Smartphones of 2024
  ID: abc123xyz78
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
- `-j, --json` - Output in JSON format

**Examples:**

```bash
# Get all localizations
staqan-yt get-video-localizations dQw4w9WgXcQ

# Filter specific languages
staqan-yt get-video-localizations dQw4w9WgXcQ --languages "ja,ru"

# JSON output
staqan-yt get-video-localizations dQw4w9WgXcQ --json
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
- `-j, --json` - Output in JSON format

**Examples:**

```bash
# Get main metadata language (default)
staqan-yt get-video-localization dQw4w9WgXcQ

# Get Japanese localization
staqan-yt get-video-localization dQw4w9WgXcQ --language ja

# Case-insensitive language names
staqan-yt get-video-localization dQw4w9WgXcQ --language JAPANESE

# JSON output
staqan-yt get-video-localization dQw4w9WgXcQ --language ja --json
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
staqan-yt channel-videos @mychannel --json > videos.json

# Parse and update each video
cat videos.json | jq -r '.[].id' | while read id; do
  staqan-yt update-metadata "$id" --title "Updated: $(date +%Y-%m-%d)" --yes
done
```

### Find All Videos in a Series

```bash
staqan-yt search-channel @mychannel "Part" --limit 100 --json | \
  jq -r '.[] | "\(.title) - \(.id)"'
```

### Export Video Statistics

```bash
# Get video IDs
staqan-yt channel-videos @mychannel --json | jq -r '.[].id' > ids.txt

# Get detailed info for each
cat ids.txt | xargs staqan-yt video-info --json > stats.json
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
npm install

# Run CLI
node bin/staqan-yt.js <command>

# Or link globally
npm link
staqan-yt <command>
```

### Project Structure

```
staqan-yt-cli/
├── bin/
│   └── staqan-yt.js                    # CLI entry point
├── lib/
│   ├── auth.js                         # OAuth authentication
│   ├── youtube.js                      # YouTube API wrapper
│   ├── language.js                     # Language mapping utility
│   └── utils.js                        # Helper functions
├── commands/
│   ├── auth.js                         # Auth command
│   ├── channel-videos.js               # Channel videos command
│   ├── video-info.js                   # Video info command
│   ├── update-metadata.js              # Update metadata command
│   ├── search-channel.js               # Search channel command
│   ├── get-video-localizations.js      # Get all localizations command
│   ├── get-video-localization.js       # Get single localization command
│   ├── put-video-localization.js       # Create localization command
│   └── update-video-localization.js    # Update localization command
├── package.json
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
