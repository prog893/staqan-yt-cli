# Contributing to staqan-yt-cli

Thank you for your interest in contributing! This guide covers development conventions, patterns, and debugging tips.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Conventions](#code-conventions)
- [CLI Patterns](#cli-patterns)
- [Testing](#testing)
- [Documentation](#documentation)
- [Debugging Tips](#debugging-tips)
- [Submitting Changes](#submitting-changes)

## Development Setup

### Prerequisites

- Bun runtime (for development)
- Node.js (for production builds)
- Google Cloud Project with YouTube Data API v3 enabled

### Local Development

```bash
# Clone the repository
git clone https://github.com/prog893/staqan-yt-cli.git
cd staqan-yt-cli

# Install dependencies
bun install

# Run in development mode
bun run dev

# Or build and run
bun run build
node dist/bin/staqan-yt.js --help
```

### Code Quality Checks

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build
npm run build
```

## Code Conventions

### AWS API Naming Convention

**CRITICAL:** All commands must follow AWS naming conventions:

**Singular = Single-item operations**
```bash
get-video <videoId>        # Get ONE video
update-video <videoId>     # Update ONE video
delete-video <videoId>     # Delete ONE video
```

**Plural = Batch/list operations**
```bash
get-videos <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos <channel>      # List videos in channel
search-videos <ch> <query> # Search multiple videos
```

**Pattern:**
- Use `get-` for retrieving resources
- Use `list-` for listing collections
- Use `update-` for modifying resources
- Use `delete-` for removing resources
- Use `search-` for querying resources
- Use singular nouns for single-item operations
- Use plural nouns for batch/list operations

### TypeScript Guidelines

**⚠️ ZERO `any` TOLERANCE**

`any` is banned. It silences TypeScript and hides bugs. Never use it:

```typescript
// ❌ Never
function process(...args: any[]): any { ... }
const result: any = apiCall();

// ✅ Use specific types
function process(videoId: string, options: VideoOptions): Promise<VideoInfo> { ... }

// ✅ Truly unknown input → use `unknown` + type guard
function handle(input: unknown): string {
  if (typeof input !== 'string') throw new Error('Expected string');
  return input;
}

// ✅ Untyped external data → define a minimal interface
interface RawApiItem { id?: string; snippet?: { title?: string } }
```

If `npm run lint` reports `any` warnings, fix them before submitting.

**1. Use strict types:**
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

**2. Use non-null assertions sparingly:**
```typescript
// Prefer optional chaining
const title = video.snippet?.title || 'Untitled';

// Only use ! when absolutely certain (after validation)
if (response.data.items && response.data.items.length > 0) {
  const title = response.data.items[0].snippet!.title!;  // Safe!
}
```

**3. Command modules use `export =`:**
```typescript
async function yourCommand(args: string, options: YourOptions): Promise<void> {
  // Command logic
}

export = yourCommand;
```

### Credential Management

**All credentials stored in**: `~/.staqan-yt-cli/`

**Never:**
- Store credentials in the repo
- Use environment variables for OAuth credentials
- Log tokens or secrets

**Always:**
- Load credentials from `~/.staqan-yt-cli/`
- Use the centralized credential loading functions

## CLI Patterns

### Spinner Progress Pattern

When processing multiple items in a loop, use the ora spinner with a counter pattern to show real-time progress.

#### Pattern

```typescript
import ora from 'ora';

const spinner = ora('Initial message...').start();

// Process items with counter
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  spinner.text = `Processing item ${i + 1}/${items.length}...`;
  // ... do work ...
}

spinner.succeed(`Processed ${items.length} item(s)`);
console.log('');
```

#### Key Principles

1. **No intermediate success messages** - Don't call `spinner.succeed()` until all work is complete
2. **Update in-place** - The spinner text updates continuously on one line
3. **Counter format** - Use `${i + 1}/${total}` format (1-indexed)
4. **Single success message** - Show final count once at the end
5. **Blank line after** - Add `console.log('')` after spinner succeeds

#### Anti-Patterns to Avoid

❌ **Don't** show intermediate success messages:
```typescript
for (const item of items) {
  // ... work ...
  spinner.succeed(`Processed item`);  // ❌ Wrong
}
```

❌ **Don't** add blank lines during processing:
```typescript
for (let i = 0; i < items.length; i++) {
  spinner.text = `Processing ${i + 1}/${items.length}...`;
  console.log('');  // ❌ Wrong - creates gaps
}
```

### Output Formatting

All commands should support multiple output formats:

```typescript
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';

const outputFormat = await getOutputFormat(options.output);

switch (outputFormat) {
  case 'json':
    console.log(formatJson(data));
    break;
  case 'csv':
    console.log(formatCsv(data));
    break;
  case 'table':
    console.log(formatTable(data));
    break;
  case 'text':
    console.log(formatText(data));
    break;
  case 'pretty':
  default:
    // Custom pretty output with colors
    console.log(chalk.cyan(data.title));
    break;
}
```

**Supported formats:**
- `json` - Structured JSON output
- `csv` - RFC 4180 compliant CSV
- `table` - ASCII table
- `text` - Tab-delimited text
- `pretty` - Human-readable with colors (default)

### Error Handling

Use spinner for errors with descriptive messages:

```typescript
try {
  // ... work ...
} catch (err) {
  spinner.fail('Operation failed');
  console.log('');
  error((err as Error).message);
  process.exit(1);
}
```

### Verbose Mode

All commands should support `--verbose` flag:

```typescript
if (options.verbose) {
  setVerbose(true);
  debug('Verbose mode enabled');
}

// Use debug() for verbose-only output
debug('Processing item', item);
```

### Date Range Chunking

For APIs with date range limits (e.g., YouTube Analytics 90-day limit):

```typescript
import { chunkDateRange } from '../lib/utils';

const dateChunks = chunkDateRange(startDate, endDate);
debug(`Split into ${dateChunks.length} chunk(s)`);

for (let i = 0; i < dateChunks.length; i++) {
  const chunk = dateChunks[i];
  spinner.text = `Fetching chunk ${i + 1}/${dateChunks.length}...`;
  // ... fetch data for chunk ...
}
```

## Testing

### Manual Testing Checklist

Before submitting changes, test all affected commands:

```bash
# Test authentication
staqan-yt auth

# Test configuration
staqan-yt config show
staqan-yt config set default.channel @yourchannel
staqan-yt config get default.channel

# Test output formats
staqan-yt get-video dQw4w9WgXcQ --output json
staqan-yt get-video dQw4w9WgXcQ --output table
staqan-yt get-video dQw4w9WgXcQ --output csv
staqan-yt get-video dQw4w9WgXcQ --output pretty

# Test your specific commands
# ...
```

### Test Categories

1. **Happy path** - Normal operation
2. **Error cases** - Invalid inputs, API failures
3. **Edge cases** - Empty results, rate limits
4. **Output formats** - All 5 formats work correctly
5. **Verbose mode** - Debug output is helpful

## Documentation

This project uses a structured documentation system to serve different audiences:

### Documentation Structure

```
staqan-yt-cli/
├── README.md                 # User-facing (concise, Homebrew-focused)
├── CONTRIBUTING.md           # Contributor guide (this file)
├── CLAUDE.md                 # AI/robot development instructions
└── docs/                     # Comprehensive command reference
    ├── README.md             # Documentation hub
    ├── setup.md              # Installation & OAuth setup
    ├── troubleshooting.md    # Common issues & solutions
    ├── output-formats.md     # Output format guide
    └── commands/             # Command reference by intent
        ├── video-discovery.md
        ├── channel-operations.md
        ├── metadata-management.md
        ├── analytics.md
        ├── reporting-api.md
        ├── engagement.md
        ├── content-management.md
        └── configuration.md
```

### When to Update Documentation

**Adding a new command:**
1. Add the command to `bin/staqan-yt.ts`
2. Create/update documentation in `docs/commands/<category>.md`
3. Update the command grouping in `lib/customHelp.ts` to match
4. Update `docs/README.md` if adding a new category
5. Test the command and all output formats

**Modifying an existing command:**
1. Update the command implementation
2. Update the corresponding documentation in `docs/commands/<category>.md`
3. If changing options/behavior, update examples in docs
4. Test all output formats work correctly

**Changing behavior/options:**
1. Update the command file
2. Update documentation in `docs/commands/<category>.md`
3. Update `docs/troubleshooting.md` if new error cases introduced
4. Ensure examples in documentation still work

### Documentation Guidelines

**README.md:**
- Keep concise (~100 lines)
- Focus on Homebrew installation
- Include quick start examples
- Link to full documentation in `docs/`

**Command Documentation (`docs/commands/`):**
- Group by intent/use case (not alphabetically)
- Include usage, arguments, options, examples
- Show output fields/structure
- Add common use cases and patterns
- Cross-reference related commands

**Code Examples:**
- Use realistic video IDs and handles
- Show all common use cases
- Include error handling examples where relevant
- Test all examples before committing

**Updating Help Command:**
- The help command groups commands in `lib/customHelp.ts`
- Groups must match documentation structure
- Update both files together to stay in sync

### Documentation Review Checklist

Before submitting changes with documentation updates:

- [ ] **README updated** (if user-facing changes)
- [ ] **Command doc updated** in `docs/commands/<category>.md`
- [ ] **Help grouping updated** in `lib/customHelp.ts` (if needed)
- [ ] **Examples tested** - All code examples work
- [ ] **Cross-references checked** - Related commands linked
- [ ] **New categories documented** in `docs/README.md` (if added)
- [ ] **Troubleshooting updated** (if new error cases)

### Documentation Patterns

**Command Documentation Template:**
```markdown
## command-name

Brief description of what the command does.

### Usage
```bash
staqan-yt command-name <args>
```

### Arguments
- `arg` - Description

### Options
- `--flag` - Description
- `-v, --verbose` - Enable verbose output

### Examples
```bash
# Basic usage
staqan-yt command-name value

# With options
staqan-yt command-name value --output csv
```

### Output Fields
- Field descriptions

### Related Commands
- link to related commands

### Common Patterns
- Usage examples
```

**Adding Examples:**
- Show progressive complexity (basic → advanced)
- Include real-world use cases
- Demonstrate piping/composition
- Use consistent formatting

## Debugging Tips

### Enable Debug Output

```bash
# Run any command with verbose flag
staqan-yt get-video dQw4w9WgXcQ --verbose

# Or set environment variable
DEBUG=staqan-yt:* staqan-yt get-video dQw4w9WgXcQ
```

### Common Issues

**"Cannot find module" errors:**
```bash
# Check imports use correct paths
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

**Build errors:**
```bash
# Clean build and try again
rm -rf dist/
npm run build
```

### YouTube API Quota Management

**Default quota:** 10,000 units/day

**Cost per operation:**
- Read operations: 1 unit
- Write operations: 50 units
- List operations: 1-100 units (depends on parts)

**Tips:**
- Batch operations when possible
- Use specific `part` parameters to minimize quota
- Test with smaller datasets first

### Authentication Issues

**Token expired:**
```bash
# Re-authenticate
staqan-yt auth
```

**Wrong scopes:**
- Check `lib/auth.ts` for required scopes
- Re-authenticate after adding new scopes

**Credentials not found:**
```bash
# Verify credentials file exists
ls -la ~/.staqan-yt-cli/credentials.json

# Should contain OAuth client credentials from Google Cloud Console
```

## Submitting Changes

### Before Submitting

**MANDATORY PRE-COMMIT CHECKLIST:**
- [ ] **On a feature branch?** (NOT main!)
- [ ] **Tested all affected commands?**
- [ ] **Updated documentation?**
  - [ ] README.md (if user-facing changes)
  - [ ] docs/commands/<category>.md (command reference)
  - [ ] lib/customHelp.ts (help grouping, if needed)
  - [ ] docs/troubleshooting.md (if new error cases)
- [ ] **Following AWS naming conventions?**
- [ ] **Credentials never committed?**

### Git Workflow

**1. Create feature branch:**
```bash
git checkout -b feature/your-feature-name
```

**2. Make changes and commit:**
```bash
git add -A
git commit -m "feat: add your feature description

- Detailed change 1
- Detailed change 2

Fixes #123"
```

**3. Push and create PR:**
```bash
git push -u origin feature/your-feature-name
gh pr create --title "Feature: Your Feature" --body "Description"
```

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body

footer
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Example:**
```
feat(analytics): add video retention analytics

- Add get-video-retention command
- Implement date range chunking for 90-day API limit
- Add retention curve data formatting

Closes #45
```

### Branch Naming Convention

- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `refactor/name` - Code refactoring
- `docs/name` - Documentation updates

## Additional Resources

- [YouTube Data API Documentation](https://developers.google.com/youtube/v3)
- [AWS CLI Command Reference](https://docs.aws.amazon.com/cli/latest/reference/) (for naming inspiration)
- [Commander.js Documentation](https://github.com/tj/commander.js)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Questions?

If you have questions about contributing, please:
1. Check existing issues and PRs
2. Review this guide thoroughly
3. Create an issue with your question
