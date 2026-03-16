# staqan-yt-cli Development Guide

## ⚠️ CRITICAL RULES

**🚨 NEVER COMMIT DIRECTLY TO MAIN BRANCH 🚨**

**EVERY commit MUST be on a feature branch:**
```bash
# BEFORE making any changes, create a feature branch
git checkout -b feature/your-feature-name

# Make your changes and commit on the feature branch
git add -A
git commit -m "Description"

# Push feature branch and create PR
git push -u origin feature/your-feature-name
gh pr create --title "Feature: Your Feature" --body "Description"
```

**If you accidentally commit to main:**
```bash
# Undo the commit (keep changes)
git reset --soft HEAD~1

# Create proper feature branch
git checkout -b feature/your-feature-name
git add -A
git commit -m "Description"
git push -u origin feature/your-feature-name
gh pr create
```

**Why this matters:**
- Prevents breaking main branch
- Allows code review via PRs
- Maintains clean git history
- Team workflow best practice

---

## Project Overview

A command-line interface for managing YouTube videos and metadata using the YouTube Data API v3. Built with Node.js and designed for programmatic YouTube channel management.

## Documentation Structure

This project uses a structured documentation system to serve different audiences:

```
staqan-yt-cli/
├── README.md                 # User-facing (concise, Homebrew-focused)
├── CONTRIBUTING.md           # Contributor guide for humans
├── CLAUDE.md                 # This file - AI/robot development instructions
└── docs/                     # Comprehensive command reference
    ├── README.md             # Documentation hub
    ├── setup.md              # Installation & OAuth setup
    ├── troubleshooting.md    # Common issues & solutions
    ├── output-formats.md     # Output format guide (JSON, CSV, etc.)
    └── commands/             # Command reference grouped by intent
        ├── video-discovery.md        # get-video, search-videos
        ├── channel-operations.md     # list-videos, get-channel
        ├── metadata-management.md    # update-video, localizations
        ├── analytics.md              # video/channel analytics
        ├── reporting-api.md          # thumbnail CTR, reports
        ├── engagement.md             # comments, captions
        ├── content-management.md     # tags, thumbnails, playlists
        └── configuration.md          # auth, config, MCP
```

**Key Points for AI Assistants:**

1. **When adding commands:**
   - Document in appropriate `docs/commands/<category>.md` file
   - Update `lib/customHelp.ts` to match documentation grouping
   - Follow existing documentation patterns in that file

2. **When modifying commands:**
   - Update the corresponding `docs/commands/<category>.md` file
   - Update examples if behavior changes
   - Add new error cases to `docs/troubleshooting.md`

3. **Documentation serves different purposes:**
   - README.md - Quick start for users (keep concise)
   - CONTRIBUTING.md - Human contributor conventions
   - CLAUDE.md - AI development instructions (this file)
   - docs/ - Comprehensive reference (detailed examples)

4. **Help command grouping:**
   - Groups in `lib/customHelp.ts` MUST match documentation structure
   - Update both files together to stay in sync

## 🤖 Subagent Development Workflow

**⚠️ CRITICAL: When a subagent is spawned to work on this tool:**

1. **Read this CLAUDE.md first** - Understand architecture and conventions
2. **Create a feature branch IMMEDIATELY** - BEFORE making any changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make changes** following AWS naming conventions and best practices
4. **Test changes** manually with example commands
5. **Commit on feature branch**:
   ```bash
   git add -A
   git commit -m "Description

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   ```
6. **Push feature branch and create PR**:
   ```bash
   git push -u origin feature/your-feature-name
   gh pr create --title "Feature: Your Feature" --body "Description"
   ```
7. **Return to parent** after PR is created (do NOT wait for merge)

**Do NOT:**
- ❌ Make changes on main branch
- ❌ Commit directly to main
- ❌ Push to main without a PR
- ❌ Return with uncommitted changes

**Remember:** Even for "small" changes, ALWAYS use a feature branch.

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

**CRITICAL**: All commands must follow AWS API naming conventions and use **NO positional arguments**.

**🚨 RULE: Everything is a named flag. No positional arguments at all.**

**Singular = Single-item operations**
```bash
get-video --video-id <id>        # Get ONE video
update-video --video-id <id>     # Update ONE video
delete-video --video-id <id>     # Delete ONE video (if added)
```

**Plural = Batch/list operations**
```bash
get-videos --video-ids <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos --channel <handle>         # List videos in channel
search-videos --query <text>            # Search multiple videos
```

**Required flags pattern:**
- Single ID: Use `--resource-id <id>` (singular flag name, singular ID)
- Multiple IDs: Use `--resource-ids <id...>` (plural flag name, variadic IDs)
- Other required params: Use descriptive flag names (e.g., `--query <text>`)

**Naming pattern:**
- Use `get-` for retrieving resources
- Use `list-` for listing collections
- Use `update-` for modifying resources
- Use `delete-` for removing resources
- Use `search-` for querying resources
- Use singular nouns for single-item operations
- Use plural nouns for batch/list operations
- **ALL parameters use flags** (no positional arguments)

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

**⚠️ ZERO `any` TOLERANCE**

**Never use `any` type.** It defeats TypeScript's entire purpose. This is a hard rule:

```typescript
// ❌ NEVER
function handler(...args: any[]): any { ... }
const data: any = response;

// ✅ Use specific types
function handler(videoId: string, options: VideoOptions): Promise<void> { ... }
const data: VideoInfo = response;

// ✅ If type is truly unknown, use `unknown` + type guard
function handler(input: unknown): void {
  if (typeof input === 'string') { ... }
}

// ✅ For external/untyped data, use a specific interface even if partial
interface ApiResponse { items?: Item[] }
```

If you find yourself reaching for `any`, use `unknown` with a type guard, or define a proper interface.

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

### Non-Null Assertion Usage

**ESLint Rule:** `@typescript-eslint/no-non-null-assertion` is set to `'off'`

**Rationale:**
Non-null assertions (`!`) are used intentionally throughout the codebase, particularly in `lib/youtube.ts`, when working with YouTube API responses from the `googleapis` library.

**Why this is safe:**
1. **Explicit validation precedes all assertions**: Properties are validated before using `!`
   - Example: `if (response.data.items && response.data.items.length > 0)` followed by `item.snippet!.title!`

2. **YouTube API contract**: The YouTube Data API v3 guarantees certain properties exist when specific conditions are met
   - Example: If `items` array has elements, each `item.snippet` is guaranteed to exist

3. **googleapis type definitions**: The official TypeScript definitions use optional types extensively (`property?: type`), even for required fields

4. **Readability**: Using `!` after validation is more concise than repeated null checks

**Pattern to follow:**
```typescript
// Good: Validate first, then assert
if (response.data.items && response.data.items.length > 0) {
  const title = response.data.items[0].snippet!.title!;  // Safe!
}

// Bad: Assert without validation
const title = response.data.items![0].snippet!.title!;  // Unsafe!
```

**When adding new code:**
- Always validate before asserting
- If you're unsure whether a property can be null, use optional chaining (`?.`) instead
- Prefer explicit checks over assertions for user input or external data

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

**IMPORTANT:** This project uses a structured documentation system. You MUST update documentation when adding or modifying commands.

**Documentation Structure:**
```
README.md                 # User-facing (concise, examples only)
CONTRIBUTING.md           # Contributor guide
CLAUDE.md                 # This file - AI development guide
docs/                     # Comprehensive command reference
├── README.md             # Documentation hub
├── commands/             # Command reference by intent
│   ├── video-discovery.md
│   ├── channel-operations.md
│   ├── metadata-management.md
│   ├── analytics.md
│   ├── reporting-api.md
│   ├── engagement.md
│   ├── content-management.md
│   └── configuration.md
├── setup.md
├── troubleshooting.md
└── output-formats.md
```

**What to Update:**

1. **Command Documentation** (REQUIRED for new commands):
   - Add to appropriate `docs/commands/<category>.md` file
   - Include: usage, arguments, options, examples, output fields
   - Follow existing documentation patterns in that file

2. **Help Command Grouping** (REQUIRED):
   - Update `lib/customHelp.ts` to include new command in appropriate group
   - Groups must match documentation structure

3. **Documentation Hub** (if new category):
   - Update `docs/README.md` to reference new command/category

4. **README.md** (OPTIONAL):
   - Only update for significant user-facing features
   - Keep concise, link to docs/ for details

5. **Troubleshooting** (if new error cases):
   - Update `docs/troubleshooting.md` with new error scenarios

**Documentation Template for Commands:**
```markdown
## command-name

Brief description.

### Usage
\`\`\`bash
staqan-yt command-name <args>
\`\`\`

### Arguments
- `arg` - Description

### Options
- `--flag` - Description
- `-v, --verbose` - Enable verbose output

### Examples
\`\`\`bash
# Basic usage
staqan-yt command-name value
\`\`\`

### Output Fields
- Field descriptions

### Related Commands
- Links to related commands
```

**Verification:**
- [ ] Command documented in `docs/commands/<category>.md`
- [ ] Help grouping updated in `lib/customHelp.ts`
- [ ] Examples tested and work correctly
- [ ] Related commands cross-referenced

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

### ⚠️ BRANCH STRATEGY - MOST CRITICAL RULE

**🚨 NEVER, EVER commit directly to main branch! 🚨**

**Before making ANY changes:**
```bash
# Check current branch - MUST NOT be main
git branch --show-current

# If on main, create feature branch FIRST
git checkout -b feature/your-feature-name
```

**Branch naming convention:**
- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `refactor/name` - Code refactoring

**Correct Workflow:**
```bash
# 1. Create a feature branch (DO THIS FIRST)
git checkout -b feature/your-feature-name

# 2. Make changes and commit on feature branch
git add -A
git commit -m "Description"

# 3. Push feature branch (NOT main)
git push -u origin feature/your-feature-name

# 4. Create PR via GitHub or gh CLI
gh pr create --title "Feature: Your Feature" --body "Description"

# 5. After PR merge, delete the branch
git checkout main
git pull
git branch -d feature/your-feature-name
```

**Recovery if you mess up:**
```bash
# If you accidentally committed to main:
git reset --soft HEAD~1              # Undo commit, keep changes
git checkout -b feature/your-feature  # Create proper branch
git add -A                           # Stage changes
git commit -m "Description"           # Commit on feature branch
git push -u origin feature/your-feature  # Push feature branch
gh pr create                          # Create PR

# Never push the commit to main!
```

**Protecting main branch:**
Consider enabling branch protection rules on GitHub to prevent direct commits to main.

### Commit Message Format

Follow the established pattern:

```
Brief description of change

Detailed explanation if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Before Committing

**MANDATORY PRE-COMMIT CHECKLIST:**
- [ ] **On a feature branch?** (NOT main!)
- [ ] **Tested all affected commands?**
- [ ] **Updated documentation?**
  - [ ] README.md (if user-facing changes)
  - [ ] docs/commands/<category>.md (command reference)
  - [ ] lib/customHelp.ts (help grouping)
- [ ] **Following AWS naming conventions?**
- [ ] **Credentials never committed?**

**Verify branch before committing:**
```bash
# This MUST NOT be "main"
git branch --show-current

# If it shows "main", STOP and create feature branch:
git checkout -b feature/your-feature-name
```

**Verify what you're committing:**
```bash
# Check staged files
git diff --staged --name-only

# Check for unintended files (credentials, etc.)
git status
```

- [ ] Test all affected commands
- [ ] Update documentation:
  - [ ] README.md (if user-facing)
  - [ ] docs/commands/<category>.md (command reference)
  - [ ] lib/customHelp.ts (help grouping)
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

## Hidden Internal Commands

Some commands are registered with Commander's `{ hidden: true }` option and never appear in `staqan-yt help` output. They are implementation details and must **not** be documented in user-facing docs (README, docs/).

### `__complete`

**File:** `commands/complete.ts`
**Registered in:** `bin/staqan-yt.ts` via `program.addCommand(cmd, { hidden: true })`

**Purpose:** Subprocess helper for shell tab completion scripts. Shell scripts (bash/zsh) call this command and use its stdout as completion candidates.

**Usage:**
```bash
staqan-yt __complete --type video-id      # Video IDs + titles for default channel
staqan-yt __complete --type playlist-id   # Playlist IDs + titles for default channel
staqan-yt __complete --type report-type   # Report type IDs + names
```

**Output format:** One `id\ttitle` per line (tab-separated). No spinners, no chalk, no extra output.

**Caching:** Results are cached in `~/.staqan-yt-cli/completion-cache.json`:
- `video-id` / `playlist-id`: 5-minute TTL, keyed as `video-id:@channel`
- `report-type`: 1-hour TTL, keyed as `report-type`

**Error handling:** Any error (no auth, no default channel, network failure) causes silent `process.exit(0)` — completion simply shows no candidates rather than printing an error to the terminal.

**Shell integration:** The generated bash/zsh scripts in `lib/completion.ts` call `__complete` as a subprocess and feed its output into `_describe` (zsh) or `compgen -W` (bash).

---

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
4. Document in `docs/commands/<category>.md` and update `lib/customHelp.ts`
5. Update README.md if user-facing feature
6. Test with real YouTube data

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

## Dependabot Vulnerability Management

This project uses GitHub Dependabot for automated dependency vulnerability tracking. When Dependabot detects vulnerabilities, they appear as alerts on the repository.

### Checking for Vulnerabilities

**Use GitHub CLI to fetch Dependabot alerts:**
```bash
# List all open Dependabot alerts
gh api '/repos/OWNER/REPO/dependabot/alerts?state=open'

# Get formatted summary
gh api '/repos/prog893/staqan-yt-cli/dependabot/alerts?state=open' \
  --jq '.[] | "\(.security_vulnerability.severity) - \(.dependency.package.name) (vulnerable: \(.security_vulnerability.vulnerable_version_range), patched: \(.security_vulnerability.first_patched_version.identifier))"'
```

**Git push provides vulnerability feedback:**
When you push to GitHub, the remote will alert you if there are vulnerabilities:
```
remote: GitHub found 7 vulnerabilities on prog893/staqan-yt-cli's default branch (3 high, 4 moderate).
remote: To find out more about visit: https://github.com/prog893/staqan-yt-cli/security/dependabot
```

This serves as an **automatic trigger** - if you see this message, you should address the vulnerabilities before continuing.

**IMPORTANT:** The vulnerability count shown during push reflects the state **before** your push. Dependabot rescans after the push completes, so even after pushing a fix, you'll still see the old warning. Don't worry - the count will update on the next push once Dependabot rescans.

### Vulnerability Fix Workflow

**1. Assess the vulnerabilities**
```bash
# Fetch and review alerts
gh api '/repos/prog893/staqan-yt-cli/dependabot/alerts?state=open' | jq .

# Check dependency chain
npm ls <vulnerable-package>
```

**2. Update dependencies**
```bash
# Update specific package
npm update <package-name>

# Or update all (use with caution)
npm update
```

**3. Test thoroughly**
```bash
# Build the project
npm run build

# Test all non-destructive commands:
# - Video operations: get-video, get-videos, get-thumbnail, get-video-tags
# - Localizations: get-video-localizations, get-video-localization
# - Comments: list-comments
# - Playlists: list-playlists, get-playlist, get-playlists
# - Config: config list/get/set
# - MCP server: staqan-yt mcp (test with timeout)
# - Output formats: test with --output json/table/text/csv/pretty
```

**4. Commit and release**
```bash
# Commit the fix
git add package-lock.json
git commit -m "Fix: Update <package> to address security vulnerabilities

- Updated <package> from X.Y.Z to A.B.C
- Fixes N Dependabot alerts (X HIGH, Y MEDIUM severity)
- Resolves CVE-XXXX-XXXXX
- All non-destructive CLI commands tested and working

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Bump patch version
npm version patch

# Push to GitHub
git push && git push --tags
```

**5. Verify**
After pushing, GitHub will rescan the repository asynchronously.
- **Expected:** You may still see vulnerability warnings on this push (they reflect the pre-push state)
- **Verification:** The Dependabot alerts page will update within a few minutes
- **Confirmation:** Next time you push, the warning will be gone if the fix was successful

### Vulnerability Severity Classification

Based on the article [Dependabot alerts を 0 でキープしたい](https://zenn.dev/tsukulink/articles/c4a204897930a9):

| Severity | Timeline | Examples |
|----------|----------|----------|
| **Critical** | Immediate | System can be stopped, personal data exposed |
| **High** | This month | Limited attack conditions, non-critical impact |
| **Moderate** | Within 6 months | Dev-only usage, vulnerable feature not used |
| **None** | Skip | Not actually used |

### Example: Real-World Fix

**Issue:** 7 Dependabot alerts (3 HIGH, 4 MEDIUM)
- `@modelcontextprotocol/sdk` - Cross-client data leak (HIGH)
- `hono` - Multiple vulnerabilities (2 HIGH, 4 MEDIUM)

**Root cause analysis:**
```bash
npm ls hono
# staqan-yt-cli
# └── @modelcontextprotocol/sdk@1.25.2
#     └── @hono/node-server@1.19.8
#         └── hono@4.11.3
```

**Solution:** Update the direct dependency
```bash
npm update @modelcontextprotocol/sdk
# This automatically updates hono to 4.11.8 (patched version)
```

**Result:** All 7 alerts fixed with one update, tested comprehensively, released as v1.3.6.

### Best Practices

1. **Keep alerts at 0** - Stay sensitive to new security warnings
2. **Check dependency chains** - Transitive dependencies often bring vulnerabilities
3. **Test after updates** - Especially for functionality that uses vulnerable packages
4. **Document legitimate usage** - If a package has vulnerabilities but you don't use the affected features, document why
5. **Update quickly for HIGH/CRITICAL** - These can have real security impact
6. **Plan updates for MODERATE** - These can be batched with other maintenance

### Automating Vulnerability Detection

Consider creating a GitHub Actions workflow (similar to the Zenn article) to:
- Check Dependabot alerts daily
- Post to Slack when new alerts appear
- Create issues for unaddressed vulnerabilities

Example reference: https://zenn.dev/tsukulink/articles/c4a204897930a9

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
