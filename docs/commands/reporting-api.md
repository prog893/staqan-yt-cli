# Reporting API Commands

Commands for accessing YouTube Reporting API data, including thumbnail impressions and CTR.

> **💡 Important:** Thumbnail CTR (Click-Through Rate) data is **ONLY available** through the YouTube Reporting API, not the regular YouTube Analytics API. Use `get-report-data` with `--type=channel_reach_basic_a1` to access thumbnail impressions and CTR metrics.

## Overview

The YouTube Reporting API provides bulk reports that:
- Contain data NOT available in the regular Analytics API
- Include thumbnail impressions and CTR metrics
- Are generated as bulk files (not real-time queries)
- Expire after 30-60 days and are permanently deleted
- Can be archived locally to prevent data loss

### Key Difference: Analytics API vs Reporting API

| Feature | Analytics API | Reporting API |
|---------|--------------|---------------|
| **Data type** | Real-time queries | Pre-generated bulk reports |
| **Thumbnail CTR** | ❌ Not available | ✅ Available |
| **Freshness** | 24-48 hour delay | 1-2 day delay |
| **Data retention** | Available indefinitely | Expires after 30-60 days |
| **Use case** | Interactive queries | Historical analysis & archival |

---

## list-report-types

List all available YouTube Reporting API report types.

### Usage

```bash
staqan-yt list-report-types
```

### Options

- `--output <format>` - Output format: json, table (default: `table`)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# List all report types (formatted table)
staqan-yt list-report-types

# Export to JSON
staqan-yt list-report-types --output json

# Search for specific report type
staqan-yt list-report-types --output json | jq '.[] | select(.id | contains("reach"))'
```

### Output Fields

- `id` - Report type ID (used in other commands)
- `name` - Report type name
- `description` - Description of the report

### Common Report Types

**Thumbnail CTR Data:**
- `channel_reach_basic_a1` - **Thumbnail impressions and CTR** ⭐

**Traffic Sources:**
- `traffic_source_a1` - Traffic source detailed data

**Device Types:**
- `device_os_a1` - Device and operating system data

**Demographics:**
- `demographics_a1` - Viewer age and gender

**Geography:**
- `geography_a1` - Viewer location data

---

## list-report-jobs

List YouTube Reporting API jobs with status and expiration warnings.

### Usage

```bash
staqan-yt list-report-jobs
```

### Options

- `--type <id>` - Filter by report type ID (e.g., channel_reach_basic_a1)
- `--output <format>` - Output format: json, table (default: `table`)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# List all report jobs
staqan-yt list-report-jobs

# List jobs for specific report type
staqan-yt list-report-jobs --type channel_reach_basic_a1

# Export to JSON
staqan-yt list-report-jobs --output json

# Check for expiring reports
staqan-yt list-report-jobs --output json | \
  jq '.[] | select(.expireTime | fromdateiso8601 < now + 86400*7)'
```

### Output Fields

- `id` - Job ID
- `reportTypeId` - Report type ID
- `name` - Job name
- `createTime` - When the job was created
- `expireTime` - **When reports expire** (important!)
- `status` - Job status

### Job Status Explanations

- `ACTIVE` - Job is running and generating reports
- `FAILED` - Job has failed
- `DISABLED` - Job is disabled

### Why Check Expiration Time?

YouTube Reporting API reports **expire after 30-60 days** and are permanently deleted. Use this command to:
- Find reports that will expire soon
- Prioritize which reports to archive
- Ensure you don't lose important historical data

---

## get-report-data

Get YouTube Reporting API report data including thumbnail impressions and CTR.

### Usage

```bash
staqan-yt get-report-data
```

### Options

- `--type <id>` - Report type ID (e.g., `channel_reach_basic_a1`)
- `-c, --channel <handle>` - Channel handle or ID (overrides config default)
- `--video-id <id>` - Filter by video ID
- `--start-date <date>` - Start date (YYYY-MM-DD)
- `--end-date <date>` - End date (YYYY-MM-DD)
- `--output <format>` - Output format: json, csv, text, table, pretty (default: `pretty`)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get thumbnail CTR for specific video
staqan-yt get-report-data --type=channel_reach_basic_a1 --video-id=eeYl2dxv57g

# Get all thumbnail CTR data for date range
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --start-date=2026-02-01 \
  --end-date=2026-02-28

# Export to CSV
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --video-id=VIDEO_ID \
  --output csv > ctr_data.csv

# Get traffic source data
staqan-yt get-report-data \
  --type=traffic_source_a1 \
  --start-date=2026-01-01
```

### Report Type: channel_reach_basic_a1 (Thumbnail CTR)

This is the **most important** report type for thumbnail analysis. It includes:

- **video_id** - Video ID
- **date** - Report date
- **thumbnail_impressions** - Number of times thumbnail was shown
- **thumbnail_clicks** - Number of times thumbnail was clicked
- **ctr** - Click-through rate (clicks ÷ impressions)

**Calculate CTR manually:**
```bash
# Get raw data
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv

# Calculate CTR using awk
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv | \
  awk -F, 'NR>1 {ctr=$4/$3*100; printf "%s: %.2f%% CTR\n", $2, ctr}'
```

### Filtering

**By video:**
```bash
staqan-yt get-report-data --type=channel_reach_basic_a1 --video-id=VIDEO_ID
```

**By date range:**
```bash
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --start-date=2026-02-01 \
  --end-date=2026-02-28
```

**Combined filters:**
```bash
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --video-id=VIDEO_ID \
  --start-date=2026-02-01 \
  --end-date=2026-02-28
```

### Performance

**⚡ Caching:** The `get-report-data` command automatically caches downloaded reports. Subsequent requests for the same date range are instant (loaded from cache).

Cache location: `~/.staqan-yt-cli/data/{channelId}/reports/`

**Required:** Set a default channel or pass `--channel`:
```bash
staqan-yt config set default.channel @yourchannel
```

### Data Freshness

- Reports are generated daily by YouTube
- 1-2 day delay from actual data
- Use `--start-date` and `--end-date` to control range

---

## fetch-reports

Download and cache all available report data for archival. Prevents data loss when YouTube expires reports (30-60 days).

### Usage

```bash
staqan-yt fetch-reports
```

### Options

- `-c, --channel <handle>` - Channel handle or ID (overrides config default)
- `-t, --type <id>` - Fetch specific report type
- `-T, --types <ids>` - Fetch multiple report types (comma-separated)
- `--start-date <date>` - Filter by start date (YYYY-MM-DD)
- `--end-date <date>` - Filter by end date (YYYY-MM-DD)
- `-f, --force` - Re-download even if cached
- `--verify` - Verify cached file completeness
- `-v, --verbose` - Enable verbose output
- `-h, --help` - Show help

### Examples

```bash
# Archive all thumbnail CTR reports
staqan-yt fetch-reports --type=channel_reach_basic_a1

# Archive all report types
staqan-yt fetch-reports

# Archive multiple specific report types
staqan-yt fetch-reports --types channel_reach_basic_a1,traffic_source_a1

# Archive for specific date range
staqan-yt fetch-reports \
  --type=channel_reach_basic_a1 \
  --start-date=2026-01-01 \
  --end-date=2026-01-31

# Verify cached files
staqan-yt fetch-reports --verify

# Force re-download (overwrite cache)
staqan-yt fetch-reports --force
```

### Why Archive Reports?

**Problem:** YouTube Reporting API reports **expire after 30-60 days** and are permanently deleted.

**Solution:** Use `fetch-reports` periodically to:
- Download all available reports before they expire
- Store them locally in `~/.staqan-yt-cli/data/{channelId}/reports/`
- Access historical data anytime via `get-report-data`

**Required:** Set a default channel first:
```bash
staqan-yt config set default.channel @yourchannel
```

### Recommended Workflow

**1. Schedule regular archival:**
```bash
# Run weekly via cron
0 0 * * 0 staqan-yt fetch-reports --type=channel_reach_basic_a1
```

**2. Verify archived data:**
```bash
staqan-yt fetch-reports --verify
```

**3. Access anytime:**
```bash
# Even after YouTube expires the reports
staqan-yt get-report-data --type=channel_reach_basic_a1 --start-date=2026-01-01
```

### Verification Mode

Use `--verify` to check cached files:
- Verifies all expected files are downloaded
- Checks file integrity
- Reports any missing or corrupted files

```bash
staqan-yt fetch-reports --verify
```

### Cache Location

```
~/.staqan-yt-cli/data/
├── cache-index.json          # Index of cached reports
└── reports/                  # Downloaded report files
    ├── channel_reach_basic_a1/
    │   ├── 2026-01-01.csv
    │   ├── 2026-01-02.csv
    │   └── ...
    └── traffic_source_a1/
        └── ...
```

---

## Common Patterns

### Analyze Thumbnail Performance

```bash
# Get CTR data for your top videos
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  head -n 10 | \
  xargs -I {} staqan-yt get-report-data \
    --type=channel_reach_basic_a1 \
    --video-id={} \
    --output csv
```

### Find Best/Worst Thumbnail CTR

```bash
# Get all CTR data and sort
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --output csv | \
  awk -F, 'NR>1 {print $2, $5}' | \
  sort -t' ' -k2 -rn | head -n 10
```

### Archive All Data Weekly

```bash
# Add to crontab: crontab -e
# Runs every Sunday at midnight
0 0 * * 0 staqan-yt fetch-reports --verify
```

### Compare Thumbnail CTR Over Time

```bash
# Get CTR for specific video over time
staqan-yt get-report-data \
  --type=channel_reach_basic_a1 \
  --video-id=VIDEO_ID \
  --output csv > ctr_history.csv

# Graph with gnuplot
echo "plot 'ctr_history.csv' using 1:5 with lines" | gnuplot -persist
```

### Export All CTR Data

```bash
# Download and export all thumbnail CTR data
staqan-yt fetch-reports --type=channel_reach_basic_a1
staqan-yt get-report-data --type=channel_reach_basic_a1 --output csv > all_ctr.csv
```

### Backup Reports to External Storage

```bash
# Archive and backup to external drive
staqan-yt fetch-reports --type=channel_reach_basic_a1
cp -r ~/.staqan-yt-cli/data/reports /path/to/backup/
```

---

## Tips

1. **Archive regularly** - Reports expire and are permanently deleted
2. **Use `--verify`** - Ensure your archive is complete
3. **Focus on `channel_reach_basic_a1`** - Most important for thumbnail optimization
4. **Schedule archival** - Use cron to automate weekly downloads
5. **Monitor expiration** - Use `list-report-jobs` to check expiration dates
6. **Backup your cache** - Copy `~/.staqan-yt-cli/data/reports/` to external storage

## Understanding Thumbnail CTR

**What is CTR?**
- Click-Through Rate = (Thumbnail Clicks ÷ Thumbnail Impressions) × 100
- Measures how effective your thumbnail is at getting views

**Good CTR benchmarks:**
- **2-4%**: Average
- **4-6%**: Good
- **6-10%**: Excellent
- **10%+**: Outstanding

**Factors affecting CTR:**
- Thumbnail image quality and appeal
- Title relevance and intrigue
- Topic interest
- Competition in search/suggested

**Using CTR data:**
- A/B test different thumbnails
- Identify which thumbnail styles work best
- Optimize thumbnails for higher CTR
- Compare CTR across video topics

## Troubleshooting

### "No reports found for date range"

**Problem:** No reports available for requested dates.

**Solution:**
- Check reports are generated (1-2 day delay)
- Use `list-report-jobs` to verify job is active
- Try a more recent date range

### "Report expired"

**Problem:** Report has expired and was deleted by YouTube.

**Solution:**
- Unfortunately, expired reports are permanently gone
- Use `fetch-reports` regularly to prevent future loss
- Focus on available data

### "Cache corrupted"

**Problem:** Cached report file is incomplete or corrupted.

**Solution:**
```bash
# Re-download the report
staqan-yt fetch-reports --force --type=channel_reach_basic_a1
```

## API Quota Costs

Reporting API quota usage:
- **list-report-types**: 1 unit
- **list-report-jobs**: 1 unit
- **get-report-data**: 1 unit (cached: 0 units)
- **fetch-reports**: 1 unit per report downloaded

## Notes

- **Separate from Analytics API** - This is a different YouTube API
- **Bulk reports only** - Not real-time queries
- **Expiration is permanent** - Deleted reports cannot be recovered
- **Cache is automatic** - Repeated queries are instant
- **Perfect for archival** - Designed for historical analysis
