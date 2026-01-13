# staqan-yt-cli Development Guide

## Project Overview

A command-line interface for managing YouTube videos and metadata using the YouTube Data API v3. Built with Node.js and designed for programmatic YouTube channel management.

## 🤖 Subagent Development Workflow

**When a subagent is spawned to work on this tool:**

1. **Read this CLAUDE.md first** - Understand architecture and conventions
2. **Make changes** following AWS naming conventions and best practices
3. **Test changes** manually with example commands
4. **Commit all changes**:
   ```bash
   git add -A
   git commit -m "Description

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```
5. **Release new patch version** (see Release Process section below):
   - Run `npm version patch` (automatically syncs version everywhere)
   - Push with tags
6. **Push to GitHub**:
   ```bash
   git push && git push --tags
   ```
7. **Verify clean state**:
   ```bash
   git status  # Should show "working tree clean"
   ```
8. **Return to parent** only after everything is committed, released, and pushed

**Do NOT return from subagent execution with uncommitted changes or without releasing a new version.**

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

### 4. Configuration Management

**Configuration file location**: `~/.staqan-yt-cli/config.json`

**Available configuration options:**
- `default.channel` - Default channel handle/ID for list-videos and search-videos
- `default.output` - Default output format: `json`, `table`, `text`, `pretty`, or `csv` (defaults to `pretty`)

**How configuration works:**
- Config values are loaded when commands execute
- CLI flags always override config defaults
- Optional parameters use config values when not provided
- Configuration is managed via the `config` command

**Example workflow:**
```bash
# Set defaults
staqan-yt config set default.channel @staqan
staqan-yt config set default.output csv

# Commands now use these defaults
staqan-yt list-videos --limit 5        # Uses @staqan, outputs CSV
staqan-yt search-videos "craft beer"   # Uses @staqan, outputs CSV

# Override when needed
staqan-yt list-videos @otherChannel --output json    # Explicit format overrides config
```

**Implementation pattern:**
```typescript
// In command files
import { getConfigValue, getOutputFormat } from '../lib/config';

// Load default channel if not provided
let channel = channelHandle || await getConfigValue('default.channel');

// Determine output format (flag takes precedence over config)
const outputFormat = await getOutputFormat(options.output);
```

## Code Structure

```
staqan-yt-cli/
├── bin/
│   └── staqan-yt.ts          # Main CLI entry point, command routing
├── lib/
│   ├── auth.ts               # OAuth 2.0 authentication logic
│   ├── youtube.ts            # YouTube Data API wrapper
│   ├── language.ts           # Language mapping utilities
│   ├── config.ts             # Configuration management utilities
│   └── utils.ts              # Helper utilities (chalk, ora, paths)
├── commands/
│   ├── auth.ts               # Authentication command
│   ├── config.ts             # Configuration management command
│   ├── channel-videos.ts     # List videos command
│   ├── video-info.ts         # Get video(s) command
│   ├── update-metadata.ts    # Update video command
│   ├── search-channel.ts     # Search videos command
│   ├── get-video-localizations.ts   # Get all localizations
│   ├── get-video-localization.ts    # Get single localization
│   ├── put-video-localization.ts    # Create localization
│   └── update-video-localization.ts # Update localization
├── types/
│   └── index.ts              # Shared TypeScript type definitions
├── dist/                     # Compiled JavaScript output (gitignored)
├── tsconfig.json             # TypeScript configuration
├── eslint.config.mjs         # ESLint configuration
├── package.json
├── README.md                 # User-facing documentation
└── CLAUDE.md                 # This file - development guide
```

## TypeScript Development

### TypeScript Configuration

This project uses TypeScript with strict type checking enabled. Key configuration:

**tsconfig.json:**
- Target: ES2020 (Node.js appropriate)
- Module: CommonJS (for CLI compatibility)
- Strict mode: enabled
- Output directory: `dist/`
- Source maps and declaration files enabled

**Build Process:**
```bash
npm run build         # Compile TypeScript to dist/
npm run type-check    # Type checking without emit
npm run lint          # Run ESLint
npm run dev           # Development mode with tsx
```

### Type Safety Guidelines

**1. Use strict types everywhere:**
```typescript
// Good - explicit types
async function getVideoInfo(videoIds: string[]): Promise<VideoInfo[]> {
  // ...
}

// Avoid - implicit any
async function getVideoInfo(videoIds) {
  // ...
}
```

**2. Leverage shared types from `types/index.ts`:**
```typescript
import { VideoInfo, VideoLocalization, JsonOption } from '../types';

async function videoInfoCommand(videoIds: string[], options: JsonOption): Promise<void> {
  const videos: VideoInfo[] = await getVideoInfo(videoIds);
  // ...
}
```

**3. Use non-null assertions sparingly:**
```typescript
// Prefer optional chaining and nullish coalescing
const title = video.snippet?.title || 'Untitled';

// Only use ! when you're absolutely certain
const channelId = response.data.items![0].id!;
```

**4. Type API responses properly:**
```typescript
import { youtube_v3 } from 'googleapis';

async function getVideoWithLocalizations(videoId: string): Promise<youtube_v3.Schema$Video> {
  // Uses googleapis type definitions
}
```

### ESLint Configuration

ESLint is configured with TypeScript support (flat config format):
- Parser: `@typescript-eslint/parser`
- Plugin: `@typescript-eslint/eslint-plugin`
- Rules optimized for Node.js CLI development

**Running linter:**
```bash
npm run lint          # Check all files
```

### Common TypeScript Patterns for CLI

**Command modules use `export =` for CommonJS:**
```typescript
import ora from 'ora';
import { getVideoInfo } from '../lib/youtube';
import { JsonOption } from '../types';

async function videoInfoCommand(videoIds: string[], options: JsonOption): Promise<void> {
  // Command logic
}

export = videoInfoCommand;
```

**Type error handling:**
```typescript
try {
  // ...
} catch (err) {
  error((err as Error).message);
  process.exit(1);
}
```

**Type Commander.js options:**
```typescript
interface UpdateVideoOptions {
  title?: string;
  description?: string;
  dryRun?: boolean;
  yes?: boolean;
}

async function updateMetadataCommand(videoId: string, options: UpdateVideoOptions): Promise<void> {
  // ...
}
```

## Adding New Commands

### Step 1: Choose the Correct Name

Follow AWS conventions:
- **Single-item operation?** Use singular noun: `get-playlist`, `update-comment`
- **Batch/list operation?** Use plural noun: `get-playlists`, `list-comments`

### Step 2: Create Command File

Create `commands/your-command.ts`:

```typescript
import ora from 'ora';
import { success, error, info } from '../lib/utils';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { JsonOption } from '../types';

interface YourCommandOptions extends JsonOption {
  // Add your option types here
}

async function yourCommand(args: string, options: YourCommandOptions): Promise<void> {
  const spinner = ora('Processing...').start();

  try {
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    // Your logic here

    spinner.succeed('Operation completed!');
    success('Done!');
  } catch (err) {
    spinner.fail('Operation failed');
    error((err as Error).message);
    process.exit(1);
  }
}

export = yourCommand;
```

### Step 3: Register in bin/staqan-yt.ts

```typescript
import yourCommand = require('../commands/your-command');

program
  .command('your-command <arg>')
  .description('Description following AWS style')
  .option('-j, --output json', 'Output in JSON format')
  .action(yourCommand);
```

### Step 4: Add Types (if needed)

Update `types/index.ts` if you have new shared types:

```typescript
export interface YourNewType {
  field: string;
  // ...
}
```

### Step 5: Build and Test

```bash
npm run type-check    # Ensure no type errors
npm run lint          # Ensure no linting errors
npm run build         # Compile to dist/
npm link              # Test globally
```

### Step 6: Update Documentation

- Add to README.md (user docs)
- Add examples to QUICK_START.md if applicable

### Troubleshooting TypeScript Errors

**"Cannot find module" errors:**
```bash
# Solution: Check imports use correct paths
import { getVideoInfo } from '../lib/youtube';  # Correct
import { getVideoInfo } from '../lib/youtube.ts';  # Wrong - no .ts extension
```

**Type errors with googleapis:**
```typescript
// Use optional chaining and non-null assertions carefully
const channelId = response.data.items?.[0]?.snippet?.channelId;
if (!channelId) {
  throw new Error('Channel not found');
}
```

**ESLint errors:**
```bash
npm run lint          # See all errors
# Fix common issues:
# - Unused imports: Remove them
# - Unused variables: Prefix with _ if intentional
# - any type: Add proper types
```

**Build errors:**
```bash
# Clean build and try again
rm -rf dist/
npm run build

# Check for syntax errors in .ts files
npm run type-check
```

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

### Output Format System

The CLI supports 5 output formats via `--output <format>`:

- **json** - Machine-readable JSON (2-space indentation)
- **table** - ASCII table format with borders and column alignment
- **text** - Tab-delimited output for Unix pipelines (awk, cut)
- **pretty** - Colorful, human-friendly output (default)
- **csv** - RFC 4180 CSV format for Excel and data analysis

### Implementing Output Formats in Commands

```typescript
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';

const outputFormat = await getOutputFormat(options.output);

switch (outputFormat) {
  case 'json':
    console.log(formatJson(data));
    break;
  case 'table':
    console.log(formatTable(data));
    break;
  case 'text':
    data.forEach(item => console.log(Object.values(item).join('\t')));
    break;
  case 'csv':
    console.log(formatCsv(data));
    break;
  case 'pretty':
  default:
    // Colorful output using chalk
    break;
}
```

### CSV Format Details

The CSV formatter (`formatCsv`) follows RFC 4180 standards:
- Escapes fields containing commas, quotes, or newlines
- Doubles internal quotes for proper escaping
- Handles nested objects by JSON-encoding them
- Always includes a header row with field names

**Example usage:**
```bash
# Export to Excel
staqan-yt list-videos @channel --output csv > videos.csv

# Analytics to CSV
staqan-yt get-video-analytics VIDEO_ID --output csv > analytics.csv

# Pipe to other tools
staqan-yt get-video-tags VIDEO_ID --output csv | csvkit
```

### Pretty Output (default)

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

# Test configuration
staqan-yt config list
staqan-yt config set default.channel @staqan
staqan-yt config set default.output csv
staqan-yt config get default.channel

# Test all output formats for get-video
staqan-yt get-video dQw4w9WgXcQ --output json
staqan-yt get-video dQw4w9WgXcQ --output table
staqan-yt get-video dQw4w9WgXcQ --output text
staqan-yt get-video dQw4w9WgXcQ --output csv
staqan-yt get-video dQw4w9WgXcQ --output pretty

# Test get multiple videos
staqan-yt get-videos dQw4w9WgXcQ abc123xyz --output csv

# Test list videos (with and without channel argument)
staqan-yt list-videos @mkbhd --limit 5 --output csv
staqan-yt list-videos --limit 5  # Uses default channel from config

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

### Release Process

**This project does NOT use GitHub releases.** All releases are managed through version bumps, git tags, and Homebrew formula updates.

**IMPORTANT: After completing a task in a session, always release a new patch version before ending the session.**

**Single source of truth:** `package.json` is the source of truth for versioning. All other files are automatically synced from it.

**Release workflow:**

**Option 1: Using npm version (recommended):**
```bash
# Automatically bumps version, syncs all files, creates commit & tag
npm version patch   # For bug fixes and minor changes (X.Y.Z -> X.Y.Z+1)
npm version minor   # For new features (X.Y.Z -> X.Y+1.0)
npm version major   # For breaking changes (X.Y.Z -> X+1.0.0) - rarely used

# Push to GitHub
git push && git push --tags
```

**Option 2: Manual version bump:**
```bash
# 1. Edit package.json version manually
# 2. Sync version to other files
npm run sync-version

# 3. Commit changes
git add -A
git commit -m "Bump version to X.Y.Z

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 4. Create git tag
git tag vX.Y.Z

# 5. Push to GitHub
git push && git push --tags
```

**What gets synced automatically:**
- `package.json` - Source of truth
- `bin/staqan-yt.ts` - Fallback version for compiled binary
- `Formula/staqan-yt.rb` - Homebrew formula version

**Semantic versioning rules (X.Y.Z):**

- **Z (patch)** - Bump for normal releases:
  - Bug fixes
  - Minor improvements
  - Documentation updates
  - Non-breaking changes

- **Y (minor)** - Bump only if changes are significant:
  - New commands added
  - New features
  - Significant refactoring
  - Breaking changes to non-public APIs

- **X (major)** - NEVER bump unless explicitly instructed:
  - Reserved for major breaking changes
  - Requires explicit approval
  - Should be extremely rare

**Default behavior:** Always bump Z (patch) unless told otherwise.

**Example releases:**
- `1.2.3` → `1.2.4` - Bug fix, documentation update
- `1.2.4` → `1.3.0` - Added new `list-playlists` command
- `1.3.0` → `2.0.0` - Only if explicitly instructed for major breaking change

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
