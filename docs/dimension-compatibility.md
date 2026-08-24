# YouTube Analytics Dimension Compatibility Guide

Which `--dimensions` values `get-video-analytics` accepts, and why some
combinations are refused before the request is sent.

## Overview

Every claim in this guide was measured against the live Analytics API. Where an
earlier revision of this document guessed, the guess is called out and
corrected, because two of them were wrong in ways that cost real queries.

**The single most important fact:** compatibility is a property of the
**dimensions and the metrics together**, not of the dimensions alone. Most
"this dimension does not work" reports are actually the default metric set being
incompatible with that dimension. See [Metrics decide more than dimensions
do](#metrics-decide-more-than-dimensions-do).

## Metrics decide more than dimensions do

`get-video-analytics` sends nine metrics by default:

```text
views, engagedViews, estimatedMinutesWatched, averageViewDuration,
averageViewPercentage, likes, dislikes, comments, shares
```

The four engagement metrics (`likes`, `dislikes`, `comments`, `shares`) are only
available for a few dimensions. The API rejects the **entire query** when any
requested metric is unavailable for the requested dimensions, using the same
opaque "query is not supported" it uses for dimension conflicts.

`engagedViews` (added 2026-08-24, #175) is in the same compatibility class as
`views`: every dimension below permits both, so neither is ever the reason a
query is rejected.

Which of the nine default metrics each dimension permits:

| dimension | views | engaged | minutes | avgDur | avgPct | likes | dislikes | comments | shares |
|---|---|---|---|---|---|---|---|---|---|
| `video` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `day` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `month` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `country` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `creatorContentType` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `subscribedStatus` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `dma` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `deviceType` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `operatingSystem` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `youtubeProduct` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `insightTrafficSourceType` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `insightPlaybackLocationType` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `liveOrOnDemand` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

For a multi-dimension query the permitted set is the **intersection** of the
rows above. That is a measured law, not an assumption: `day` permits all nine,
`deviceType` permits five, and `day,deviceType` permits exactly those five.

### What the CLI does about it

- **You did not pass `--metrics`:** the incompatible defaults are dropped and
  the query runs. The dropped metrics are named on stderr, never on stdout, so
  piped output stays clean.
- **You passed `--metrics` explicitly:** nothing is altered. An incompatible
  metric is an error naming the metric and listing what the dimensions allow,
  because quietly returning different data than you asked for is worse than
  failing.

So `--dimensions deviceType` now works and returns the four view and watch-time
columns. To choose the columns yourself, pass them:

```bash
staqan-yt get-video-analytics --video-id VIDEO_ID \
  --dimensions deviceType,operatingSystem --metrics views,estimatedMinutesWatched
```

## Supported dimensions

These are accepted for a video-level query with no extra filters, which is the
only query shape this CLI sends:

`video`, `day`, `month`, `country`, `dma`, `deviceType`, `operatingSystem`,
`subscribedStatus`, `youtubeProduct`, `liveOrOnDemand`, `creatorContentType`,
`insightTrafficSourceType`, `insightPlaybackLocationType`

`month` carries a date-range rule, described below.

## Not supported, and why

| dimension | reason |
|---|---|
| `province` | Needs a `country==US` filter. Works when supplied, but the CLI has no way to send one. |
| `city` | Rejected for video queries even with a `country==US` filter. |
| `insightTrafficSourceDetail` | Rejected for video queries even with an `insightTrafficSourceType` filter. |
| `insightPlaybackLocationDetail` | Rejected even with an `insightPlaybackLocationType` filter. |
| `insightPlayerLocationType` | Not a real identifier. The API answers `Unknown identifier`. |
| `ageGroup`, `gender`, `sharingService` | Channel-level only. Use `get-channel-analytics`. |
| `channel`, `playlist`, `group`, `uploaderType` | Not applicable to video queries. |
| `continent`, `subContinent` | Filter-only, not breakdown dimensions. |

`province`, `city` and `insightTrafficSourceDetail` used to be allowlisted. They
could never succeed, so the only thing that changed by removing them is that the
error now names the problem instead of returning the API's generic "query is not
supported".

## The `month` dimension needs first-of-month dates

**Both** `--start-date` and `--end-date` must be the first day of a month. The
end date is *not* the last day of the range's final month, which is what an
earlier revision of this guide advised and what the API rejects.

| range | result |
|---|---|
| `2026-07-01` .. `2026-07-31` | ❌ `end-date does not align to chosen date dimension` |
| `2026-06-01` .. `2026-06-30` | ❌ same |
| `2026-07-05` .. `2026-07-20` | ❌ `start-date does not align` |
| `2026-07-01` .. `2026-08-01` | ✅ 2 rows |
| `2026-06-01` .. `2026-08-01` | ✅ 2 rows |
| `2026-07-01` .. `2026-07-01` | ✅ 1 row |

## Rejected combinations

Every pair among the supported dimensions was probed with `--metrics views`,
the metric every dimension permits, so each rejection below is a genuine
dimension conflict. **This list is complete, not a sample.**

`video` is excluded from pairing, since it is a filter-style passthrough rather
than a breakdown, which leaves 12 pairable dimensions and 66 pairs. 24 of those
66 are rejected, and all are refused client-side at no quota cost.

**Geography does not cross with daily, device or insight breakdowns:**

- `day` + `country`
- `country` + `deviceType`
- `country` + `operatingSystem`
- `country` + `insightTrafficSourceType`
- `country` + `insightPlaybackLocationType`
- `country` + `dma`

**Two time granularities cannot be requested at once:**

- `day` + `month`

**`month` does not cross with device or insight breakdowns:**

- `month` + `deviceType`
- `month` + `operatingSystem`
- `month` + `insightTrafficSourceType`
- `month` + `insightPlaybackLocationType`

**Device breakdowns do not cross with insight breakdowns:**

- `deviceType` + `insightTrafficSourceType`
- `deviceType` + `insightPlaybackLocationType`
- `operatingSystem` + `insightTrafficSourceType`
- `operatingSystem` + `insightPlaybackLocationType`
- `youtubeProduct` + `insightTrafficSourceType`
- `youtubeProduct` + `insightPlaybackLocationType`

**The two insight breakdowns do not cross with each other:**

- `insightTrafficSourceType` + `insightPlaybackLocationType`

**`dma` does not cross with device, platform or insight breakdowns:**

- `dma` + `deviceType`
- `dma` + `operatingSystem`
- `dma` + `youtubeProduct`
- `dma` + `liveOrOnDemand`
- `dma` + `insightTrafficSourceType`
- `dma` + `insightPlaybackLocationType`

## `dma` is capped at two dimensions

`dma` is accepted alone and in any pair it does not conflict with, but **every**
three-dimension query containing it is rejected, including ones whose pairs are
all individually valid:

```text
dma                        OK        day,dma,subscribedStatus         REJECT
day,dma                    OK        day,dma,creatorContentType       REJECT
dma,subscribedStatus       OK        dma,subscribedStatus,creatorC..  REJECT
dma,creatorContentType     OK        day,dma,month                    REJECT
```

This is the one case a pairwise table cannot express, so it is enforced as a
per-dimension arity cap instead. No other dimension has one.

### `country` + `month` is allowed

Worth stating explicitly, because an earlier revision guessed it was rejected.
It returns data given first-of-month dates:

```bash
staqan-yt get-video-analytics --video-id VIDEO_ID \
  --dimensions country,month --start-date 2026-06-01 --end-date 2026-08-01
```

## There is no four-dimension ceiling

Earlier revisions of this guide stated a maximum of 4 dimensions. That was a
misattribution. The 5-dimension example used to demonstrate it was
`country,creatorContentType,subscribedStatus,youtubeProduct,day`, which contains
`country,day`, and that pair fails on its own at 2 dimensions.

Seven dimensions in one query is accepted:

```bash
staqan-yt get-video-analytics --video-id VIDEO_ID --metrics views \
  --dimensions day,deviceType,operatingSystem,subscribedStatus,youtubeProduct,creatorContentType,liveOrOnDemand
```

Measured: 465 rows. No *global* arity limit was found, so none is enforced. The
only arity rule is the per-dimension `dma` cap described above.

## Useful combinations

All are shown with a compatible metric set.

```bash
# Geography by audience and platform
staqan-yt get-video-analytics --video-id VIDEO_ID --metrics views \
  --dimensions country,subscribedStatus,youtubeProduct

# Daily trend with device detail
staqan-yt get-video-analytics --video-id VIDEO_ID --metrics views \
  --dimensions day,deviceType,operatingSystem

# Full engagement over time (day supports every default metric)
staqan-yt get-video-analytics --video-id VIDEO_ID --dimensions day
```

## Common errors

| message | cause | fix |
|---|---|---|
| `Invalid --dimensions value: "x"` | Not in the allowlist. | Check the supported list above. |
| `Invalid --dimensions combination: a + b` | Known-bad pair, refused locally. | Split into separate queries. |
| `The query is not supported` | Usually the metric set, not the dimensions. | Retry with `--metrics views`. |
| `does not align to chosen date dimension` | `month` with dates that are not the 1st. | Use first-of-month for both dates. |
| `Unknown identifier (x)` | Not a real dimension. | Check spelling against the supported list. |

## Notes

- **Data delay:** analytics are typically 24-48 hours behind.
- **Date limits:** the API caps ranges at roughly 500 days. The CLI chunks
  longer ranges into 90-day windows automatically.
- **Ownership:** video-level analytics require channel ownership.
- **Quota:** one query costs the same whether it carries 1 or 7 dimensions, so
  prefer one wide query over several narrow ones.

---

## How this guide is produced

Everything above is generated by a live sweep, not maintained by hand:

```bash
bun scripts/sweep-analytics-compat.ts --video-id <id> --out snapshot.json
```

The sweep avoids the intractable dimension-set by metric-set cross product by
measuring two independent axes and composing them. Dimension validity is probed
with `views` only, which every dimension permits, so a rejection is always a
dimension conflict. Metric validity is probed one dimension at a time, so a
rejection is always a metric conflict. A query is then valid when every pair of
its dimensions is valid, no dimension exceeds its arity cap, and its metrics sit
inside the intersection of the per-dimension metric sets.

The composition laws are not assumed. The final phase predicts higher-order
cases from them and checks each prediction against the API, and the sweep
**writes no snapshot at all if any prediction is contradicted**. That is how the
`dma` arity cap was found: the pairwise law alone predicted `day,dma,subscribedStatus`
would work, the API disagreed, and the run failed rather than shipping a table
that was quietly wrong.

The previous matrix went stale because nothing ever re-checked it, which is what
produced #143. Re-running the sweep is now the maintenance procedure, and
`tests/analytics.test.ts` pins the shipped tables so drift fails CI instead of
going unnoticed.

**Last swept:** 2026-08-21, 296 probes, 35 predictions verified, 0 contradictions.
Raw output: [`analytics-compat-snapshot.json`](analytics-compat-snapshot.json).
