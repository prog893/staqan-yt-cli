# Git Workflow Guide

This guide covers the git workflow, branch strategy, and release process for the staqan-yt-cli project.

## ⚠️ Branch Strategy

### 🚨 NEVER Commit Directly to Main Branch

**EVERY commit MUST be on a feature branch.**

### Branch Naming Convention

- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `refactor/name` - Code refactoring

### Correct Workflow

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

### Recovery If You Mess Up

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

### Verify Branch Before Committing

```bash
# This MUST NOT be "main"
git branch --show-current

# If it shows "main", STOP and create feature branch:
git checkout -b feature/your-feature-name
```

## Commit Message Format

Follow the established pattern:

```
Brief description of change

Detailed explanation if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Commit Message Examples

```
Feat: Add get-playlist command

Added new command to retrieve single playlist details:
- get-playlist <playlistId> - Get one playlist
- Supports all output formats
- Includes error handling for invalid IDs

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
Fix: Update video category ID preservation

Fixed bug where update-video was losing category ID.
Now preserves existing category when updating metadata.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

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

### Verify What You're Committing

```bash
# Check staged files
git diff --staged --name-only

# Check for unintended files (credentials, etc.)
git status

# Ensure branch is correct
git branch --show-current
```

## Release Process

**IMPORTANT**: This project does NOT use GitHub releases. All releases are managed through version bumps, git tags, and Homebrew formula updates.

### Version Management

**Single source of truth**: `package.json` is the source of truth for versioning. All other files are automatically synced from it.

### Release Workflow

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

### What Gets Synced Automatically

- `package.json` - Source of truth
- `bin/staqan-yt.ts` - Fallback version for compiled binary
- `Formula/staqan-yt.rb` - Homebrew formula version

### Semantic Versioning Rules (X.Y.Z)

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

**Default behavior**: Always bump Z (patch) unless told otherwise.

### Release Examples

- `1.2.3` → `1.2.4` - Bug fix, documentation update
- `1.2.4` → `1.3.0` - Added new `list-playlists` command
- `1.3.0` → `2.0.0` - Only if explicitly instructed for major breaking change

## Branch Protection

### Recommended Branch Protection Rules

Consider enabling on GitHub:

1. **Require pull request reviews before merging**
   - Required approving reviewers: 1

2. **Require status checks to pass before merging**
   - Require branches to be up to date before merging

3. **Restrict who can push to main branch**
   - Only allow: administrators (or specific users)

4. **Do not allow bypassing the above settings**

### Setting Up Branch Protection

Via GitHub UI:
1. Go to repository Settings
2. Click "Branches" in left sidebar
3. Click "Add rule" for `main` branch
4. Configure restrictions and checks

Via GitHub CLI:
```bash
gh api repos/OWNER/REPO/branches/main/protection \
  --method PUT \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f enforce_admins=true \
  -f required_status_checks='{"strict":true,"contexts":[]}' \
  -f restrictions=null
```

## Pull Request Workflow

### Creating a PR

```bash
# After pushing feature branch
gh pr create \
  --title "Feature: Your Feature Name" \
  --body "Description of changes:

- Added X feature
- Fixed Y bug
- Updated Z documentation

Testing:
- Tested all affected commands
- All output formats work
- Error handling verified"

# Or open in browser to edit
gh pr create --web
```

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Change 1
- Change 2
- Change 3

## Testing
- [ ] All affected commands tested
- [ ] All output formats tested
- [ ] Error cases tested
- [ ] Documentation updated

## Checklist
- [ ] On feature branch (not main)
- [ ] Follows AWS naming conventions
- [ ] No credentials committed
- [ ] Documentation updated
- [ ] Ready for review
```

### Updating a PR

```bash
# Make additional changes
git add -A
git commit -m "Additional changes"

# Push to same branch
git push

# PR automatically updates
```

## Related Guides

- [CLAUDE.md](../../CLAUDE.md) - Critical rules
- [Adding Commands Guide](adding-commands.md) - Command development workflow
- [Maintenance Guide](maintenance-guide.md) - Dependency updates and security
