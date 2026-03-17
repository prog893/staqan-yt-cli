# staqan-yt-cli Development Guide

## ⚠️ CRITICAL RULES

### 🚨 NEVER COMMIT DIRECTLY TO MAIN BRANCH 🚨

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

### Verify Branch Before Committing

```bash
# This MUST NOT be "main"
git branch --show-current

# If it shows "main", STOP and create feature branch:
git checkout -b feature/your-feature-name
```

---

## Quick Reference

### Install & Test Globally

```bash
npm link              # Test globally
staqan-yt --help      # Verify installation
```

### Common Commands

```bash
# Authentication
staqan-yt auth

# Configuration
staqan-yt config list
staqan-yt config set default.channel @staqan
staqan-yt config set default.output csv

# Video operations
staqan-yt get-video --video-id dQw4w9WgXcQ
staqan-yt get-videos --video-ids ID1 ID2
staqan-yt list-videos --channel @channel --limit 5

# All output formats
staqan-yt get-video ID --output json|table|text|csv|pretty
```

### File Locations

**Credentials**: `~/.staqan-yt-cli/`
- `credentials.json` - OAuth 2.0 client credentials
- `token.json` - User access/refresh tokens
- `config.json` - User configuration

**Project Structure**:
```
staqan-yt-cli/
├── bin/staqan-yt.ts          # Main CLI entry point
├── lib/                      # Core utilities
├── commands/                 # All command implementations
├── types/index.ts            # Shared TypeScript types
└── docs/                     # Documentation
```

### Key Patterns

```typescript
// Load output format
const outputFormat = await getOutputFormat(options.output);

// Get authenticated client
const auth = await getAuthenticatedClient();
const youtube = google.youtube({ version: 'v3', auth });

// Load config value
const channel = await getConfigValue('default.channel');

// Spinner pattern
const spinner = ora('Processing...').start();
spinner.succeed('Done!');

// Error pattern
error((err as Error).message);
process.exit(1);
```

---

## Project Overview

A command-line interface for managing YouTube videos and metadata using the YouTube Data API v3. Built with Node.js and designed for programmatic YouTube channel management.

**For detailed documentation**, see:
- User guide: [README.md](README.md)
- Command reference: [docs/](docs/README.md)
- Development guides: [docs/development/](docs/development/README.md)

---

## Documentation Structure

```
staqan-yt-cli/
├── README.md                 # User-facing
├── CONTRIBUTING.md           # Contributor guide
├── CLAUDE.md                 # This file - AI development instructions
└── docs/
    ├── development/          # Development guides (11 guides)
    ├── commands/             # Command reference
    └── *.md                  # Setup, troubleshooting, etc.
```

**When adding commands**: Update `docs/commands/<category>.md` + `lib/customHelp.ts`

**→ See [docs/development/README.md](docs/development/README.md) for guide listings**

---

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

---

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

**→ See [Architecture Guide](docs/development/architecture.md#clean-separation-of-concerns)**

### 2. Lock Strategy

The CLI uses file-based locks with PID checking to prevent concurrent writes:
- Lock files: `data/{channelId}/completion_cache.json.lock`, `data/handle-to-channel-id.json.lock`
- Locks contain PID + timestamp
- Automatic stale lock detection (PID doesn't exist OR age > 30min)
- Always use try/finally to ensure cleanup

**→ See [Architecture Guide](docs/development/architecture.md#lock-strategy)**

### 3. AWS API Naming Conventions

**🚨 RULE: Everything is a named flag. No positional arguments at all.**

**Singular = Single-item operations:**
```bash
get-video --video-id <id>        # Get ONE video
update-video --video-id <id>     # Update ONE video
```

**Plural = Batch/list operations:**
```bash
get-videos --video-ids <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos --channel <handle>         # List videos in channel
```

**→ See [Architecture Guide](docs/development/architecture.md#aws-api-naming-conventions)**

### 4. Credential Management

**All credentials stored in**: `~/.staqan-yt-cli/`

**Files:**
- `credentials.json` - OAuth 2.0 client credentials
- `token.json` - User access/refresh tokens (auto-generated)

**Never store credentials:**
- In the repo
- In project directories
- In environment variables

### 5. Configuration Management

**Configuration file location**: `~/.staqan-yt-cli/config.json`

**Available options:**
- `default.channel` - Default channel handle/ID for list-videos and search-videos
- `default.output` - Default output format: `json`, `table`, `text`, `pretty`, or `csv`

**CLI flags always override config defaults.**

---

## Code Structure

```
staqan-yt-cli/
├── bin/staqan-yt.ts          # Main CLI entry point
├── lib/                      # Core utilities (auth, youtube, config, etc.)
├── commands/                 # All command implementations (31 total)
├── types/index.ts            # Shared TypeScript types
├── dist/                     # Compiled output (gitignored)
└── package.json
```

**→ See [Architecture Guide](docs/development/architecture.md#code-structure) for details**

---

## Development Guides

**For detailed implementation guides, see:**

### Core Development
- **[TypeScript Guide](docs/development/typescript-guide.md)** - TypeScript configuration, type safety, ESLint, and common patterns
- **[Adding Commands Guide](docs/development/adding-commands.md)** - Step-by-step command creation with templates
- **[Testing Guide](docs/development/testing-guide.md)** - Manual testing strategies and local development
- **[Error Handling Guide](docs/development/error-handling.md)** - User-friendly error patterns

### Implementation Details
- **[Output Formats Guide](docs/development/output-formats.md)** - Implementing JSON, table, CSV, and pretty output
- **[YouTube API Guide](docs/development/youtube-api-guide.md)** - YouTube Data API v3 patterns and quotas
- **[Security Guide](docs/development/security-guide.md)** - OAuth security and input validation
- **[Architecture Guide](docs/development/architecture.md)** - Lock strategy, hidden commands, scope boundaries

### Maintenance & Operations
- **[Git Workflow Guide](docs/development/git-workflow.md)** - Branch strategy, commits, releases, and protection
- **[Maintenance Guide](docs/development/maintenance-guide.md)** - Dependency updates and Dependabot vulnerability management
- **[Troubleshooting Guide](docs/development/troubleshooting.md)** - TypeScript and build error resolution

### Quick Start Paths

- **I want to add a new command**: [Adding Commands Guide](docs/development/adding-commands.md)
- **I'm new to the project**: [Architecture Guide](docs/development/architecture.md)
- **I found a security vulnerability**: [Security Guide](docs/development/security-guide.md) + [Maintenance Guide](docs/development/maintenance-guide.md)
- **I need to update dependencies**: [Maintenance Guide](docs/development/maintenance-guide.md)

---

## Adding New Commands (Quick Checklist)

1. **Choose AWS-style name**: `get-video` (singular) or `get-videos` (plural)
2. **Create command file**: `commands/your-command.ts` with proper types
3. **Register in bin/staqan-yt.ts**: Add command with description
4. **Add types** (if needed): Update `types/index.ts`
5. **Build and test**: `npm run type-check && npm run lint && npm run build`
6. **Update documentation**:
   - Add to `docs/commands/<category>.md`
   - Update `lib/customHelp.ts` help grouping
   - Test examples

**→ See [Adding Commands Guide](docs/development/adding-commands.md) for detailed steps and templates.**

---

## Pre-Commit Checklist

**MANDATORY checks before committing:**

- [ ] **On a feature branch?** (NOT main!)
- [ ] **Tested all affected commands?**
- [ ] **Updated documentation?**
  - [ ] README.md (if user-facing changes)
  - [ ] docs/commands/<category>.md (command reference)
  - [ ] lib/customHelp.ts (help grouping)
- [ ] **Following AWS naming conventions?**
- [ ] **Credentials never committed?**

**Verify branch**: `git branch --show-current` (MUST NOT be "main")
**Verify staged files**: `git diff --staged --name-only`

---

## Commit Message Format

```
Brief description of change

Detailed explanation if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Release Process

**Single source of truth**: `package.json` is the source of truth for versioning.

### Quick Release (After Completing Work)

```bash
# Bump patch version
npm version patch

# Push to GitHub
git push && git push --tags
```

### Semantic Versioning (X.Y.Z)

- **Z (patch)** - Bug fixes, minor improvements, documentation updates
- **Y (minor)** - New commands, new features, significant refactoring
- **X (major)** - NEVER bump unless explicitly instructed

**→ See [Git Workflow Guide](docs/development/git-workflow.md#release-process) for detailed release process.**

---

## Related Documentation

- **[README.md](README.md)** - User-facing documentation (Homebrew-focused)
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contributor guide for humans
- **[docs/](docs/README.md)** - Comprehensive command reference
- **[docs/development/](docs/development/README.md)** - Development guides hub

---

## Updating This Documentation

### CLAUDE.md

This file is the **core manifesto** - keep it concise:
1. Critical rules (branch strategy, commit format)
2. Quick reference (commands, patterns, locations)
3. Architecture summaries (link to detailed guides)
4. Links to `docs/development/` guides

**DO NOT add detailed tutorials.** Keep under 400 lines.

### Development Guides

Each guide in `docs/development/` covers one topic. Update with:
- Detailed content and examples
- Cross-references to related guides
- Tested code examples

**→ See [docs/development/README.md](docs/development/README.md) for guide philosophy**

---

## Common Pitfalls

**❌ Don't:**
```javascript
const CLIENT_ID = 'hardcoded-id';  // NEVER hardcode credentials
program.command('getVideo');        // Wrong casing (use get-video)
program.command('get-videos <id>'); // Wrong (singular ID with plural name)
async function analyzeSubtitles() { } // Semantic logic belongs elsewhere
```

**✅ Do:**
```javascript
const creds = await loadCredentials(); // From ~/.staqan-yt-cli/
program.command('get-video <id>');     // AWS-style naming
program.command('get-videos <ids...>'); // Plural for batch
async function getVideo() { /* API only */ }
```

---

## Version

Current version: **1.3.18** (see `package.json` for source of truth)
