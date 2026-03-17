# Breaking Changes

## v2.0.0: Channel-isolated cache and data storage

**Directory structure change** — all per-channel data now lives under a channel ID namespace:

| Before | After |
|---|---|
| `~/.staqan-yt-cli/completion-cache.json` | `~/.staqan-yt-cli/data/{channelId}/completion_cache.json` |
| `~/.staqan-yt-cli/data/cache-index.json` | `~/.staqan-yt-cli/data/{channelId}/reports/cache-index.json` |
| `~/.staqan-yt-cli/data/reports/{reportTypeId}/` | `~/.staqan-yt-cli/data/{channelId}/reports/{reportTypeId}/` |

### ⚠️ Important: Old cached data will not be migrated

After upgrading to v2.0.0:
- Existing report cache will be ignored (not deleted, but not used)
- Tab completion will rebuild on first use
- You'll need to re-download reports

### Steps after upgrade

1. **Set your default channel** (required):
   ```bash
   staqan-yt config set default.channel @yourchannel
   ```

2. **Re-download your reports** (if you had cached data):
   ```bash
   staqan-yt fetch-reports --type channel_reach_basic_a1
   ```

3. **Tab completion will auto-rebuild** on first use

### Optional: Clean up old data

If you want to remove the old unused cache files:
```bash
rm ~/.staqan-yt-cli/completion-cache.json
rm -rf ~/.staqan-yt-cli/data/cache-index.json
rm -rf ~/.staqan-yt-cli/data/reports/
```

### Advanced: Manual migration

If you want to preserve your cached reports, you can manually migrate them. The schema changes are minimal:

**1. Cache index changes** (`cache-index.json`):

Before (v1.0):
```json
{
  "version": "1.0",
  "lastUpdated": "2026-03-16T00:00:37.235Z",
  "entries": [
    {
      "reportId": "18715771037",
      "reportTypeId": "channel_reach_basic_a1",
      "startTime": "2026-02-28T08:00:00Z",
      "endTime": "2026-03-01T08:00:00Z",
      "fileSize": 1244,
      "row_count": 23
    }
  ]
}
```

After (v2.0):
```json
{
  "version": "2.0",
  "lastUpdated": "2026-03-16T00:00:37.235Z",
  "entries": [
    {
      "reportId": "18715771037",
      "reportTypeId": "channel_reach_basic_a1",
      "startTime": "2026-02-28T08:00:00Z",
      "endTime": "2026-03-01T08:00:00Z",
      "fileSize": 1244,
      "row_count": 23,
      "channelId": "UCBQQNUsrd9mgCjsrLogKW6Q"
    }
  ]
}
```

**2. Report metadata changes** (`{reportId}.metadata.json`):

Before:
```json
{
  "reportId": "18715771037",
  "reportTypeId": "channel_reach_basic_a1",
  "jobId": "daa51074-6e66-439b-82a2-ac956262b4a2",
  ...
  "isComplete": true,
  "fileSize": 1244,
  "row_count": 23
}
```

After:
```json
{
  "reportId": "18715771037",
  "reportTypeId": "channel_reach_basic_a1",
  "jobId": "daa51074-6e66-439b-82a2-ac956262b4a2",
  ...
  "isComplete": true,
  "fileSize": 1244,
  "row_count": 23,
  "channelId": "UCBQQNUsrd9mgCjsrLogKW6Q"
}
```

**Migration script example** (for advanced users):

```bash
#!/bin/bash
# Manual migration script - BACKUP FIRST!

CHANNEL_ID="UCBQQNUsrd9mgCjsrLogKW6Q"  # Your channel ID
OLD_DIR="$HOME/.staqan-yt-cli/data"
NEW_DIR="$HOME/.staqan-yt-cli/data/$CHANNEL_ID"

# Create new directory structure
mkdir -p "$NEW_DIR/reports"

# Migrate cache-index.json
jq --arg cid "$CHANNEL_ID" \
  '.version = "2.0" | .entries[]?.channelId = $cid' \
  "$OLD_DIR/cache-index.json" > "$NEW_DIR/reports/cache-index.json"

# Move and migrate report directories
for report_type in "$OLD_DIR/reports"/*; do
  type_name=$(basename "$report_type")
  mkdir -p "$NEW_DIR/reports/$type_name"

  for metadata_file in "$report_type"/*.metadata.json; do
    jq --arg cid "$CHANNEL_ID" \
      '.entries[]?.channelId = $cid' \
      "$metadata_file" > "$NEW_DIR/reports/$type_name/$(basename $metadata_file)"
  done

  # Move CSV data files (no changes needed)
  cp "$report_type"/*.csv "$NEW_DIR/reports/$type_name/" 2>/dev/null
done
```

### Safety: Backup before upgrading

If you want to preserve your old cache (not required, but cautious):
```bash
tar -czf ~/staqan-data-backup.tar.gz ~/.staqan-yt-cli/data/
```

---

## v2.0.0: All positional arguments migrated to named flags

**Command syntax change** — all positional arguments have been removed. Commands now use required named flags exclusively.

### What changed?

| Command type | Before (v1.x) | After (v2.0.0) |
|---|---|---|
| **Single video operations** | `staqan-yt get-video dQw4w9WgXcQ` | `staqan-yt get-video --video-id dQw4w9WgXcQ` |
| **Batch video operations** | `staqan-yt get-videos id1 id2 id3` | `staqan-yt get-videos --video-ids id1 id2 id3` |
| **Channel operations** | `staqan-yt list-videos @mkbhd` | `staqan-yt list-videos --channel @mkbhd` |
| **Search operations** | `staqan-yt search-videos "query"` | `staqan-yt search-videos --query "query"` |
| **Update operations** | `staqan-yt update-video ID --title "X"` | `staqan-yt update-video --video-id ID --title "X"` |

### ⚠️ Important: All existing scripts and aliases will break

After upgrading to v2.0.0:
- Any scripts using positional arguments will fail
- Shell aliases with hardcoded positional args will need updating
- Command-line history with old syntax won't work

### Steps after upgrade

**1. Update your scripts**

Replace positional arguments with named flags:

```bash
# Old (v1.x)
cat video_ids.txt | xargs -I {} staqan-yt update-video {} --title "New Title" --yes

# New (v2.0.0)
cat video_ids.txt | xargs -I {} staqan-yt update-video --video-id {} --title "New Title" --yes
```

```bash
# Old (v1.x)
for video_id in id1 id2 id3; do
  staqan-yt get-video "$video_id"
done

# New (v2.0.0)
for video_id in id1 id2 id3; do
  staqan-yt get-video --video-id "$video_id"
done
```

**2. Update your shell aliases**

```bash
# Old (v1.x)
alias getvid='staqan-yt get-video'

# New (v2.0.0)
alias getvid='staqan-yt get-video --video-id'
```

### Command migration reference

**Video operations:**
```bash
# Get single video
staqan-yt get-video --video-id dQw4w9WgXcQ

# Get multiple videos
staqan-yt get-videos --video-ids id1 id2 id3

# Update video
staqan-yt update-video --video-id dQw4w9WgXcQ --title "New Title"

# Get analytics
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ

# Get/update tags
staqan-yt get-video-tags --video-id dQw4w9WgXcQ
staqan-yt update-video-tags --video-id dQw4w9WgXcQ --tags "tag1,tag2"

# Get thumbnail
staqan-yt get-thumbnail --video-id dQw4w9WgXcQ
```

**Channel operations:**
```bash
# List videos
staqan-yt list-videos --channel @mkbhd

# Get channel info
staqan-yt get-channel --channel @mkbhd
```

**Playlist operations:**
```bash
# Get single playlist
staqan-yt get-playlist --playlist-id PLxxx

# Get multiple playlists
staqan-yt get-playlists --playlist-ids id1 id2
```

**Search operations:**
```bash
# Search videos
staqan-yt search-videos --query "iPhone review"
staqan-yt search-videos --query "iPhone review" --channel @mkbhd
```

**Localization operations:**
```bash
# Get all localizations
staqan-yt get-video-localizations --video-ids id1 id2 id3

# Get single localization
staqan-yt get-video-localization --video-id dQw4w9WgXcQ --language ja

# Create localization
staqan-yt put-video-localization --video-id dQw4w9WgXcQ --language ja --title "Japanese Title" --description "Description"

# Update localization
staqan-yt update-video-localization --video-id dQw4w9WgXcQ --language ja --title "New Title"
```

**Caption operations:**
```bash
# List captions
staqan-yt list-captions --video-id dQw4w9WgXcQ

# Get caption
staqan-yt get-caption --caption-id en.dQw4w9WgXcQ
```

**Comment operations:**
```bash
# List comments
staqan-yt list-comments --video-id dQw4w9WgXcQ
```

### Benefits of the new syntax

- **Self-documenting**: Command intent is clearer with named flags
- **Flexible ordering**: Flags can be in any order
- **Better completion**: Tab completion suggests live YouTube data

### Configuration shortcuts

You can set default values in your config to avoid repeating common flags:

```bash
# Set default channel
staqan-yt config set default.channel @mkbhd

# Now you can omit --channel for commands that support it
staqan-yt list-videos --limit 10
```

### Need help?

Run `staqan-yt <command> --help` for usage information.

For detailed command documentation, see [docs/commands/](docs/commands/).
