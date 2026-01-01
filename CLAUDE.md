# staqan-yt-cli Development Guide

## Project Overview

A command-line interface for managing YouTube videos and metadata using the YouTube Data API v3. Built with Node.js and designed for programmatic YouTube channel management.

## Architecture Principles

### 1. Clean Separation of Concerns

**This CLI is PURELY programmatic** - it handles YouTube API operations only:
- Fetch video metadata
- List channel videos
- Search videos
- Update video metadata
- OAuth 2.0 authentication

**Semantic/analytical tasks belong elsewhere** (e.g., in project-specific CLAUDE.md files):
- Subtitle analysis
- Content strategy
- Metadata generation logic
- Language-specific tone guidance

### 2. AWS API Naming Conventions

**CRITICAL**: All commands must follow AWS API naming conventions:

**Singular = Single-item operations**
```bash
get-video <videoId>        # Get ONE video
update-video <videoId>     # Update ONE video
delete-video <videoId>     # Delete ONE video (if added)
```

**Plural = Batch/list operations**
```bash
get-videos <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos <channel>      # List videos in channel
search-videos <ch> <query> # Search multiple videos
```

**Naming pattern:**
- Use `get-` for retrieving resources
- Use `list-` for listing collections
- Use `update-` for modifying resources
- Use `delete-` for removing resources
- Use `search-` for querying resources
- Use singular nouns for single-item operations
- Use plural nouns for batch/list operations

### 3. Credential Management

**All credentials stored in**: `~/.staqan-yt-cli/`

**Files:**
- `credentials.json` - OAuth 2.0 client credentials
- `token.json` - User access/refresh tokens (auto-generated)

**Never store credentials:**
- In the repo
- In project directories
- In environment variables (use the centralized location)

## Code Structure

```
staqan-yt-cli/
├── bin/
│   └── staqan-yt.js          # Main CLI entry point, command routing
├── lib/
│   ├── auth.js               # OAuth 2.0 authentication logic
│   ├── youtube.js            # YouTube Data API wrapper
│   └── utils.js              # Helper utilities (chalk, ora, paths)
├── commands/
│   ├── auth.js               # Authentication command
│   ├── channel-videos.js     # List videos command
│   ├── video-info.js         # Get video(s) command
│   ├── update-metadata.js    # Update video command
│   └── search-channel.js     # Search videos command
├── package.json
├── README.md                 # User-facing documentation
└── CLAUDE.md                 # This file - development guide
```

## Adding New Commands

### Step 1: Choose the Correct Name

Follow AWS conventions:
- **Single-item operation?** Use singular noun: `get-playlist`, `update-comment`
- **Batch/list operation?** Use plural noun: `get-playlists`, `list-comments`

### Step 2: Create Command File

Create `commands/your-command.js`:

```javascript
const { success, error, info } = require('../lib/utils');
const { getAuthenticatedClient } = require('../lib/auth');
const { google } = require('googleapis');

async function yourCommand(args, options) {
  try {
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    // Your logic here

    success('Operation completed!');
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

module.exports = yourCommand;
```

### Step 3: Register in bin/staqan-yt.js

```javascript
const yourCommand = require('../commands/your-command');

program
  .command('your-command <arg>')
  .description('Description following AWS style')
  .option('-j, --json', 'Output in JSON format')
  .action(yourCommand);
```

### Step 4: Update Documentation

- Add to README.md (user docs)
- Add examples to QUICK_START.md if applicable

## YouTube Data API v3 Guidelines

### Required Scopes

```javascript
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',      // Read operations
  'https://www.googleapis.com/auth/youtube.force-ssl',     // Write operations
];
```

### Common Operations

**Get video details:**
```javascript
const response = await youtube.videos.list({
  part: 'snippet,statistics,contentDetails',
  id: videoIds.join(',')
});
```

**List channel videos:**
```javascript
// First get uploads playlist ID
const channelResponse = await youtube.channels.list({
  part: 'contentDetails',
  forUsername: username
});

// Then get videos from playlist
const playlistResponse = await youtube.playlistItems.list({
  part: 'snippet',
  playlistId: uploadsPlaylistId,
  maxResults: 50
});
```

**Update video metadata:**
```javascript
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

### API Quotas

**Default quota:** 10,000 units/day

**Cost per operation:**
- Read operations: 1 unit
- Write operations: 50 units
- List operations: 1-100 units (depends on parts)

**Be mindful of quota usage** - batch operations when possible.

## Error Handling

### User-Friendly Errors

```javascript
try {
  // operation
} catch (err) {
  if (err.code === 403) {
    error('API quota exceeded. Try again tomorrow.');
  } else if (err.code === 404) {
    error('Video not found. Check the video ID.');
  } else {
    error(`Failed: ${err.message}`);
  }
  process.exit(1);
}
```

### Authentication Errors

```javascript
if (!token) {
  throw new Error('No authentication token found. Please run: staqan-yt auth');
}
```

## Output Formatting

### JSON Output (--json flag)

```javascript
if (options.json) {
  console.log(JSON.stringify(data, null, 2));
  return;
}
```

### Terminal Output (default)

Use chalk for colors:
```javascript
const chalk = require('chalk');

console.log(chalk.cyan('Video ID:'), videoId);
console.log(chalk.green('✓'), 'Title:', title);
console.log(chalk.yellow('Views:'), viewCount);
```

Use ora for spinners:
```javascript
const ora = require('ora');

const spinner = ora('Fetching videos...').start();
// ... operation ...
spinner.succeed('Videos fetched!');
```

## Testing

### Manual Testing

```bash
# Test authentication
staqan-yt auth

# Test get single video
staqan-yt get-video dQw4w9WgXcQ --json

# Test get multiple videos
staqan-yt get-videos dQw4w9WgXcQ abc123xyz --json

# Test list videos
staqan-yt list-videos @mkbhd --limit 5 --json

# Test update (dry run)
staqan-yt update-video dQw4w9WgXcQ --title "Test" --dry-run
```

### Local Development

```bash
# Install dependencies
npm install

# Link for global testing
npm link

# Test commands
staqan-yt --help
```

## Git Workflow

### Commit Message Format

Follow the established pattern:

```
Brief description of change

Detailed explanation if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Before Committing

- [ ] Test all affected commands
- [ ] Update README.md if adding/changing commands
- [ ] Update QUICK_START.md if changing common workflows
- [ ] Follow AWS naming conventions
- [ ] Ensure credentials never committed

## Common Pitfalls

### ❌ Don't Do This

```javascript
// Don't hardcode credentials
const CLIENT_ID = 'hardcoded-id'; // NEVER

// Don't use inconsistent naming
program.command('getVideo'); // Wrong casing
program.command('video-get'); // Wrong order

// Don't mix singular/plural incorrectly
program.command('get-videos <videoId>'); // Should be get-video

// Don't put semantic logic here
async function analyzeSubtitles() { } // Belongs in project CLAUDE.md
```

### ✅ Do This

```javascript
// Load credentials from standard location
const credentials = await loadCredentials(); // From ~/.staqan-yt-cli/

// Use AWS-style naming
program.command('get-video <videoId>');    // Singular
program.command('get-videos <ids...>');    // Plural batch

// Keep it programmatic
async function getVideoMetadata(videoId) {
  // Pure API operation
}
```

## Dependencies

### Core Dependencies

- `googleapis` - YouTube Data API client
- `google-auth-library` - OAuth 2.0
- `commander` - CLI framework
- `chalk` - Terminal colors
- `ora` - Loading spinners
- `open` - Open browser for OAuth

### When Adding Dependencies

- Prefer official Google libraries
- Keep bundle size reasonable
- Document in package.json
- Test on clean install

## Future Enhancements

### Potential Commands (following AWS conventions)

**Playlist management:**
- `get-playlist <playlistId>` - Get single playlist
- `get-playlists <id1> <id2>` - Get multiple playlists
- `list-playlists <channelId>` - List channel playlists
- `create-playlist` - Create new playlist
- `update-playlist <playlistId>` - Update playlist
- `delete-playlist <playlistId>` - Delete playlist

**Comment management:**
- `get-comment <commentId>` - Get single comment
- `list-comments <videoId>` - List video comments
- `update-comment <commentId>` - Update comment
- `delete-comment <commentId>` - Delete comment

**Channel management:**
- `get-channel <channelId>` - Get channel info
- `update-channel` - Update channel metadata

**Captions:**
- `list-captions <videoId>` - List available captions
- `download-caption <captionId>` - Download caption file
- `upload-caption <videoId>` - Upload new caption

### When Adding Features

1. Check if it fits the "programmatic YouTube API operations" scope
2. Use AWS naming conventions
3. Add appropriate OAuth scopes if needed
4. Document in README and QUICK_START
5. Test with real YouTube data

## Security Considerations

### OAuth Token Security

- Tokens stored in `~/.staqan-yt-cli/token.json`
- File permissions: Read/write for user only
- Never log tokens
- Auto-refresh expired tokens

### Input Validation

```javascript
// Validate video IDs (11 characters, alphanumeric + - _)
if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
  error('Invalid video ID format');
  process.exit(1);
}
```

## Maintenance

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update carefully
npm update

# Test after updates
npm test  # (when tests are added)
```

### Breaking Changes

If YouTube API changes:
1. Update googleapis dependency
2. Test all commands
3. Update documentation
4. Increment major version

## Support

### GitHub Issues

Report bugs at: https://github.com/prog893/staqan-yt-cli/issues

### When Users Report Issues

1. Check if it's an API quota issue
2. Verify OAuth credentials are set up correctly
3. Test with the reporter's exact command
4. Check YouTube API status

## Quick Reference

**Install globally:**
```bash
npm link
```

**Test command:**
```bash
staqan-yt get-video dQw4w9WgXcQ
```

**AWS naming:**
- Singular: `get-video`, `update-video`
- Plural: `get-videos`, `list-videos`, `search-videos`

**Credentials location:**
```
~/.staqan-yt-cli/
├── credentials.json
└── token.json
```
