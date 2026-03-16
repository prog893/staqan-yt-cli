# Breaking Changes

## v1.5.0: Channel-isolated cache and data storage

**Directory structure change** — all per-channel data now lives under a channel ID namespace:

| Before | After |
|---|---|
| `~/.staqan-yt-cli/completion-cache.json` | `~/.staqan-yt-cli/data/{channelId}/completion_cache.json` |
| `~/.staqan-yt-cli/data/cache-index.json` | `~/.staqan-yt-cli/data/{channelId}/reports/cache-index.json` |
| `~/.staqan-yt-cli/data/reports/{reportTypeId}/` | `~/.staqan-yt-cli/data/{channelId}/reports/{reportTypeId}/` |

### ⚠️ Important: Old cached data will not be migrated

After upgrading to v1.5.0:
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

### Safety: Backup before upgrading

If you want to preserve your old cache (not required, but cautious):
```bash
tar -czf ~/staqan-data-backup.tar.gz ~/.staqan-yt-cli/data/
```

---

# Migration Guide: v1.2.x → v1.3.0

## Breaking Changes

All positional arguments have been removed. Commands now use required named flags exclusively (AWS CLI style).

## Command Migrations

### Video Operations

#### Get Video(s)
```bash
# Old (v1.2.x)
staqan-yt get-video dQw4w9WgXcQ
staqan-yt get-videos id1 id2 id3

# New (v1.3.0+)
staqan-yt get-video --video-id dQw4w9WgXcQ
staqan-yt get-videos --video-ids id1 id2 id3
```

#### Update Video
```bash
# Old (v1.2.x)
staqan-yt update-video dQw4w9WgXcQ --title "New Title"

# New (v1.3.0+)
staqan-yt update-video --video-id dQw4w9WgXcQ --title "New Title"
```

#### Video Analytics
```bash
# Old (v1.2.x)
staqan-yt get-video-analytics dQw4w9WgXcQ

# New (v1.3.0+)
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ
```

#### Video Tags
```bash
# Old (v1.2.x)
staqan-yt get-video-tags dQw4w9WgXcQ
staqan-yt update-video-tags dQw4w9WgXcQ --tags "tag1,tag2"

# New (v1.3.0+)
staqan-yt get-video-tags --video-id dQw4w9WgXcQ
staqan-yt update-video-tags --video-id dQw4w9WgXcQ --tags "tag1,tag2"
```

#### Thumbnail
```bash
# Old (v1.2.x)
staqan-yt get-thumbnail dQw4w9WgXcQ

# New (v1.3.0+)
staqan-yt get-thumbnail --video-id dQw4w9WgXcQ
```

### Channel Operations

#### List Videos
```bash
# Old (v1.2.x)
staqan-yt list-videos @mkbhd

# New (v1.3.0+)
staqan-yt list-videos --channel @mkbhd
```

#### Get Channel
```bash
# Old (v1.2.x)
staqan-yt get-channel @mkbhd

# New (v1.3.0+)
staqan-yt get-channel --channel @mkbhd
```

### Playlist Operations

#### Get Playlist(s)
```bash
# Old (v1.2.x)
staqan-yt get-playlist PLxxx
staqan-yt get-playlists id1 id2

# New (v1.3.0+)
staqan-yt get-playlist --playlist-id PLxxx
staqan-yt get-playlists --playlist-ids id1 id2
```

### Search

#### Search Videos
```bash
# Old (v1.2.x)
staqan-yt search-videos "iPhone review"
staqan-yt search-videos "iPhone review" --channel @mkbhd

# New (v1.3.0+)
staqan-yt search-videos --query "iPhone review"
staqan-yt search-videos --query "iPhone review" --channel @mkbhd
```

### Localizations

#### Get Video Localizations
```bash
# Old (v1.2.x)
staqan-yt get-video-localizations id1 id2 id3

# New (v1.3.0+)
staqan-yt get-video-localizations --video-ids id1 id2 id3
```

#### Get/Update Video Localization
```bash
# Old (v1.2.x)
staqan-yt get-video-localization dQw4w9WgXcQ --language ja
staqan-yt put-video-localization dQw4w9WgXcQ ja "Japanese Title" "Description"
staqan-yt update-video-localization dQw4w9WgXcQ --language ja --title "New Title"

# New (v1.3.0+)
staqan-yt get-video-localization --video-id dQw4w9WgXcQ --language ja
staqan-yt put-video-localization --video-id dQw4w9WgXcQ --language ja --title "Japanese Title" --description "Description"
staqan-yt update-video-localization --video-id dQw4w9WgXcQ --language ja --title "New Title"
```

### Captions

#### List Captions
```bash
# Old (v1.2.x)
staqan-yt list-captions dQw4w9WgXcQ

# New (v1.3.0+)
staqan-yt list-captions --video-id dQw4w9WgXcQ
```

#### Get Caption
```bash
# Old (v1.2.x)
staqan-yt get-caption en.dQw4w9WgXcQ

# New (v1.3.0+)
staqan-yt get-caption --caption-id en.dQw4w9WgXcQ
```

### Comments

#### List Comments
```bash
# Old (v1.2.x)
staqan-yt list-comments dQw4w9WgXcQ

# New (v1.3.0+)
staqan-yt list-comments --video-id dQw4w9WgXcQ
```

## Script Updates

### Batch Operations

When scripting with batch operations, update your commands to use named flags:

```bash
# Old
cat video_ids.txt | xargs -I {} staqan-yt update-video {} --title "New Title" --yes

# New
cat video_ids.txt | xargs -I {} staqan-yt update-video --video-id {} --title "New Title" --yes
```

### For Loops

```bash
# Old
for video_id in id1 id2 id3; do
  staqan-yt get-video "$video_id"
done

# New
for video_id in id1 id2 id3; do
  staqan-yt get-video --video-id "$video_id"
done
```

## Benefits of the New Syntax

- **Self-documenting**: Command intent is clearer with named flags
- **Flexible ordering**: Flags can be in any order
- **Better completion**: Tab completion suggests live YouTube data
- **AWS CLI consistency**: Matches industry-standard CLI conventions

## Configuration Shortcuts

You can set default values in your config to avoid repeating common flags:

```bash
# Set default channel
staqan-yt config set default.channel @mkbhd

# Now you can omit --channel for commands that support it
staqan-yt list-videos --limit 10
```

## Need Help?

Run `staqan-yt <command> --help` for usage information.

For detailed command documentation, see [docs/commands/](docs/commands/).
