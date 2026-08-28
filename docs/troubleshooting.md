# Troubleshooting Guide

Common issues and solutions for staqan-yt-cli.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Authentication Issues](#authentication-issues)
- [API Issues](#api-issues)
- [Configuration Issues](#configuration-issues)
- [Output Issues](#output-issues)
- [Performance Issues](#performance-issues)
- [MCP Issues](#mcp-issues)

---

## Installation Issues

### Homebrew "JSON::Ext::ParserConfig" Error

**Symptom:**
```
Error: uninitialized constant JSON::Ext::ParserConfig
```

**Cause:** Homebrew's bundled Ruby gems got corrupted (often caused by `brew bump-formula-pr` or similar commands upgrading incompatible gem versions).

**Solution:** Reset Homebrew's vendor directory and reinstall gems:
```bash
cd /opt/homebrew/Library/Homebrew
rm -rf vendor
git checkout .
brew update
brew doctor
```

Then reinstall staqan-yt:
```bash
brew install staqan-yt
```

**Prevention:** Avoid using `brew bump-formula-pr` for testing. Use manual formula testing instead:
```bash
# Clone and test formula locally
git clone https://github.com/prog893/staqan-yt-cli.git /tmp/test
cd /tmp/test
bun install && bun build ./bin/staqan-yt.ts --compile --outfile staqan-yt
./staqan-yt --version
```

---

## Authentication Issues

### "Credentials not found"

**Symptom:**
```
Error: Credentials not found at ~/.staqan-yt-cli/credentials.json
```

**Cause:** OAuth credentials file doesn't exist or is in wrong location.

**Solution:**
```bash
# Verify credentials file location
ls -la ~/.staqan-yt-cli/credentials.json

# If missing, create directory and add credentials
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json

# Verify file contents
cat ~/.staqan-yt-cli/credentials.json
```

**Expected file contents:**
```json
{
  "installed": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "client_secret": "your-client-secret",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

---

### "No authentication token found"

**Symptom:**
```
Error: No authentication token found. Please run: staqan-yt auth
```

**Cause:** Haven't authenticated yet or token file is missing.

**Solution:**
```bash
# Authenticate
staqan-yt auth
```

---

### Token refresh failures

The message distinguishes three causes, because only one of them is fixed by
re-authenticating.

**Refresh token rejected (`invalid_grant`).** The credentials really are dead:
revoked, expired, or invalidated by an account password change.

```
✗ Refresh token rejected by Google (invalid_grant): ...
```
```bash
staqan-yt auth
```

**Could not reach Google.** A dropped connection, a proxy, or a Google 5xx. The
saved credentials are untouched and still valid.

```
✗ Could not reach Google to refresh the access token: ...
  The saved credentials are still valid, so this does not need a re-authentication.
```

Re-authenticating here would discard a working session for no reason. Check
connectivity and retry.

**Anything else.** The underlying error is quoted, along with the OAuth error
code when the token endpoint supplied one.

```
✗ Failed to refresh the access token: <detail> (<oauth_error>)
```

---

### Browser doesn't open during auth

**Symptom:** Running `staqan-yt auth` doesn't open browser.

**Cause:** CLI can't open browser automatically.

**Solution:**
1. Copy the URL printed in the terminal
2. Paste it into your browser manually
3. Complete the OAuth flow
4. Copy the authorization code from browser
5. Paste it back into the terminal

---

## API Issues

### Views jumped suddenly, or two runs disagree

**Symptom:** View counts rose sharply with no matching change in traffic, or a
total you stored earlier no longer matches what the CLI returns for the same
date range. You may also see a note on stderr mentioning 2026-08-24.

**Cause:** On **2026-08-24** YouTube changed how views are counted. From that
date a view is counted from the first frame of playback, with no minimum watch
time. Earlier dates use the previous, stricter definition. The field name did
not change, so nothing in the numbers themselves marks the boundary.

This is not a bug and not a data correction. The two numbers answer different
questions.

**Solution:** use `engagedViews`, which keeps the stricter definition on both
sides of the date and is therefore the only view metric comparable across it:

```bash
# One consistent definition across the whole range
staqan-yt get-channel-analytics --dimensions day --metrics engagedViews \
  --start-date 2026-08-01 --end-date 2026-09-05

# Both, to see the difference for yourself
staqan-yt get-channel-analytics --dimensions day --metrics views,engagedViews \
  --start-date 2026-08-01 --end-date 2026-09-05 --sort -engagedViews
```

Note that `views` and `engagedViews` already differed for the same range before
2026-08-24, so the change date is not a clean before/after split between them.

The Data API's `statistics.viewCount` (`get-video`, `get-channel`) uses the new
definition and has no `engagedViews` equivalent; the previous definition is only
reachable through the Analytics and Reporting APIs.

**Reference:** [How YouTube counts views](https://support.google.com/youtube/answer/2991785)

---

### "API quota exceeded"

**Symptom:**
```
Error: Quota exceeded
```

**Cause:** YouTube Data API daily quota reached (10,000 units default).

**Solution:**
```bash
# Wait 24 hours for quota reset
# OR request quota increase in Google Cloud Console
# OR optimize queries to use fewer API calls
```

**Reduce quota usage:**
- Use batch operations (`get-videos` instead of multiple `get-video`)
- Use `--limit` to reduce result sizes
- Avoid unnecessary list operations
- Cache results locally

---

### "Channel not found"

**Symptom:**
```
Error: Channel not found: @channelname
```

**Cause:** Invalid channel handle/ID or channel doesn't exist.

**Solution:**
```bash
# Verify channel handle/ID is correct
staqan-yt get-channel @channelname

# Try using channel URL
staqan-yt get-channel https://www.youtube.com/@channelname

# Check channel is public
# Visit channel in browser to verify
```

---

### "Video not found"

**Symptom:**
```
Error: Video not found: VIDEO_ID
```

**Cause:** Video ID is invalid or video doesn't exist.

**Solution:**
```bash
# Verify video ID (11 characters)
staqan-yt get-video dQw4w9WgXcQ

# Try using video URL
staqan-yt get-video https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Check video is public
# Visit video in browser to verify
```

---

### "Invalid credentials"

**Symptom:**
```
Error: Invalid credentials
```

**Cause:** OAuth credentials are invalid or don't have required scopes.

**Solution:**
```bash
# Verify credentials file
cat ~/.staqan-yt-cli/credentials.json

# Re-create credentials file
# 1. Go to Google Cloud Console
# 2. Create new OAuth client ID
# 3. Download credentials
# 4. Save to ~/.staqan-yt-cli/credentials.json

# Re-authenticate
staqan-yt auth
```

---

## Configuration Issues

### "Default channel not set"

**Symptom:** Commands ask for channel handle every time.

**Cause:** `default.channel` not configured.

**Solution:**
```bash
# Set default channel
staqan-yt config set default.channel @yourchannel

# Verify
staqan-yt config show
```

---

### "Invalid output format"

**Symptom:**
```
Error: Invalid output format: xyz
```

**Cause:** Unsupported output format specified.

**Solution:**
```bash
# Use valid format: json, csv, table, text, pretty
staqan-yt get-video VIDEO_ID --output json

# Check current default
staqan-yt config get default.output
```

---

### Config file corrupted

**Symptom:** Config commands fail with JSON errors.

**Cause:** Invalid JSON in config file.

**Solution:**
```bash
# View current config
cat ~/.staqan-yt-cli/config.json

# Reset to defaults
rm ~/.staqan-yt-cli/config.json

# Reconfigure
staqan-yt config set default.channel @yourchannel
```

---

### Lock file errors

**Problem:**
```
Failed to acquire reports lock
Another fetch operation is in progress. Wait for it to complete or run: rm ~/.staqan-yt-cli/data/*/reports/.lock
```

**Cause:** Another `staqan-yt fetch-reports` command is already running for this channel.

**Solutions:**
1. **Wait** for the other operation to complete (check with `ps aux | grep staqan-yt`)
2. **Remove stale lock** if process crashed: `rm ~/.staqan-yt-cli/data/{channelId}/reports/.lock`
3. **Verify channel** - locks are per-channel, ensure you're using the correct channel
4. **Increase timeout** if the operation legitimately takes longer than 60 s (slow networks / large report sets):
   ```bash
   staqan-yt config set lock.timeout 120000   # 2 minutes
   # or one-shot via env var:
   STAQAN_YT_LOCK_TIMEOUT_MS=120000 staqan-yt fetch-reports --channel @yourchannel
   ```

**Lock file locations:**
- Completion cache: `data/{channelId}/completion_cache.json.lock`
- Handle cache: `data/handle-to-channel-id.json.lock`
- Reports directory: `data/{channelId}/reports/.lock`

**Note:** Locks auto-expire after 30 minutes or if the PID no longer exists.

---

## Output Issues

### CSV not opening in Excel correctly

**Symptom:** Excel opens CSV with wrong formatting.

**Cause:** Excel's CSV import has issues with UTF-8 and special characters.

**Solution:**
```bash
# Use "Import CSV" instead of double-clicking
# 1. Open Excel
# 2. Data > Get Data > From File > From Text/CSV
# 3. Select your CSV file
# 4. Choose UTF-8 encoding
# 5. Click Load
```

**OR** change file extension:
```bash
mv output.csv output.txt
# Then use Excel's Text Import Wizard
```

---

### JSON parsing errors

**Symptom:** `jq` can't parse JSON output.

**Cause:** Invalid JSON or mixed output.

**Solution:**
```bash
# Validate JSON
staqan-yt get-video VIDEO_ID --output json | jq .

# Check for errors in verbose mode
staqan-yt get-video VIDEO_ID --output json --verbose

# Handle null values
staqan-yt get-video VIDEO_ID --output json | jq '.title?'
```

---

### Table output truncated

**Symptom:** Table columns are cut off or too narrow.

**Cause:** Terminal width is too narrow.

**Solution:**
```bash
# Increase terminal width
# OR use CSV/JSON instead
staqan-yt list-videos @yourchannel --output csv

# Pipe to less
staqan-yt list-videos @yourchannel --output table | less
```

---

### No colors in pretty output

**Symptom:** Pretty output has no colors.

**Cause:** Terminal doesn't support colors or color output disabled.

**Solution:**
```bash
# Check terminal supports color
echo $(tput colors)

# Use table format instead
staqan-yt get-video VIDEO_ID --output table

# Force color (some terminals)
FORCE_COLOR=1 staqan-yt get-video VIDEO_ID
```

---

## Performance Issues

### Commands are slow

**Symptom:** Commands take a long time to complete.

**Cause:** API rate limits, large datasets, or network issues.

**Solution:**
```bash
# Use verbose mode to see what's happening
staqan-yt list-videos @yourchannel --verbose

# Reduce dataset size
staqan-yt list-videos @yourchannel --limit 10

# Use more efficient formats
staqan-yt get-video VIDEO_ID --output json  # Faster than pretty
```

---

### MCP server slow

**Symptom:** Claude Desktop takes long to respond to YouTube queries.

**Cause:** MCP server performance or network latency.

**Solution:**
```bash
# Test MCP server directly
staqan-yt mcp --verbose

# Check network connectivity
ping youtube.com

# Restart Claude Desktop
```

---

### Memory issues with large datasets

**Symptom:** Command crashes or runs out of memory.

**Cause:** Processing too much data at once.

**Solution:**
```bash
# Process in smaller batches
staqan-yt list-videos @yourchannel --limit 50

# Use pagination
for page in 1 2 3 4 5; do
  staqan-yt list-videos @yourchannel --limit 50
  # Process results
done

# Stream output instead of storing
staqan-yt list-videos @yourchannel --output json | jq -c '.[]' | while read video; do
  # Process each video
done
```

---

## MCP Issues

### "MCP server not found"

**Symptom:** Claude Desktop can't connect to MCP server.

**Cause:** CLI not installed or config file incorrect.

**Solution:**
```bash
# Verify CLI is installed
staqan-yt --version

# Check config file path
# macOS: ~/Claude/claude_desktop_config.json
# Windows: %APPDATA%\Claude\claude_desktop_config.json

# Test MCP server
staqan-yt mcp

# Restart Claude Desktop
```

---

### "MCP tools not available"

**Symptom:** Claude doesn't show YouTube tools.

**Cause:** MCP server not running or auth issues.

**Solution:**
```bash
# Test MCP server
staqan-yt mcp --verbose

# Verify authentication
staqan-yt auth

# Check Claude Desktop logs
# macOS: ~/Library/Logs/Claude/
# Windows: %APPDATA%\Claude\logs\
```

---

### MCP authentication errors

**Symptom:** MCP server can't authenticate with YouTube.

**Cause:** Token expired or credentials missing.

**Solution:**
```bash
# Re-authenticate
staqan-yt auth

# Verify credentials exist
ls -la ~/.staqan-yt-cli/credentials.json
ls -la ~/.staqan-yt-cli/token.json

# Test with verbose output
staqan-yt mcp --verbose
```

---

## Getting Help

### Check verbose output

```bash
# Enable verbose mode to see what's happening
staqan-yt <command> --verbose
```

### Check configuration

```bash
# Show current configuration
staqan-yt config show

# Check credentials exist
ls -la ~/.staqan-yt-cli/
```

### Verify installation

```bash
# Check version
staqan-yt --version

# Test basic command
staqan-yt get-channel @YouTube --output json
```

### Check API status

```bash
# Verify YouTube API is working
curl https://www.googleapis.com/youtube/v3/search?key=YOUR_API_KEY&q=test

# Check Google Cloud Console for API status
```

---

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Credentials not found` | No OAuth credentials file | Save credentials to `~/.staqan-yt-cli/credentials.json` |
| `No authentication token found` | Not authenticated | Run `staqan-yt auth` |
| `Quota exceeded` | API quota reached | Wait 24 hours or request increase |
| `Channel not found` | Invalid channel handle/ID | Verify channel exists and is public |
| `Video not found` | Invalid video ID | Verify video ID (11 characters) |
| `Invalid credentials` | Wrong OAuth credentials | Re-create credentials file |
| `Refresh token rejected ... (invalid_grant)` | Credentials revoked or expired | Run `staqan-yt auth` |
| `Could not reach Google to refresh ...` | Network or Google 5xx | Retry; credentials are still valid |
| `Invalid output format` | Wrong format specified | Use: json, csv, table, text, pretty |

---

## Reporting Issues

If you can't resolve the issue:

1. **Check verbose output:**
   ```bash
   staqan-yt <command> --verbose > output.log 2>&1
   ```

2. **Gather information:**
   - CLI version: `staqan-yt --version`
   - Command that failed
   - Error message
   - Verbose log file

3. **Search existing issues:**
   - [GitHub Issues](https://github.com/prog893/staqan-yt-cli/issues)

4. **Create new issue:**
   - Include all gathered information
   - Describe steps to reproduce
   - Include error logs

---

## Prevention Tips

### Regular Maintenance

```bash
# Re-authenticate periodically
staqan-yt auth

# Update CLI (if using Homebrew)
brew upgrade staqan-yt

# Check configuration
staqan-yt config show

# Archive reports before they expire
staqan-yt fetch-reports --verify
```

### Backup Configuration

```bash
# Backup configuration and credentials
cp -r ~/.staqan-yt-cli ~/.staqan-yt-cli.backup

# Restore if needed
cp -r ~/.staqan-yt-cli.backup ~/.staqan-yt-cli
```

### Monitor Quota

```bash
# Check your API usage in Google Cloud Console
# https://console.cloud.google.com/apis/dashboard

# Use efficient commands to minimize quota
# - Batch operations: get-videos (not multiple get-video)
# - Limit results: --limit flag
# - Cache results locally
```

### Best Practices

1. **Use `--dry-run`** for write operations to preview changes
2. **Start with `--limit`** to test before fetching large datasets
3. **Use `--output json`** for programmatic processing
4. **Set `default.channel`** to avoid repetition
5. **Monitor API quota** to avoid interruptions
6. **Archive reports** before they expire (30-60 days)
7. **Keep credentials secure** - never commit to version control
8. **Use verbose mode** when debugging issues
