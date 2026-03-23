# Architecture Guide

This guide covers architectural principles, design patterns, and implementation details of the staqan-yt-cli project.

## Clean Separation of Concerns

### Programmatic vs Semantic Operations

**This CLI is PURELY programmatic** - it handles YouTube API operations only:

**IN SCOPE** (this CLI):
- Fetch video metadata
- List channel videos
- Search videos
- Update video metadata
- OAuth 2.0 authentication
- Localizations management
- Comments and playlists
- Analytics and reports

**OUT OF SCOPE** (belongs in project-specific CLAUDE.md files):
- Subtitle analysis
- Content strategy
- Metadata generation logic
- Language-specific tone guidance

### Example: Proper Separation

```typescript
// ✅ IN SCOPE - Pure API operation
async function getVideoMetadata(videoId: string): Promise<VideoInfo> {
  const response = await youtube.videos.list({
    part: 'snippet',
    id: videoId
  });
  return response.data.items?.[0];
}

// ❌ OUT OF SCOPE - Semantic analysis
async function analyzeVideoQuality(videoId: string): Promise<string> {
  const metadata = await getVideoMetadata(videoId);
  // This belongs in project-specific code, not this CLI
  return metadata.title.includes('tutorial') ? 'educational' : 'entertainment';
}
```

## Lock Strategy

### File Operation Concurrency

The CLI uses file-based locks with PID checking to prevent concurrent writes.

### Lock Files

- `data/{channelId}/completion_cache.json.lock` - Completion cache
- `data/handle-to-channel-id.json.lock` - Handle→channelId cache
- `data/{channelId}/reports/.lock` - Per-channel reports directory

### Lock Behavior

- Locks contain **PID + timestamp**
- **Automatic stale lock detection**: PID doesn't exist OR age > 30min
- Acquire with timeout: `acquireLock(lockPath, { timeout })`
- Always release in `finally` block
- **Configurable timeout** for `fetch-reports`: use `getLockTimeout()` from `lib/config.ts` instead of hardcoding; honours `STAQAN_YT_LOCK_TIMEOUT_MS` env var > `lock.timeout` config > 60 s default

### Usage Pattern

```typescript
import { acquireLock, getLockPath } from '../lib/lock';

async function writeSomething(): Promise<void> {
  const lockPath = getLockPath('your-type', channelId);
  let release: (() => Promise<void>) | null = null;

  try {
    release = await acquireLock(lockPath, { timeout: 5000 });
    // ... write operations ...
  } finally {
    if (release) await release();
  }
}
```

### When Adding New File Writes

1. Identify if lock is needed (concurrent access possible?)
2. Use appropriate lock file:
   - `file.lock` for single files
   - `.lock` for directories
3. Always use try/finally to ensure cleanup
4. Test with concurrent operations

## AWS API Naming Conventions

### 🚨 RULE: Everything is a named flag

**NO positional arguments at all.**

### Singular vs Plural

**Singular = Single-item operations:**
```bash
get-video --video-id <id>        # Get ONE video
update-video --video-id <id>     # Update ONE video
delete-video --video-id <id>     # Delete ONE video
```

**Plural = Batch/list operations:**
```bash
get-videos --video-ids <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos --channel <handle>         # List videos in channel
search-videos --query <text>           # Search multiple videos
```

### Required Flags Pattern

- Single ID: `--resource-id <id>` (singular flag name, singular ID)
- Multiple IDs: `--resource-ids <id...>` (plural flag name, variadic IDs)
- Other required params: Use descriptive flag names (e.g., `--query <text>`)

### Command Naming

- Use `get-` for retrieving resources
- Use `list-` for listing collections
- Use `update-` for modifying resources
- Use `delete-` for removing resources
- Use `search-` for querying resources
- Use singular nouns for single-item operations
- Use plural nouns for batch/list operations

## Hidden Internal Commands

Some commands are registered with Commander's `{ hidden: true }` option and never appear in `staqan-yt help` output. They are implementation details and must **not** be documented in user-facing docs (README, docs/).

### `__complete`

**File**: `commands/complete.ts`
**Registered in**: `bin/staqan-yt.ts` via `program.addCommand(cmd, { hidden: true })`

**Purpose**: Subprocess helper for shell tab completion scripts. Shell scripts (bash/zsh) call this command and use its stdout as completion candidates.

**Usage**:
```bash
staqan-yt __complete --type video-id      # Video IDs + titles for default channel
staqan-yt __complete --type playlist-id   # Playlist IDs + titles for default channel
staqan-yt __complete --type report-type   # Report type IDs + names
```

**Output format**: One `id\ttitle` per line (tab-separated). No spinners, no chalk, no extra output.

**Caching**: Results are cached in `~/.staqan-yt-cli/completion-cache.json`:
- `video-id` / `playlist-id`: 5-minute TTL, keyed as `video-id:@channel`
- `report-type`: 1-hour TTL, keyed as `report-type`

**Error handling**: Any error (no auth, no default channel, network failure) causes silent `process.exit(0)` — completion simply shows no candidates rather than printing an error to the terminal.

**Shell integration**: The generated bash/zsh scripts in `lib/completion.ts` call `__complete` as a subprocess and feed its output into `_describe` (zsh) or `compgen -W` (bash).

## Code Structure

### Directory Organization

```
staqan-yt-cli/
├── bin/
│   └── staqan-yt.ts          # Main CLI entry point, command routing
├── lib/
│   ├── auth.ts               # OAuth 2.0 authentication logic
│   ├── youtube.ts            # YouTube Data API wrapper
│   ├── language.ts           # Language mapping utilities
│   ├── config.ts             # Configuration management utilities
│   ├── utils.ts              # Helper utilities (chalk, ora, paths)
│   ├── formatters.ts         # Output format formatters
│   ├── lock.ts               # File locking mechanism
│   └── completion.ts         # Shell completion scripts
├── commands/
│   ├── auth.ts               # Authentication command
│   ├── config.ts             # Configuration management command
│   ├── *.ts                  # All other commands
├── types/
│   └── index.ts              # Shared TypeScript type definitions
├── dist/                     # Compiled JavaScript output (gitignored)
├── tsconfig.json             # TypeScript configuration
├── eslint.config.mjs         # ESLint configuration
└── package.json
```

### Key Files

**`bin/staqan-yt.ts`**: CLI entry point and command router
- Registers all commands with Commander.js
- Sets up global options
- Defines help format

**`lib/youtube.ts`**: Main API wrapper (~903 lines)
- Wraps YouTube Data API v3
- Implements caching
- Handles common operations

**`lib/auth.ts`**: OAuth 2.0 authentication
- Token management
- Auto-refresh
- Credential loading

**`lib/config.ts`**: Configuration management
- Load/save config
- Default value handling
- Output format resolution

**`lib/formatters.ts`**: Output format implementations
- JSON, table, CSV, text, pretty formatters
- Data transformation

**`lib/lock.ts`**: File locking mechanism
- PID-based locks
- Stale lock detection
- Timeout handling

## Configuration Management

### Config File Location

`~/.staqan-yt-cli/config.json`

### Available Configuration Options

- `default.channel` - Default channel handle/ID for list-videos and search-videos
- `default.output` - Default output format: `json`, `table`, `text`, `pretty`, or `csv` (defaults to `pretty`)
- `lock.timeout` - Lock acquisition timeout in milliseconds for `fetch-reports` (defaults to `60000`; overridden by `STAQAN_YT_LOCK_TIMEOUT_MS` env var)

### How Configuration Works

- Config values are loaded when commands execute
- CLI flags always override config defaults
- Optional parameters use config values when not provided
- Configuration is managed via the `config` command

### Example Workflow

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

## Credential Management

### All Credentials Stored In

`~/.staqan-yt-cli/`

```
~/.staqan-yt-cli/
├── credentials.json      # OAuth 2.0 client credentials
├── token.json            # User access/refresh tokens (auto-generated)
└── config.json           # User configuration
```

### Security Rules

- Never store credentials in the repo
- Never store in project directories
- Never use environment variables
- Always use the centralized location

## Related Guides

- [TypeScript Guide](typescript-guide.md) - Type system architecture
- [Security Guide](security-guide.md) - Security architecture
- [YouTube API Guide](youtube-api-guide.md) - API wrapper patterns
- [Error Handling Guide](error-handling.md) - Error handling architecture
