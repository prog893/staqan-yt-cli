# Maintenance Guide

This guide covers dependency updates, breaking changes, and Dependabot vulnerability management for the staqan-yt-cli project.

## Updating Dependencies

### Check for Updates

```bash
npm outdated
```

### Update Dependencies

```bash
# Update specific package
npm update <package-name>

# Update all (use with caution)
npm update

# Update to latest versions (may include breaking changes)
npx npm-check-updates -u
npm install
```

### After Updating

```bash
# Build the project
npm run build

# Run type checking
npm run type-check

# Run linter
npm run lint

# Test all non-destructive commands:
# - Video operations: get-video, get-videos, get-thumbnail, get-video-tags
# - Localizations: get-video-localizations, get-video-localization
# - Comments: list-comments
# - Playlists: list-playlists, get-playlist, get-playlists
# - Config: config list/get/set
# - MCP server: staqan-yt mcp (test with timeout)
# - Output formats: test with --output json/table/text/csv/pretty
```

## Breaking Changes

If the YouTube API changes or dependencies introduce breaking changes:

1. Update googleapis dependency
2. Test all commands
3. Update documentation
4. Increment major version (if truly breaking to users)
5. Document migration in BREAKING-CHANGES.md

## Dependabot Vulnerability Management

This project uses GitHub Dependabot for automated dependency vulnerability tracking.

### Checking for Vulnerabilities

**Use GitHub CLI to fetch Dependabot alerts:**

```bash
# List all open Dependabot alerts
gh api '/repos/prog893/staqan-yt-cli/dependabot-alerts?state=open'

# Get formatted summary
gh api '/repos/prog893/staqan-yt-cli/dependabot-alerts?state=open' \
  --jq '.[] | "\(.security_vulnerability.severity) - \(.dependency.package.name) (vulnerable: \(.security_vulnerability.vulnerable_version_range), patched: \(.security_vulnerability.first_patched_version.identifier))"'
```

### Git Push Vulnerability Feedback

When you push to GitHub, the remote will alert you if there are vulnerabilities:

```
remote: GitHub found 7 vulnerabilities on prog893/staqan-yt-cli's default branch (3 high, 4 moderate).
remote: To find out more about visit: https://github.com/prog893/staqan-yt-cli/security/dependabot
```

**IMPORTANT**: The vulnerability count shown during push reflects the state **before** your push. Dependabot rescans after the push completes, so even after pushing a fix, you'll still see the old warning. Don't worry - the count will update on the next push once Dependabot rescans.

### Vulnerability Fix Workflow

#### 1. Assess the Vulnerabilities

```bash
# Fetch and review alerts
gh api '/repos/prog893/staqan-yt-cli/dependabot-alerts?state=open' | jq .

# Check dependency chain
npm ls <vulnerable-package>
```

#### 2. Update Dependencies

```bash
# Update specific package
npm update <package-name>

# Or update all (use with caution)
npm update
```

#### 3. Test Thoroughly

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

#### 4. Commit and Release

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

#### 5. Verify

After pushing, GitHub will rescan the repository asynchronously.

- **Expected**: You may still see vulnerability warnings on this push (they reflect the pre-push state)
- **Verification**: The Dependabot alerts page will update within a few minutes
- **Confirmation**: Next time you push, the warning will be gone if the fix was successful

### Vulnerability Severity Classification

Based on security best practices:

| Severity | Timeline | Examples |
|----------|----------|----------|
| **Critical** | Immediate | System can be stopped, personal data exposed |
| **High** | This month | Limited attack conditions, non-critical impact |
| **ModerATE** | Within 6 months | Dev-only usage, vulnerable feature not used |
| **None** | Skip | Not actually used |

### Real-World Example

**Issue**: 7 Dependabot alerts (3 HIGH, 4 MEDIUM)
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

**Solution**: Update the direct dependency
```bash
npm update @modelcontextprotocol/sdk
# This automatically updates hono to 4.11.8 (patched version)
```

**Result**: All 7 alerts fixed with one update, tested comprehensively, released as v1.3.6.

## Best Practices

### Keep Alerts at 0

- Stay sensitive to new security warnings
- Address HIGH/CRITICAL issues immediately
- Plan MODERATE issues for batched updates
- Skip NONE severity (not actually used)

### Check Dependency Chains

- Transitive dependencies often bring vulnerabilities
- Use `npm ls <package>` to trace chains
- Update direct dependencies to fix transitive issues

### Test After Updates

- Especially functionality that uses vulnerable packages
- Test all output formats
- Verify error handling still works

### Document Legitimate Usage

- If a package has vulnerabilities but you don't use affected features
- Document why in code comments or SECURITY.md
- Consider replacing with safer alternatives

### Update Planning

- **HIGH/CRITICAL**: Update quickly - can have real security impact
- **MODERATE**: Can be batched with other maintenance
- **NONE**: Skip or replace package

## Automation Ideas

### Daily Vulnerability Check

Consider creating a GitHub Actions workflow to:

- Check Dependabot alerts daily
- Post to Slack when new alerts appear
- Create issues for unaddressed vulnerabilities

Example workflow (`.github/workflows/security.yml`):

```yaml
name: Security Scan

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9am
  workflow_dispatch:

jobs:
  dependabot-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Check for Dependabot alerts
        run: |
          alerts=$(gh api '/repos/prog893/staqan-yt-cli/dependabot-alerts?state=open' | jq length)
          if [ "$alerts" -gt 0 ]; then
            echo "Found $alerts open Dependabot alerts"
            # Create issue or post to Slack
          fi
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Automated Dependency Updates

Enable Dependabot for automated PRs (`.github/dependabot.yml`):

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

## Related Guides

- [Security Guide](security-guide.md) - Security best practices
- [Testing Guide](testing-guide.md) - Testing after updates
- [Git Workflow Guide](git-workflow.md) - Release process
