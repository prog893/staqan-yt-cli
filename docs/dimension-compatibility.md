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

`get-video-analytics` sends eight metrics by default:

```text
views, estimatedMinutesWatched, averageViewDuration, averageViewPercentage,
likes, dislikes, comments, shares
```

The four engagement metrics (`likes`, `dislikes`, `comments`, `shares`) are only
available for a few dimensions. Measured on 2026-08-20, one metric at a time,
against a video-level query:

| dimension | views | estimatedMinutesWatched | averageViewDuration | averageViewPercentage | likes | dislikes | comments | shares |
|---|---|---|---|---|---|---|---|---|
| `day` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `subscribedStatus` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `deviceType` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `youtubeProduct` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Because the default set contains all eight, `--dimensions deviceType` fails
with the default metrics even though `deviceType` is a perfectly valid
dimension. Pass a compatible metric set:

```bash
staqan-yt get-video-analytics --video-id VIDEO_ID \
  --dimensions deviceType,operatingSystem --metrics views
```

The client-side allowlist deliberately does **not** model this. It answers only
"can this dimension ever work", so it is validated with the most permissive
metric set (`views`). A dimension rejected there is rejected for every metric
set; one accepted there may still need `--metrics` narrowed.

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

These are refused client-side, so they cost no quota. Each was measured as
rejected with `--metrics views`, meaning no metric set can rescue them.

**Geography does not cross with daily, device or insight breakdowns:**

- `country` + `day`
- `country` + `deviceType`
- `country` + `operatingSystem`
- `country` + `insightTrafficSourceType`
- `country` + `insightPlaybackLocationType`
- `country` + `dma`

**Two time granularities cannot be requested at once:**

- `day` + `month`

**Device breakdowns do not cross with monthly or insight breakdowns:**

- `month` + `deviceType`
- `insightTrafficSourceType` + `deviceType`
- `insightPlaybackLocationType` + `deviceType`

This table is measured, not exhaustive. A pair that is absent is passed through,
and the API's own error surfaces if it dislikes the request.

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

Measured: 465 rows. No arity limit was found, so none is enforced.

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

**Last updated:** 2026-08-20
**Method:** live queries against the Analytics API v2, video-level
(`filters: video==<id>`), verifying each dimension singly, the pairs above, and
each default metric in isolation.
