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

## The 2026-08-24 view-counting change

On **2026-08-24** YouTube aligned view counting across formats: a view is
counted from the first frame of playback, with no minimum watch time. Dates
from that day onward are measured that way, earlier dates are not. The stricter
previous definition survives as the **`engaged_views`** column.

This affects the Reporting API more than the Analytics API, for one reason:
a local archive accumulates for months, and `get-report-data` merges every
archived report overlapping the requested range into a single result. A range
spanning the change therefore mixes both definitions in one `views` column,
and the CSV gives no sign of it. The header row is identical either side of
the date, and `views` keeps its name while changing its meaning.

- **`views` is not one series.** A range starting before 2026-08-24 and ending
  on or after it carries both definitions in the same column, so summing that
  column produces a figure that is not a count of anything.
- **Older data is not comparable to newer data.** A range lying entirely before
  the change is internally consistent, but its `views` cannot be compared
  against `views` for later dates.
- **`engaged_views` is consistent across the boundary.** Use it when comparing
  across the change date, or against anything archived before it.
- `red_views` is affected the same way as `views`.

`engaged_views` is not new. YouTube added it on 2025-06-24, shipping it as a
report-type version bump (`channel_basic_a2` to `channel_basic_a3`) rather than
altering the existing type in place, so every archived report of the current
version already carries it. Report types whose columns change always get a new
ID this way, which is why a single `--type` never returns mixed schemas.

`get-report-data` prints a note on stderr when the returned rows reach back
before the change. Unlike the analytics commands, which restrict their
equivalent note to `--output pretty` and `--output text`, this one appears for
every output format: it sits alongside the Incomplete Data warning, which is
the same class of caveat and is likewise unconditional. stderr keeps stdout
parseable either way.

```console
$ staqan-yt get-report-data --type channel_basic_a3 \
    --start-date 2026-05-01 --end-date 2026-08-24 --output csv > rows.csv
⚠️  Note: views, red_views for 2026-05-01 to 2026-08-22 is counted under the
definition used before 2026-08-24, so it is not comparable to views, red_views
for dates from 2026-08-24 onward, which counts every playback from the first
frame. engaged_views keeps the stricter definition throughout.
https://support.google.com/youtube/answer/2991785
```

Report types carrying no view column (`channel_demographics_a1`, for instance,
which reports `views_percentage`) never produce the note.

MCP callers get the same signal as a `viewCountingNotice` object on the result,
carrying `changeDate`, `affectedMetrics`, `affectedRange` and `spansChange`, so
the date does not have to be hardcoded downstream.

**Reference:** [How YouTube counts views](https://support.google.com/youtube/answer/2991785)

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
- `-c, --channel <handle>` - Channel handle or ID of the authenticated channel. Reporting data is always scoped to the authenticated account (no multi-account auth swap yet), so this is reserved for future use; supplying a value that doesn't match the authenticated channel fails loudly. If omitted, `default.channel` is checked the same way.
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

The cache is keyed by the authenticated channel ID, not by `--channel` / `default.channel` — Reporting API jobs, jobs.reports, and downloads always operate on the authenticated account regardless of any `--channel` flag, so the cache has to follow the same channel or it gets mislabeled. Passing `--channel` is optional and currently only validates against the authenticated channel.

### Data Freshness

- Reports are generated daily by YouTube
- 1-2 day delay from actual data
- Use `--start-date` and `--end-date` to control range

### Coverage and gaps

YouTube expires reports from the API after 30-60 days, while `fetch-reports` keeps them locally forever. The two sources are consulted together:

- **The local archive is used even when the API has nothing left.** An old job whose reports have all expired still serves from cache rather than reporting "no reports yet".
- **Gaps are reported explicitly.** The date range shown as available is an outer bound across both sources, so when they cover disjoint periods (archive holds January, API holds June) the span between them is a hole, not data. Any such holes are listed under an `Incomplete Data` warning on stderr, and exposed to MCP consumers as `uncoveredRanges` in the structured result.

A date that is covered but simply had no activity is not a gap. Only dates that no source could supply are reported.

**Reissued reports.** YouTube republishes a report for the same window when it has corrected figures, so the archive accumulates several report IDs per window (on a real archive this was 58% of windows for `channel_reach_basic_a1`). Only the newest is used; the superseded copies stay on disk but never contribute rows. Without this, a range could return the same date and video twice with different numbers, and any total computed from it would be inflated.

Reports archived from this version onward record the API `createTime` used to order reissues. Entries archived earlier fall back to expiry date, which orders identically within a job.

---

## fetch-reports

Download and cache all available report data for archival. Prevents data loss when YouTube expires reports (30-60 days).

### Usage

```bash
staqan-yt fetch-reports
```

### Options

- `-c, --channel <handle>` - Channel handle or ID of the authenticated channel. Reporting data is always scoped to the authenticated account (no multi-account auth swap yet), so this is reserved for future use; supplying a value that doesn't match the authenticated channel fails loudly. If omitted, `default.channel` is checked the same way.
- `-t, --type <id>` - Fetch specific report type
- `-T, --types <ids>` - Fetch multiple report types (comma-separated)
- `--start-date <date>` - Filter by start date (YYYY-MM-DD). Reports whose window **overlaps** the range are included — see [Date range filtering](#date-range-filtering).
- `--end-date <date>` - Filter by end date (YYYY-MM-DD). Reports whose window **overlaps** the range are included.
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

# Force re-download only a missing window (e.g. recovering from bug #52)
# Re-downloads only reports that overlap that range; other cached reports
# are left alone.
staqan-yt fetch-reports --type=channel_reach_basic_a1 \
  --force --start-date=2026-04-07 --end-date=2026-04-10

# Verify cached files
staqan-yt fetch-reports --verify

# Force re-download (overwrite cache)
staqan-yt fetch-reports --force
```

### Date range filtering

`--start-date` and `--end-date` use **overlap** semantics: a report is
included if any day in its `[startTime, endTime]` window falls inside
`[--start-date, --end-date]`. This matters because YouTube reports can span
multiple days (weekly, monthly, etc.) — a weekly report covering
`2026-01-05`–`2026-01-11` should be included when the user asks for
`--start-date=2026-01-01 --end-date=2026-01-31`, because some of its data
falls inside January.

If you provide only one of the two flags, the other is left open:

- `--start-date 2026-01-01` (no `--end-date`) → include every report that
  ends on or after `2026-01-01` (i.e. data exists from Jan 1 onward).
- `--end-date 2026-01-31` (no `--start-date`) → include every report that
  starts on or before `2026-01-31` (i.e. data exists up to Jan 31).

This is what makes `fetch-reports --force --start-date ... --end-date ...`
useful for targeted recovery: the date filter narrows the *candidates for
re-download*, and `--force` makes the run actually re-download them, while
cached reports outside the range are left untouched.

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

Each cached report has a `<reportId>.metadata.json` sidecar recording what the
report was at download time, including its column list and a completeness flag.
`--verify` reads those sidecars, so the counts it prints describe them:

```
Verification complete: 3755 OK, 0 issues, 2 rebuilt (completeness unverifiable)
```

A **rebuilt** sidecar is one that was found damaged and reconstructed from the
cache index and the report CSV on disk. The reconstruction recovers the
identity, window and column fields, and re-measures the actual date range from
the CSV. It cannot recover the job ID, the download URL, or the completeness
flag, because those came from an API response that is no longer available, and
it does not invent them. Such a report is still served normally; it is counted
separately because its completeness can no longer be confirmed.

To restore a full sidecar, re-download that report with `--force`.

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
- **fetch-reports**: 1 unit per report downloaded, plus:
  - 1 unit for `reportTypes.list`
  - 1 unit for `jobs.list` (called once per run, not once per type)
  - 1 unit per `jobs.reports.list` page per type
  - 1 unit per `jobs.create` for new types

### Rate-limit handling

`fetch-reports` automatically retries on `HTTP 429 / Free requests per minute`
errors with exponential backoff (5s → 10s → 20s → 40s → 80s, capped at 90s) and
honors the server's `Retry-After` header. Daily quota exhaustion
(`Free requests per day`) aborts the run immediately with a clear message —
no amount of waiting will recover within the same window.

Downloads themselves also retry on 429 and on transient network errors
(`ECONNRESET` / `ETIMEDOUT` / `EAI_AGAIN`).

## Notes

- **Separate from Analytics API** - This is a different YouTube API
- **Bulk reports only** - Not real-time queries
- **Expiration is permanent** - Deleted reports cannot be recovered
- **Cache is automatic** - Repeated queries are instant
- **Perfect for archival** - Designed for historical analysis
