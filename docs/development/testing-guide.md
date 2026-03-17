# Testing Guide

This guide covers testing strategies and patterns for the staqan-yt-cli project.

## Manual Testing

### Test Authentication

```bash
staqan-yt auth
```

### Test Configuration

```bash
# List all config
staqan-yt config list

# Set default channel
staqan-yt config set default.channel @staqan

# Set default output format
staqan-yt config set default.output csv

# Get specific value
staqan-yt config get default.channel
```

### Test All Output Formats

Test with `get-video` command:

```bash
# JSON format
staqan-yt get-video dQw4w9WgXcQ --output json

# Table format
staqan-yt get-video dQw4w9WgXcQ --output table

# Text format (tab-delimited)
staqan-yt get-video dQw4w9WgXcQ --output text

# CSV format
staqan-yt get-video dQw4w9WgXcQ --output csv

# Pretty format (default, colorful)
staqan-yt get-video dQw4w9WgXcQ --output pretty
# or just
staqan-yt get-video dQw4w9WgXcQ
```

### Test Multiple Video Operations

```bash
# Get multiple videos
staqan-yt get-videos dQw4w9WgXcQ abc123xyz --output csv
```

### Test List Videos (With and Without Channel)

```bash
# With explicit channel
staqan-yt list-videos @mkbhd --limit 5 --output csv

# With default channel from config
staqan-yt list-videos --limit 5
```

### Test Update (Dry Run)

```bash
# Dry run - no actual changes
staqan-yt update-video dQw4w9WgXcQ --title "Test" --dry-run

# Actual update (be careful!)
staqan-yt update-video dQw4w9WgXcQ --title "New Title" --yes
```

## Local Development

### Install Dependencies

```bash
npm install
```

### Link for Global Testing

```bash
npm link
```

Now you can test commands globally:

```bash
staqan-yt --help
staqan-yt get-video dQw4w9WgXcQ
```

### Build Commands

```bash
# Type check without emitting
npm run type-check

# Run linter
npm run lint

# Build the project
npm run build

# Development mode with tsx
npm run dev
```

## Test Patterns

### Non-Destructive Commands (Safe to Test)

These commands are read-only and safe to run:

```bash
# Video operations
staqan-yt get-video VIDEO_ID
staqan-yt get-videos ID1 ID2
staqan-yt get-thumbnail VIDEO_ID
staqan-yt get-video-tags VIDEO_ID

# Localization operations
staqan-yt get-video-localizations VIDEO_ID
staqan-yt get-video-localization VIDEO_ID es

# Comment operations
staqan-yt list-comments VIDEO_ID --limit 5

# Playlist operations
staqan-yt list-playlists @channel
staqan-yt get-playlist PLAYLIST_ID
staqan-yt get-playlists ID1 ID2

# Config operations
staqan-yt config list
staqan-yt config get default.channel

# MCP server
staqan-yt mcp  # (with timeout)
```

### Output Format Testing

Always test new commands with all output formats:

```bash
staqan-yt your-command --output json
staqan-yt your-command --output table
staqan-yt your-command --output text
staqan-yt your-command --output csv
staqan-yt your-command --output pretty
```

### Dry Run Testing

For commands that modify data, always test with `--dry-run` first:

```bash
staqan-yt update-video VIDEO_ID --title "Test" --dry-run
staqan-yt update-video VIDEO_ID --description "New description" --dry-run
```

## Test Checklist

Before committing changes:

- [ ] Type check passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] All non-destructive commands tested
- [ ] All output formats work correctly
- [ ] Error handling tested (invalid inputs, auth failures)
- [ ] Documentation updated
- [ ] Examples in documentation tested

## Related Guides

- [Adding Commands Guide](adding-commands.md) - Command creation
- [Error Handling Guide](error-handling.md) - Error testing
- [Output Formats Guide](output-formats.md) - Output testing
- [Troubleshooting Guide](troubleshooting.md) - Build and type errors
