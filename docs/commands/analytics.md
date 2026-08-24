# Analytics & Insights Commands

Commands for retrieving YouTube Analytics data and performance metrics.

> **Important:** These commands require the `https://www.googleapis.com/auth/yt-analytics.readonly` OAuth scope. Re-authenticate if needed: `staqan-yt auth`

## The 2026-08-24 view-counting change

On **2026-08-24** YouTube aligned view counting across formats: a view is
counted from the first frame of playback, with no minimum watch time. Dates
from that day onward are measured that way, earlier dates are not. The stricter
previous definition survives as **`engagedViews`**, which is also the metric
tied to monetization and YPP eligibility.

What this means in practice:

- **`views` is not one series.** A range that starts before 2026-08-24 and ends
  on or after it carries both definitions in the same column, so a total across
  it mixes them.
- **Older data is not comparable to newer data.** A range lying entirely before
  the change is internally consistent, but its `views` cannot be compared
  against `views` pulled for later dates.
- **`engagedViews` is consistent across the boundary.** Use it when you need
  one definition throughout, or when comparing against anything archived
  before the change.
- `redViews` is affected the same way as `views`.

`get-video-analytics` and `get-channel-analytics` print a note on stderr when
the requested range reaches back before the change, naming the dates affected.
It appears for `--output pretty` and `--output text` only, so `json`, `csv` and
`table` stay clean for piping. Ranges lying entirely on or after 2026-08-24 get
no note, because nothing about them is ambiguous.

```console
$ staqan-yt get-channel-analytics --dimensions day --metrics views \
    --start-date 2026-08-01 --end-date 2026-09-05
Note: views changes definition inside this date range. 2026-08-01 to
2026-08-23 is counted under the previous definition; 2026-08-24 onward counts
every playback from the first frame. Totals across the whole range mix the two.
engagedViews keeps the stricter definition throughout.
https://support.google.com/youtube/answer/2991785
```

MCP callers get the same signal as a `viewCountingNotice` object on the result,
carrying `changeDate`, `affectedMetrics`, `affectedRange` and `spansChange`, so
the date does not have to be hardcoded downstream.

Note that `views` and `engagedViews` were already returning different totals
for the same range before 2026-08-24, so the change date is not a clean
before/after split between the two metrics. The note states only which dates
were measured under which definition.

**Reference:** [How YouTube counts views](https://support.google.com/youtube/answer/2991785)

---

## get-video-analytics

Get video performance analytics (views, watch time, CTR, etc.).

### Usage

```bash
staqan-yt get-video-analytics --video-id <videoId>
```

### Options

- `--video-id <id>` - YouTube video ID or video URL (required)

- `--start-date <date>` - Start date (YYYY-MM-DD), defaults to upload date
- `--end-date <date>` - End date (YYYY-MM-DD), defaults to today
- `--metrics <metrics>` - Comma-separated list of metrics to fetch
- `--dimensions <dims>` - Comma-separated Analytics API dimensions (default: `video`). See the [dimension compatibility guide](../dimension-compatibility.md) for which combinations the API actually accepts (live-tested matrix)
- `--output <format>` - Output format: json, table, text, pretty, csv (default: pretty)
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Get all analytics (default date range: upload date to today)
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ

# Specify date range
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --start-date=2026-01-01 \
  --end-date=2026-01-31

# Get specific metrics only
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --metrics views,estimatedMinutesWatched,averageViewDuration

# Break down views by day
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --dimensions day --metrics views,estimatedMinutesWatched

# Break down views by traffic source type
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --dimensions insightTrafficSourceType --metrics views

# Break down views by country
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ \
  --dimensions country --metrics views,estimatedMinutesWatched

# Export to CSV
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --output csv > analytics.csv

# Export to JSON for processing
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --output json
```

### Default Metrics

If no `--metrics` specified, fetches these nine (`DEFAULT_VIDEO_METRICS` in `lib/analytics.ts`):
- `views` - Every playback, counted from the first frame
- `engagedViews` - Views under the stricter pre-2026-08-24 definition
- `estimatedMinutesWatched` - Total watch time
- `averageViewDuration` - Average view duration (seconds)
- `averageViewPercentage` - Average share of the video watched
- `likes` - Total likes
- `dislikes` - Total dislikes (if available)
- `comments` - Total comments
- `shares` - Total shares

`likes`, `dislikes`, `comments` and `shares` are unavailable for most
dimensions and get dropped automatically when you pass `--dimensions`.
`views` and `engagedViews` are permitted by every valid dimension, so neither
is ever dropped. See [Dimension Compatibility Guide](../dimension-compatibility.md#metrics-decide-more-than-dimensions-do).

### Available Metrics

Common metrics:
- `views` - Every playback, counted from the first frame
- `engagedViews` - Views under the stricter pre-2026-08-24 definition; the figure tied to monetization
- `estimatedMinutesWatched` - Total watch time (minutes)
- `averageViewDuration` - Average view duration (seconds)
- `subscribersGained` / `subscribersLost` - Subscriber changes
- `likes` / `dislikes` - Likes/dislikes
- `shares` - Number of shares
- `annotationClicks` - Annotation clicks

#### views vs engagedViews

The gap is not cosmetic, and it is concentrated in Shorts. Measured on one
channel over 2026-07-13..2026-08-23:

| video | type | `views` | `engagedViews` |
|---|---|---:|---:|
| a Short | short | 197 | **8** |
| a Short | short | 245 | **23** |
| a Short | short | 196 | **13** |
| long-form | regular | 548 | 548 |

Long-form is identical because a long-form view already counted from the
start. The 2026-08-24 alignment removed a minimum-watch-time rule that only
ever applied to Shorts, so that is where the two diverge.

Read `views` for reach and `engagedViews` for engagement and monetization.
Both are accepted by every valid dimension.

Full list: [YouTube Analytics Metrics](https://developers.google.com/youtube/analytics/v3/dimsmets/mets)

### Date Range Behavior

- **No dates specified**: Upload date to today
- **Start date only**: Start date to today
- **Both dates**: Specified range
- **Max range**: YouTube Analytics API limits to ~500 days

### Available Dimensions

By default, queries aggregate by `video` (the only dimension when `--dimensions` is omitted). Supply `--dimensions` to break results out along one or more Analytics API dimensions.

Supported dimensions for video-level queries:

- `day`, `month` - Time buckets (`month` needs first-of-month dates at both ends)
- `insightTrafficSourceType` - Traffic sources
- `creatorContentType` - `SHORT`, `LONG_FORM`, `LIVE`
- `liveOrOnDemand` - Live vs on-demand playback
- `country`, `dma` - Geography
- `deviceType`, `operatingSystem` - Device
- `youtubeProduct` - Core YouTube, Music, Kids, Gaming
- `insightPlaybackLocationType` - Where playback happened
- `subscribedStatus` - Subscribed vs non-subscribed viewers

Combine multiple dimensions with commas (e.g. `--dimensions day,deviceType`). The CLI rejects unknown dimensions and known-bad combinations (e.g. `country + day`) with a clear error before any API call.

**Most dimensions need `--metrics` narrowed.** The default metric set includes `likes`, `dislikes`, `comments` and `shares`, which the API only offers for a few dimensions, so `--dimensions deviceType` fails until you pass something like `--metrics views`. This is the most common cause of `The query is not supported`.

**→ See [Dimension Compatibility Guide](../dimension-compatibility.md)** for the measured dimension/metric matrix, the rejected combinations, and the `month` date rule.

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

### Limitations

The YouTube Analytics API's `insightTrafficSourceDetail` dimension has intermittent data availability: search terms are not consistently returned even when `get-traffic-sources` confirms traffic from YouTube Search. In practice, individual search-term rows are often empty or sparse.

This is an **API limitation**, not a code issue — see #23 for the original investigation and reproduction.

**Workaround:** use [`get-traffic-sources`](#get-traffic-sources), which queries the `insightTrafficSourceType` dimension and reliably returns aggregated traffic-source categories (YouTube Search, Suggested Videos, External, Subscriber Feed, etc.). For actionable search-traffic insight, prefer the aggregated categories over per-term rows.

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
- `--sort <field>` - Sort a custom query by one of the fields it selects; prefix with `-` for descending. Not valid with `--report`
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

#### Row order

The Analytics API only sorts by a field the query itself selects, so a custom
query is ranked by the first of these its `--metrics` contains:

1. `views`
2. `engagedViews`
3. `estimatedMinutesWatched`

descending. A query selecting none of them (`--metrics likes,shares`) comes
back in whatever order the API returns unless you pass `--sort`.

`--sort` overrides that choice and accepts any dimension or metric the query
selects, `-field` for descending:

```bash
# Rank countries by engaged views rather than by views
staqan-yt get-channel-analytics @yourchannel \
  --dimensions country \
  --metrics views,engagedViews \
  --sort -engagedViews

# Chronological instead of ranked
staqan-yt get-channel-analytics @yourchannel \
  --dimensions day \
  --metrics views \
  --sort day
```

Naming a field the query does not select fails before the request is sent, and
the error lists what is available. Predefined `--report` types carry their own
sort order, so combining them with `--sort` is rejected rather than silently
ignored.

`engagedViews` is accepted by the Analytics API today and is the metric that
keeps the stricter view definition once YouTube's view-counting change takes
effect on 2026-08-24. Which of the two belongs on the ranking axis is a
question about the analysis, not about the date, which is why `--sort` exists
rather than a rule that switches on its own.

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
