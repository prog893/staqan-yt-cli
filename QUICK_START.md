# Quick Start Guide

## Installation

```bash
cd /Users/prog893/Desktop/staqan-yt-cli
npm install
npm link  # Optional: makes 'staqan-yt' available globally
```

## Setup OAuth Credentials

1. **Enable YouTube Data API v3**
   - Go to: https://console.cloud.google.com/apis/library
   - Search for "YouTube Data API v3"
   - Click "Enable"

2. **Create OAuth 2.0 Credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Desktop application"
   - Download the JSON file

3. **Save Credentials**
   ```bash
   mkdir -p ~/.staqan-yt-cli
   cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
   ```

4. **Authenticate**
   ```bash
   staqan-yt auth
   ```
   Or:
   ```bash
   node bin/staqan-yt.js auth
   ```

## Common Commands

### List all videos from a channel
```bash
staqan-yt channel-videos @channelname
staqan-yt channel-videos https://www.youtube.com/@channelname
staqan-yt channel-videos @channelname --output json > videos.json
```

### Get video details
```bash
staqan-yt video-info dQw4w9WgXcQ
staqan-yt video-info dQw4w9WgXcQ abc123xyz --output json
staqan-yt video-info https://youtube.com/watch?v=dQw4w9WgXcQ
```

### Update video metadata
```bash
staqan-yt update-metadata dQw4w9WgXcQ --title "New Title"
staqan-yt update-metadata dQw4w9WgXcQ --description "New description"
staqan-yt update-metadata dQw4w9WgXcQ -t "Title" -d "Description" --dry-run
```

### Search within a channel
```bash
staqan-yt search-channel @channelname "tutorial"
staqan-yt search-channel @channelname "2024" --limit 50
```

## Running Locally (Without npm link)

```bash
cd /Users/prog893/Desktop/staqan-yt-cli
node bin/staqan-yt.js <command>
```

## Troubleshooting

### Authentication Issues
- Make sure credentials.json is in ~/.staqan-yt-cli/
- Run `staqan-yt auth` to re-authenticate
- Check that YouTube Data API v3 is enabled in Google Cloud Console

### Channel Not Found
- Try using the full channel URL
- Verify the channel is public
- Check for typos in the channel handle

### API Quota Exceeded
- YouTube API has a daily quota (10,000 units by default)
- Wait 24 hours for reset
- Each search costs 100 units, each video fetch costs 1 unit

## Example Workflows

### Bulk Export Video IDs
```bash
staqan-yt channel-videos @mychannel --output json | jq -r '.[].id' > video-ids.txt
```

### Get Statistics for All Videos
```bash
staqan-yt channel-videos @mychannel --output json | \
  jq -r '.[].id' | \
  xargs staqan-yt video-info --output json > all-stats.json
```

### Find Videos by Keyword
```bash
staqan-yt search-channel @mychannel "Part 1" --output json | \
  jq -r '.[] | "\(.publishedAt) - \(.title) - \(.id)"'
```

## File Locations

- **Credentials:** `~/.staqan-yt-cli/credentials.json`
- **Token:** `~/.staqan-yt-cli/token.json`
- **Project:** `/Users/prog893/Desktop/staqan-yt-cli`

## GitHub Repository

https://github.com/prog893/staqan-yt-cli
