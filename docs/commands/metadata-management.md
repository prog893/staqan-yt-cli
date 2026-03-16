# Metadata Management Commands

Commands for managing video metadata and localizations.

## update-video

Update video title and/or description.

### Usage

```bash
staqan-yt update-video --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

- `-t, --title <title>` - New video title
- `-d, --description <description>` - New video description
- `--dry-run` - Preview changes without applying them
- `-y, --yes` - Skip confirmation prompt
- `--output <format>` - Output format: json, table, text, pretty, csv
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Preview changes (dry run)
staqan-yt update-video --video-id dQw4w9WgXcQ --title "New Title" --dry-run

# Update title with confirmation
staqan-yt update-video --video-id dQw4w9WgXcQ --title "Updated: My Video Title"

# Update description without confirmation
staqan-yt update-video --video-id dQw4w9WgXcQ \
  --description "New description here" \
  --yes

# Update both title and description
staqan-yt update-video --video-id dQw4w9WgXcQ \
  --title "New Title" \
  --description "New description"

# Update and show result as JSON
staqan-yt update-video --video-id dQw4w9WgXcQ \
  --title "New Title" \
  --output json
```

### Safety Features

1. **Preview with `--dry-run`** - See what will change without applying
2. **Confirmation prompt** - Requires confirmation unless `--yes` is used
3. **Preserves category** - Keeps the existing video category ID

### API Quota Cost

- 50 units per video update
- Use `--dry-run` to preview without quota cost

### Related Commands

- `get-video` - Get current video metadata
- `update-video-localization` - Update localized metadata

---

## get-video-localization

Get specific video localization for a language.

### Usage

```bash
staqan-yt get-video-localization --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

- `--language <lang>` - Language code or name (e.g., "ja", "Japanese", "ja-JP")
- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get main metadata language (default)
staqan-yt get-video-localization --video-id dQw4w9WgXcQ

# Get Japanese localization
staqan-yt get-video-localization --video-id dQw4w9WgXcQ --language ja

# Get Russian localization
staqan-yt get-video-localization --video-id dQw4w9WgXcQ --language Russian

# Output as JSON
staqan-yt get-video-localization --video-id dQw4w9WgXcQ --language ja --output json
```

### Language Specification

Accepts any of these formats:
- Language code: `ja`, `en`, `ru`
- Language name: `Japanese`, `English`, `Russian`
- Full locale: `ja-JP`, `en-US`

### What is a Localization?

Localizations are translated versions of video metadata:
- Title in different languages
- Description in different languages
- Helps videos reach international audiences

### Related Commands

- `get-video-localizations` - Get all localizations at once
- `put-video-localization` - Create new localization
- `update-video-localization` - Update existing localization

---

## get-video-localizations

Get all video localizations including the main metadata language. Supports multiple videos.

### Usage

```bash
staqan-yt get-video-localizations --video-ids <videoIds...>
```

### Options

- `--video-ids <ids...>` - One or more YouTube video IDs (space-separated, required)

- `--languages <langs>` - Comma-separated list of languages (e.g. "en,ja,ru")
- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get all localizations for a video
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ

# Get specific languages only
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ --languages en,ja,ru

# Get localizations for multiple videos
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ abc123xyz def456uvw

# Export to JSON
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ --output json

# Export to CSV
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ --languages en,ja --output csv
```

### Output Structure

Each video shows:
- Main metadata language (usually the channel's default)
- All available localizations
- Empty fields for missing localizations

### Filtering Languages

Use `--languages` to only show specific languages:

```bash
# Only English and Japanese
staqan-yt get-video-localizations --video-ids dQw4w9WgXcQ --languages en,ja

# Common language codes:
# en - English
# ja - Japanese
# ru - Russian
# es - Spanish
# de - German
# fr - French
```

### Related Commands

- `get-video-localization` - Get specific language localization
- `put-video-localization` - Create new localization
- `update-video-localization` - Update existing localization

---

## put-video-localization

Create a new video localization for a language. Fails if the localization already exists.

### Usage

```bash
staqan-yt put-video-localization --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

### Required Options

- `--language <lang>` - Language code or name (e.g., "ja", "Japanese")
- `--title <title>` - Localized title
- `--description <desc>` - Localized description

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Create Japanese localization
staqan-yt put-video-localization --video-id dQw4w9WgXcQ \
  --language ja \
  --title "日本語のタイトル" \
  --description "日本語の説明"

# Create Russian localization
staqan-yt put-video-localization --video-id dQw4w9WgXcQ \
  --language Russian \
  --title "Название на русском" \
  --description "Описание на русском"

# Create Spanish localization
staqan-yt put-video-localization --video-id dQw4w9WgXcQ \
  --language es \
  --title "Título en español" \
  --description "Descripción en español"
```

### Error Behavior

This command **fails** if the localization already exists:

```
Error: Localization for language 'ja' already exists. Use update-video-localization instead.
```

To update an existing localization, use `update-video-localization` instead.

### Related Commands

- `update-video-localization` - Update existing localization
- `get-video-localization` - Check if localization exists
- `get-video-localizations` - See all localizations

---

## update-video-localization

Update an existing video localization. Fails if the localization does not exist.

### Usage

```bash
staqan-yt update-video-localization --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

### Required Options

- `--language <lang>` - Language code or name (e.g., "ja", "Japanese") (required)

### Options

- `--title <title>` - New localized title
- `--description <desc>` - New localized description
- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Update Japanese title only
staqan-yt update-video-localization --video-id dQw4w9WgXcQ \
  --language ja \
  --title "更新された日本語のタイトル"

# Update Japanese description only
staqan-yt update-video-localization --video-id dQw4w9WgXcQ \
  --language ja \
  --description "更新された日本語の説明"

# Update both title and description
staqan-yt update-video-localization --video-id dQw4w9WgXcQ \
  --language ja \
  --title "新しいタイトル" \
  --description "新しい説明"
```

### Error Behavior

This command **fails** if the localization doesn't exist:

```
Error: Localization for language 'ja' does not exist. Use put-video-localization instead.
```

To create a new localization, use `put-video-localization` instead.

### Update vs Create

| Command | Use When | Behavior |
|---------|----------|----------|
| `put-video-localization` | Creating NEW localization | Fails if exists |
| `update-video-localization` | Updating EXISTING localization | Fails if doesn't exist |

### Related Commands

- `put-video-localization` - Create new localization
- `get-video-localization` - Check current localization
- `get-video-localizations` - See all localizations

---

## Common Patterns

### Batch Update Video Titles

```bash
# Update titles for multiple videos
cat video_ids.txt | while read id; do
  staqan-yt update-video --video-id "$id" --title "Updated: $(date +%Y-%m-%d)" --yes
done
```

### Create Localizations for Multiple Videos

```bash
# Add Japanese localization to multiple videos
cat video_ids.txt | while read id; do
  staqan-yt put-video-localization --video-id "$id" \
    --language ja \
    --title "日本語のタイトル" \
    --description "日本語の説明"
done
```

### Export All Localizations

```bash
# Export localizations for all videos
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  xargs staqan-yt get-video-localizations --video-ids --output json > localizations.json
```

### Update Localizations from CSV

```bash
# Update from CSV file: video_id,language,title,description
csvtool named 'video_id,language,title,description' localizations.csv | \
  tail -n +2 | \
  while IFS=, read -r video_id language title description; do
    staqan-yt update-video-localization --video-id "$video_id" \
      --language "$language" \
      --title "$title" \
      --description "$description" \
      --yes
  done
```

### Check Missing Localizations

```bash
# Find videos without Japanese localization
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  while read id; do
    if ! staqan-yt get-video-localization --video-id "$id" --language ja &>/dev/null; then
      echo "$id missing Japanese localization"
    fi
  done
```

## Tips

1. **Always use `--dry-run` first** when updating metadata
2. **Check existing localizations** before creating/updating
3. **Use `--yes`** for batch operations to skip confirmation
4. **Export before updating** to keep backups
5. **Use language codes** for scripting (more reliable than names)

## Supported Languages

Common language codes:
- `en` - English
- `ja` - Japanese
- `ru` - Russian
- `es` - Spanish
- `de` - German
- `fr` - French
- `ko` - Korean
- `pt` - Portuguese
- `zh` - Chinese
- `ar` - Arabic

Full list: [BCP 47 language codes](https://www.w3.org/International/articles/language-tags/)
