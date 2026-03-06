# Output Formats

All staqan-yt-cli commands support multiple output formats via the `--output` flag.

## Global Options

### Quiet Mode (`-q, --quiet`)

Suppress informational messages for clean output:

```bash
# Quiet JSON output (perfect for piping)
staqan-yt --quiet list-videos @yourchannel --output json | jq '.[]'

# Quiet CSV export
staqan-yt -q list-videos @yourchannel --output csv > videos.csv

# Suppress progress messages in scripts
staqan-yt --quiet get-video VIDEO_ID --output json > video.json
```

**What gets suppressed:**
- ✓ Success messages (e.g., "Found 10 video(s)")
- ℹ Info messages (e.g., "Fetching channel videos...")
- Progress spinners

**What still shows:**
- ✗ Error messages
- ⚠ Warning messages
- The actual output data

### Verbose Mode (`-v, --verbose`)

Show technical debug messages:

```bash
# See API calls and processing steps
staqan-yt --verbose get-video VIDEO_ID

# Debug authentication issues
staqan-yt -v list-videos @yourchannel
```

### Version (`--version, -V`)

Show version and exit:

```bash
staqan-yt --version    # Output: 1.4.3
staqan-yt -V           # Short form

# Takes precedence over everything else
staqan-yt --version list-videos    # Still outputs version only
```

## Available Formats

- **json** - Machine-readable JSON (2-space indentation)
- **csv** - RFC 4180 CSV format for Excel and data analysis
- **table** - ASCII table format with borders and column alignment
- **text** - Tab-delimited output for Unix pipelines (awk, cut, etc.)
- **pretty** - Colorful, human-friendly output (default)

## Usage

```bash
staqan-yt <command> --output <format>
```

### Examples

```bash
# JSON output
staqan-yt get-video dQw4w9WgXcQ --output json

# CSV output
staqan-yt list-videos @yourchannel --output csv

# Table output
staqan-yt get-video-analytics VIDEO_ID --output table

# Text output
staqan-yt get-video-tags VIDEO_ID --output text

# Pretty output (default)
staqan-yt get-video dQw4w9WgXcQ --output pretty
# or just
staqan-yt get-video dQw4w9WgXcQ
```

## Format Details

### JSON

**Best for:** Programmatic processing, APIs, data pipelines

**Characteristics:**
- Structured data format
- 2-space indentation
- Preserves data types (strings, numbers, booleans)
- Nested objects and arrays
- Easy to parse with `jq`

**Example:**
```json
[
  {
    "id": "dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "viewCount": "1400000000"
  }
]
```

**Common Usage:**
```bash
# Pipe to jq for filtering
staqan-yt --quiet list-videos @yourchannel --output json | \
  jq '.[] | select(.viewCount | tonumber > 1000000)'

# Save to file
staqan-yt --quiet get-video VIDEO_ID --output json > video.json

# Parse with scripts
data=$(staqan-yt --quiet get-video VIDEO_ID --output json)
title=$(echo "$data" | jq -r '.title')
```

---

### CSV

**Best for:** Excel, Google Sheets, data analysis, reporting

**Characteristics:**
- RFC 4180 compliant
- Comma-separated values
- Header row with field names
- Escapes fields containing commas, quotes, or newlines
- Doubles internal quotes for proper escaping
- Handles nested objects by JSON-encoding them

**Example:**
```csv
id,title,viewCount,publishedAt
dQw4w9WgXcQ,"Never Gonna Give You Up",1400000000,2009-10-25T06:57:33Z
```

**Common Usage:**
```bash
# Export to Excel
staqan-yt list-videos @yourchannel --output csv > videos.csv

# Open in Excel (macOS)
open videos.csv

# Process with csvkit
csvsort --columns viewCount videos.csv > sorted.csv

# Load into pandas (Python)
python -c "import pandas as pd; df = pd.read_csv('videos.csv')"
```

**CSV Features:**
- **Automatic escaping** - No need to worry about special characters
- **Nested objects** - JSON-encoded as strings
- **Array fields** - JSON-encoded as strings
- **Universal compatibility** - Works with Excel, Numbers, Google Sheets

---

### Table

**Best for:** Terminal viewing, quick data inspection

**Characteristics:**
- ASCII table with borders
- Column-aligned output
- Truncates long text
- Easy to read in terminal

**Example:**
```
┌────────────────────┬─────────────────────────┬────────────┐
│ ID                 │ Title                   │ View Count │
├────────────────────┼─────────────────────────┼────────────┤
│ dQw4w9WgXcQ        │ Never Gonna Give You Up │ 1.4B       │
└────────────────────┴─────────────────────────┴────────────┘
```

**Common Usage:**
```bash
# Quick inspection
staqan-yt list-videos @yourchannel --limit 10 --output table

# Pipe to less for large tables
staqan-yt list-videos @yourchannel --output table | less

# Works well with terminal widths
staqan-yt get-video-analytics VIDEO_ID --output table
```

---

### Text

**Best for:** Unix pipelines, awk, cut, text processing

**Characteristics:**
- Tab-delimited values
- No header row (usually)
- Raw data output
- Easy to parse with Unix tools

**Example:**
```text
dQw4w9WgXcQ	Never Gonna Give You Up	1400000000
```

**Common Usage:**
```bash
# Extract specific fields
staqan-yt list-videos @yourchannel --output text | \
  cut -f2  # Get titles only

# Count results
staqan-yt search-videos "keyword" --output text | wc -l

# Process with awk
staqan-yt get-video-analytics VIDEO_ID --output text | \
  awk -F'\t' '{sum+=$2} END {print sum}'

# Parse in scripts
while IFS=$'\t' read -r id title views; do
  echo "Processing: $title"
done < <(staqan-yt list-videos @yourchannel --output text)
```

---

### Pretty

**Best for:** Human reading, terminal output, presentations

**Characteristics:**
- Colorful output using chalk
- Formatted for readability
- Helpful labels and formatting
- Emoji indicators (✓, ✗, etc.)
- Default format for all commands

**Example:**
```text
✓ Video Retrieved

  Title: Never Gonna Give You Up
  ID: dQw4w9WgXcQ
  Views: 1.4B
  Likes: 15M
```

**Common Usage:**
```bash
# Default output
staqan-yt get-video dQw4w9WgXcQ

# Explicit pretty output
staqan-yt get-video dQw4w9WgXcQ --output pretty

# Great for presentations
staqan-yt get-channel-analytics @yourchannel
```

**Colors:**
- Cyan - Field names
- Green - Success indicators
- Yellow - Warnings
- Red - Errors
- Blue - URLs and links

---

## Choosing the Right Format

### Decision Tree

```
Need to process data programmatically?
├─ Yes → Use JSON (parse with jq, scripts, APIs)
└─ No
   ├─ Need to import into Excel/Sheets?
   │  └─ Yes → Use CSV
   └─ Viewing in terminal only?
      ├─ Want structured table? → Use table
      ├─ Want to pipe to Unix tools? → Use text
      └─ Want human-readable output? → Use pretty (default)
```

### By Use Case

| Use Case | Recommended Format | Why |
|----------|-------------------|-----|
| **API integration** | JSON | Structured, type-preserving |
| **Excel/Sheets** | CSV | Direct import, spreadsheet-compatible |
| **Data analysis** | CSV | Works with pandas, R, Excel |
| **Quick inspection** | Table | Easy to read, column-aligned |
| **Unix pipelines** | Text | Tab-delimited, easy to parse |
| **Presentations** | Pretty | Colorful, human-friendly |
| **Logging** | JSON | Machine-readable, structured |
| **Reporting** | CSV | Import into reporting tools |

---

## Advanced Usage

### Combining Formats

```bash
# Get JSON, convert to CSV
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[] | [.id, .title, .viewCount] | @csv' > videos.csv

# Get CSV, process with awk
staqan-yt get-video-analytics VIDEO_ID --output csv | \
  awk -F, 'NR>1 {sum+=$2; count++} END {print sum/count}'

# Get table, extract with grep
staqan-yt list-videos @yourchannel --output table | \
  grep -E "^[|]" | \
  cut -d'|' -f3
```

### Custom Formatting

```bash
# Create custom report
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[] | "\(.title)\t\(.viewCount) views\t\(.likeCount) likes"'

# Calculate totals
staqan-yt list-videos @yourchannel --output json | \
  jq '[.[].viewCount | tonumber] | add'

# Format for presentation
staqan-yt get-channel-analytics @yourchannel --output json | \
  jq -r '.[] | "\(.dimension): \(.value)"' | \
  column -t -s':'
```

### Output to Files

```bash
# JSON files
staqan-yt get-video VIDEO_ID --output json > video.json
jq '.title' video.json

# CSV files
staqan-yt list-videos @yourchannel --output csv > videos.csv
open videos.csv  # macOS
xdg-open videos.csv  # Linux

# Log files
staqan-yt get-video-analytics VIDEO_ID --output json >> analytics.log

# Backup data
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv > backup_$(date +%Y%m%d).csv
```

---

## Default Format Configuration

Set a default output format to avoid repeating `--output`:

```bash
# Set default to CSV
staqan-yt config set default.output csv

# All commands now output CSV by default
staqan-yt list-videos @yourchannel --limit 10

# Override when needed
staqan-yt get-video VIDEO_ID --output json
```

**Recommended defaults:**
- **Development:** `json` (easy to parse)
- **Data analysis:** `csv` (Excel compatible)
- **Daily use:** `pretty` (human-friendly)

---

## Format-Specific Tips

### JSON Tips

1. **Use `jq`** for JSON processing
2. **Compact output** with `-c` flag: `jq -c`
3. **Extract fields** with dot notation: `jq '.title'`
4. **Filter arrays** with pipes: `jq '.[] | select(.views > 1000)'`

### CSV Tips

1. **Always includes headers** - First row has field names
2. **Handle quotes** - Automatically escaped
3. **Import to Excel** - Double-click or use "Import CSV"
4. **Use csvkit** for advanced CSV processing

### Table Tips

1. **Pipe to `less`** for large tables
2. **Adjust terminal width** for better viewing
3. **Use with `--limit`** to control output size
4. **Great for screenshots** - Clean, formatted output

### Text Tips

1. **Tab-delimited** - Use `$'\t'` in scripts
2. **No headers** - Usually raw data only
3. **Perfect for `awk`** and `cut`
4. **Easy to parse** - Simple field splitting

### Pretty Tips

1. **Default format** - No need to specify
2. **Colors** - Use in terminals that support color
3. **Readability** - Best for human consumption
4. **Not machine-readable** - Avoid in scripts

---

## Troubleshooting

### CSV Issues

**"Excel doesn't open CSV correctly":**
- Use "Import CSV" instead of double-clicking
- Or change file extension to `.txt` and use Text Import Wizard

**"Special characters broken":**
- CSV format handles escaping automatically
- Check your locale settings: `echo $LC_ALL`

### JSON Issues

**"Invalid JSON output":**
- Ensure you're using `--output json`
- Some commands may have errors in output (check with `--verbose`)

**"Can't parse with jq":**
- Check JSON validity: `jq . < file.json`
- Some fields may be null: use `?` operator

### Table Issues

**"Table too wide for terminal":**
- Pipe to `less`: `command --output table | less`
- Reduce column count: Use `--limit` or filter with `jq`
- Increase terminal width

### Pretty Issues

**"No colors showing":**
- Terminal may not support colors
- Use `--output table` or `--output json` instead
- Check terminal color settings

## Performance Considerations

- **JSON** - Fastest, minimal formatting
- **CSV** - Fast, minimal formatting
- **Table** - Medium, calculates column widths
- **Text** - Fast, minimal formatting
- **Pretty** - Slowest, extensive formatting and colors

For large datasets, consider JSON or CSV for better performance.
