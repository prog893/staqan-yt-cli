# Analytics & Insights Commands

Commands for retrieving YouTube Analytics data and performance metrics.

> **Important:** These commands require the `https://www.googleapis.com/auth/yt-analytics.readonly` OAuth scope. Re-authenticate if needed: `staqan-yt auth`

## get-video-analytics

Get video performance analytics (views, watch time, CTR, etc.). Supports aggregate totals or breakdown by one or more dimensions.

### Usage

```bash
staqan-yt get-video-analytics --video-id <videoId> [options]
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)
- `--start-date <date>` - Start date (YYYY-MM-DD), defaults to upload date
- `--end-date <date>` - End date (YYYY-MM-DD), defaults to today
- `--metrics <metrics>` - Comma-separated list of metrics to fetch
- `--dimensions <dims...>` - One or more breakdown dimensions (variadic, see list below)
- `--all` - Breakdown by all standard dimensions (country, day, deviceType, operatingSystem, subscribedStatus, insightTrafficSourceType, insightPlaybackLocationType, liveOrOnDemand, creatorContentType, youtubeProduct)
- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Aggregate totals (upload date to today)
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ

# Breakdown by country
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --dimensions country

# Breakdown by multiple dimensions (combined in single API call)
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --dimensions country day deviceType

# Comprehensive breakdown across all standard dimensions
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --all

# Specify date range
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --start-date=2026-01-01 \
  --end-date=2026-01-31

# Custom metrics with dimension breakdown
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --dimensions country \
  --metrics views,estimatedMinutesWatched

# Export country breakdown to CSV
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --dimensions country --output csv > country_breakdown.csv

# Export full --all breakdown as JSON
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --all --output json
```

### Default Metrics

If no `--metrics` specified, fetches:

**Aggregate mode** (no `--dimensions` or `--all`):
- `views` - Total views
- `estimatedMinutesWatched` - Total watch time (minutes)
- `averageViewDuration` - Average view duration (seconds)
- `averageViewPercentage` - Average % of video watched
- `likes` / `dislikes` - Likes and dislikes
- `comments` - Comment count
- `shares` - Share count

**Breakdown mode** (when using `--dimensions` or `--all`):
- `views` - Total views
- `estimatedMinutesWatched` - Total watch time (minutes)
- `averageViewDuration` - Average view duration (seconds)
- `averageViewPercentage` - Average % of video watched

> **Note:** Breakdown mode defaults to excluding interactive metrics (`likes`, `dislikes`, `comments`, `shares`) to avoid API rejections. Use aggregate mode (without `--dimensions`) to retrieve these metrics.

### Available Breakdown Dimensions

All specified dimensions are combined into a single API query. If the YouTube Analytics API rejects a dimension combination, the error will be displayed.

**Important**: When using multiple dimensions (e.g., `--dimensions country day`), results show unique combinations of all dimensions rather than separate sections per dimension. For example:
- Single dimension `--dimensions country`: Aggregated data per country
- Multiple dimensions `--dimensions country day`: Data for each country-day combination (e.g., "country=US, day=2024-01-01")

This provides more detailed, accurate data from the API rather than pre-aggregated sections.

| Dimension | Description | Notes |
|---|---|---|
| `country` | Two-letter ISO country code | ✅ Works |
| `day` | Daily breakdown (YYYY-MM-DD) | ✅ Works |
| `month` | Monthly breakdown (YYYY-MM) | ⚠️ Date range must span full calendar months |
| `deviceType` | Desktop, mobile, tablet, TV, game console, etc. | ✅ Works |
| `operatingSystem` | Android, iOS, Windows, macOS, etc. | ✅ Works |
| `subscribedStatus` | Subscribed vs. unsubscribed viewers | ✅ Works |
| `insightTrafficSourceType` | Search, suggested, external, browse, etc. | ✅ Works |
| `insightPlaybackLocationType` | Watch page, embedded, channel page, etc. | ✅ Works |
| `liveOrOnDemand` | Live vs. on-demand playback | ✅ Works |
| `creatorContentType` | Livestream, shorts, story, video on demand | ✅ Works |
| `youtubeProduct` | Core YouTube, Gaming, Kids, Music | ✅ Works |
| `ageGroup` | Viewer age brackets | ❌ Not supported for video-level queries |
| `gender` | Viewer gender | ❌ Not supported for video-level queries |
| `sharingService` | Platform used to share the video | ❌ Not supported for video-level queries |
| `province` | US state | ⚠️ Requires `country==US` filter (not supported via CLI) |
| `dma` | Nielsen market area (US) | ⚠️ Requires additional filters |
| `city` | City-level (from Jan 2022) | ⚠️ Requires additional filters |

> **Note:** `ageGroup`, `gender`, and `sharingService` are only available at channel level via `get-channel-analytics`.
>
> **Note:** There is no subtitle or language dimension in the YouTube Analytics API. Subtitle language breakdowns are not supported.
>
> **Note:** This CLI follows AWS CLI principles - if the YouTube API rejects a dimension combination, the API error is displayed directly. This ensures you have accurate information about what the API supports.

### `--all` Preset Dimensions

`--all` is equivalent to `--dimensions country day deviceType operatingSystem subscribedStatus insightTrafficSourceType insightPlaybackLocationType liveOrOnDemand creatorContentType youtubeProduct`. All ten dimensions are combined into a single API call.

### Date Range Behavior

- **No dates specified**: Upload date to today
- **Start date only**: Start date to today
- **Both dates**: Specified range
- Long date ranges are automatically split into 90-day chunks and merged

### Output by Format

| Format | Aggregate mode | Breakdown mode |
|---|---|---|
| `pretty` | Metric list | Ranked sections per dimension |
| `table` | Metric/value table | One table per dimension |
| `json` | `{ columnHeaders, rows }` | `{ breakdowns: [{ dimension, rows }] }` |
| `csv` | Raw rows | `# dimension` header + rows per section |
| `text` | `metric\tvalue` | `dimension\tvalue\tmetric...` |

---

## get-video-retention

Get audience retention curve (% of viewers at each point in video).

### Usage

```bash
staqan-yt get-video-retention --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get retention curve
staqan-yt get-video-retention --video-id dQw4w9WgXcQ

# Export to CSV for graphing
staqan-yt get-video-retention --video-id dQw4w9WgXcQ --output csv > retention.csv

# Export to JSON
staqan-yt get-video-retention --video-id dQw4w9WgXcQ --output json
```

### Output Structure

Each data point represents:
- `moment` - Time offset in video (seconds)
- `audienceRetentionPercentage` - % of viewers still watching
- `relativeRetentionPerformance` - Compared to similar videos

### Using Retention Data

**Find drop-off points:**
```bash
staqan-yt get-video-retention --video-id VIDEO_ID --output csv | \
  awk -F, 'NR>1 && $2 < 50 {print $1, "seconds: retention below 50%"}'
```

**Graph retention curve:**
```bash
# Requires gnuplot or similar
staqan-yt get-video-retention --video-id VIDEO_ID --output csv | \
  tail -n +2 | \
  gnuplot -e "plot '-' using 1:2 with lines"
```

---

## get-search-terms

Get YouTube search terms that led viewers to this video.

### Usage

```bash
staqan-yt get-search-terms --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

- `-l, --limit <number>` - Limit number of results (default: 50)
- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get top search terms
staqan-yt get-search-terms --video-id dQw4w9WgXcQ

# Get top 100 terms
staqan-yt get-search-terms --video-id dQw4w9WgXcQ --limit 100

# Export to CSV
staqan-yt get-search-terms --video-id dQw4w9WgXcQ --output csv > search_terms.csv
```

### Output Fields

- `search_term` - The search query
- `views` - Number of views from this search term
- `estimated_minutes_watched` - Watch time from this search term

### Use Cases

- **SEO optimization** - See what keywords drive traffic
- **Content ideas** - Find related search terms for new videos
- **Title optimization** - Align titles with successful search terms

---

## get-traffic-sources

Get traffic source breakdown (search, suggested, external, etc.).

### Usage

```bash
staqan-yt get-traffic-sources --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

### Options

- `--output <format>` - Output format: json, table, text, pretty (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get traffic sources
staqan-yt get-traffic-sources --video-id dQw4w9WgXcQ

# Export to CSV
staqan-yt get-traffic-sources --video-id dQw4w9WgXcQ --output csv > traffic_sources.csv
```

### Common Traffic Sources

- `search` - YouTube search
- `suggested_video` - YouTube suggested videos
- `external` - External websites/apps
- `browse` - YouTube browse features
- `playlist` - Playlist views
- `advertising` - Paid traffic
- `notification` - YouTube notifications

### Use Cases

- **Understand audience discovery** - How viewers find your content
- **Optimize distribution** - Focus on high-performing sources
- **Track campaign performance** - Measure external traffic impact

---

## get-channel-analytics

Get channel-level analytics reports (demographics, devices, geography, traffic sources, subscription status).

### Usage

```bash
staqan-yt get-channel-analytics [channelHandle]
```

### Arguments

- `channelHandle` - Channel handle (e.g. `@staqan`) or channel ID. Uses `default.channel` config if omitted.

### Options

- `--report <type>` - Predefined report type: `demographics`, `devices`, `geography`, `traffic-sources`, `subscription-status` (default: `demographics`)
- `--start-date <date>` - Start date (YYYY-MM-DD), defaults to 30 days ago
- `--end-date <date>` - End date (YYYY-MM-DD), defaults to today
- `--dimensions <dims>` - Custom dimensions (comma-separated, requires `--metrics`)
- `--metrics <metrics>` - Custom metrics (comma-separated, requires `--dimensions`)
- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get viewer demographics (age and gender)
staqan-yt get-channel-analytics @yourchannel

# Get device types
staqan-yt get-channel-analytics @yourchannel --report devices

# Get geography (top countries)
staqan-yt get-channel-analytics @yourchannel --report geography

# Get traffic sources
staqan-yt get-channel-analytics @yourchannel --report traffic-sources

# Get subscription status (subscribed vs not subscribed)
staqan-yt get-channel-analytics @yourchannel --report subscription-status

# Custom query
staqan-yt get-channel-analytics @yourchannel \
  --dimensions day,deviceType \
  --metrics views,estimatedMinutesWatched

# Export to CSV
staqan-yt get-channel-analytics @yourchannel --output csv > demographics.csv
```

### Report Types

**demographics** (default):
- Viewer age distribution
- Viewer gender distribution

**devices**:
- Device type (Mobile, Desktop, TV, etc.)
- Operating system
- Browser

**geography**:
- Top countries
- Top continents

**traffic-sources**:
- How viewers find your content
- Search, suggested, external, etc.

**subscription-status**:
- Subscribed vs not subscribed viewers
- Performance by subscription status

### Custom Queries

Build custom reports using dimensions and metrics:

```bash
# Views by day and device type
staqan-yt get-channel-analytics @yourchannel \
  --dimensions day,deviceType \
  --metrics views

# Watch time by country
staqan-yt get-channel-analytics @yourchannel \
  --dimensions country \
  --metrics estimatedMinutesWatched
```

---

## get-channel-search-terms

Get the top YouTube search keywords driving traffic across an **entire channel** (aggregated across all videos). Shows lifetime data by default.

### Usage

```bash
staqan-yt get-channel-search-terms [channelHandle]
```

### Arguments

- `channelHandle` - Channel handle (e.g. `@staqan`) or channel ID. Uses `default.channel` config if omitted.

### Options

- `-l, --limit <number>` - Number of results (max 25, API restriction, default: 25)
- `--content-type <type>` - Filter by content type: `all` (default), `video` (non-shorts), `shorts`
- `--start-date <date>` - Start date (YYYY-MM-DD). Defaults to all-time (`2005-02-14`)
- `--end-date <date>` - End date (YYYY-MM-DD). Defaults to today
- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get top search terms for channel (lifetime)
staqan-yt get-channel-search-terms @yourchannel

# Get top search terms for specific date range
staqan-yt get-channel-search-terms @yourchannel \
  --start-date=2026-01-01 \
  --end-date=2026-01-31

# Filter to regular videos only (no Shorts)
staqan-yt get-channel-search-terms @yourchannel --content-type video

# Filter to Shorts only
staqan-yt get-channel-search-terms @yourchannel --content-type shorts

# Export to CSV
staqan-yt get-channel-search-terms @yourchannel --output csv > search_terms.csv
```

### Output Fields

- `search_term` - The search query
- `views` - Number of views from this search term
- `estimated_minutes_watched` - Watch time from this search term

### Content Type Filtering

- `all` (default) - All content types
- `video` - Regular videos only (excludes Shorts)
- `shorts` - YouTube Shorts only

### Use Cases

- **Content strategy** - Discover what your audience searches for
- **SEO optimization** - Optimize titles/descriptions for top terms
- **Topic research** - Find popular topics in your niche
- **Competitor analysis** - See what search terms drive traffic to competitors

### API Limitations

- **Max 25 results** - YouTube API limitation
- **Aggregated data** - Shows combined performance across all videos
- **Date ranges** - Defaults to lifetime data if not specified

---

## Common Patterns

### Export Analytics for Multiple Videos

```bash
# Get analytics for all videos in a channel
staqan-yt list-videos @yourchannel --output json | \
  jq -r '.[].id' | \
  xargs -I {} staqan-yt get-video-analytics --video-id {} --output csv > all_analytics.csv
```

### Compare Video Performance

```bash
# Get analytics for multiple videos and compare
staqan-yt get-videos --video-ids VIDEO_ID_1 VIDEO_ID_2 VIDEO_ID_3 --output json | \
  jq -r '.[].id' | \
  xargs -I {} sh -c 'echo "{}:"; staqan-yt get-video-analytics --video-id {} --output csv | head -n 2'
```

### Track Daily Views

```bash
# Get daily views for last 30 days
staqan-yt get-channel-analytics @yourchannel \
  --dimensions day \
  --metrics views \
  --start-date=$(date -v-30d +%Y-%m-%d) \
  --output csv > daily_views.csv
```

### Dimension Breakdown Across Multiple Videos

```bash
# Country breakdown for every video, combined into a single CSV with video-id column
# First, get all video IDs
VIDEO_IDS=($(staqan-yt list-videos --channel @yourchannel --output json | jq -r '.[].id'))

# Print CSV header once
echo "video-id,country,views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage"

# For each video, fetch analytics and prepend video-id to each row
for vid in "${VIDEO_IDS[@]}"; do
  staqan-yt get-video-analytics --video-id "$vid" --dimensions country --output csv | \
    tail -n +2 | \
    awk '$1 != "country"' | \
    awk -v vid="$vid" '{print vid "," $0}'
done
```

### Find Top Performing Content

```bash
# Get retention and find drop-off points
staqan-yt get-video-retention --video-id VIDEO_ID --output csv | \
  awk -F, 'NR>1 && $2 < 70 {print "Retention drops to", $2"% at", $1, "seconds"}'
```

### Analyze Subscriber Growth

```bash
# Get subscriber gains/losses by day
staqan-yt get-channel-analytics @yourchannel \
  --dimensions day \
  --metrics subscribersGained,subscribersLost \
  --output csv > subscriber_growth.csv
```

## Tips

1. **Use CSV output** for spreadsheet analysis and graphing
2. **Specify date ranges** to limit data and improve performance
3. **Combine metrics** to get insights (views + watch time = engagement)
4. **Track over time** - Compare the same metrics across different periods
5. **Use retention data** to optimize video structure and pacing

## API Quota Costs

Analytics API quota usage:
- **get-video-analytics**: 1 unit per request
- **get-video-retention**: 1-10 units depending on video length
- **get-search-terms**: 1 unit per request
- **get-traffic-sources**: 1 unit per request
- **get-channel-analytics**: 1 unit per request
- **get-channel-search-terms**: 1 unit per request

## Notes

- **Authentication required** - Must authenticate with analytics scope
- **Data delay** - Analytics data is typically 24-48 hours delayed
- **Date limits** - YouTube Analytics API limits date ranges to ~500 days
- **Channel ownership** - Some analytics require channel ownership
