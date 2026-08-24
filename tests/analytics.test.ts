import { describe, it, expect } from 'bun:test';
import {
  VIDEO_DIMENSIONS,
  INVALID_DIMENSION_COMBOS,
  DIMENSION_MAX_ARITY,
  VIEW_METRICS,
  ALL_SWEPT_METRICS,
  DIMENSION_METRICS,
  validateVideoDimensions,
  allowedMetricsFor,
  reconcileMetrics,
  DEFAULT_VIDEO_METRICS,
  resolveCustomSort,
  SORTABLE_METRIC_PREFERENCE,
  CHANNEL_REPORT_TYPES,
  viewCountingNoticeFor,
  viewCountingNoticeForColumns,
  VIEW_COUNTING_CHANGE_DATE,
  VIEW_COUNTING_CHANGE_URL,
} from '../lib/analytics';

/**
 * Every expectation here was measured against the live Analytics API on
 * 2026-08-20 with `filters: video==<id>` and no extra filters, which is the
 * only query shape this CLI sends. See docs/dimension-compatibility.md.
 */
describe('validateVideoDimensions', () => {
  it('accepts the documented single dimensions', () => {
    for (const d of ['video', 'day', 'country', 'deviceType', 'subscribedStatus']) {
      expect(validateVideoDimensions(d)).toBe(d);
    }
  });

  it('trims whitespace and normalizes the separator', () => {
    expect(validateVideoDimensions(' day , deviceType ')).toBe('day,deviceType');
  });

  it('rejects an empty value', () => {
    expect(() => validateVideoDimensions('')).toThrow('--dimensions cannot be empty');
    expect(() => validateVideoDimensions('  ,  ')).toThrow('--dimensions cannot be empty');
  });

  it('rejects unknown dimensions and names the valid ones', () => {
    expect(() => validateVideoDimensions('bogus')).toThrow(/Invalid --dimensions value: "bogus"/);
    expect(() => validateVideoDimensions('day,bogus')).toThrow(/Invalid --dimensions value/);
  });

  // Issue #143: these are accepted by the API for video queries but the
  // allowlist rejected them client-side, so the CLI refused work the API
  // would have done.
  it('accepts youtubeProduct and liveOrOnDemand (#143)', () => {
    expect(validateVideoDimensions('youtubeProduct')).toBe('youtubeProduct');
    expect(validateVideoDimensions('liveOrOnDemand')).toBe('liveOrOnDemand');
    expect(validateVideoDimensions('country,youtubeProduct')).toBe('country,youtubeProduct');
    expect(validateVideoDimensions('liveOrOnDemand,day')).toBe('liveOrOnDemand,day');
  });

  // Issue #143: allowlisted, but the API rejects them for the query shape this
  // CLI sends. They only ever produced the opaque "query is not supported".
  it('rejects dimensions the API refuses for video queries (#143)', () => {
    for (const d of ['province', 'city', 'insightTrafficSourceDetail', 'insightPlayerLocationType']) {
      expect(() => validateVideoDimensions(d)).toThrow(/Invalid --dimensions value/);
    }
  });

  it('rejects country paired with daily, device or insight breakdowns (#143)', () => {
    for (const combo of [
      'country,day',
      'country,deviceType',
      'country,operatingSystem',
      'country,insightTrafficSourceType',
      'country,insightPlaybackLocationType',
      'country,dma',
    ]) {
      expect(() => validateVideoDimensions(combo)).toThrow(/Invalid --dimensions combination/);
    }
  });

  it('rejects two time granularities at once', () => {
    expect(() => validateVideoDimensions('day,month')).toThrow(/Invalid --dimensions combination/);
  });

  it('rejects device breakdowns crossed with monthly or insight breakdowns', () => {
    for (const combo of [
      'month,deviceType',
      'insightTrafficSourceType,deviceType',
      'insightPlaybackLocationType,deviceType',
    ]) {
      expect(() => validateVideoDimensions(combo)).toThrow(/Invalid --dimensions combination/);
    }
  });

  it('detects an invalid combination regardless of order or extra dimensions', () => {
    expect(() => validateVideoDimensions('day,country')).toThrow(/Invalid --dimensions combination/);
    expect(() => validateVideoDimensions('country,subscribedStatus,day')).toThrow(
      /Invalid --dimensions combination/,
    );
  });

  it('accepts the country pairings the API does allow', () => {
    expect(validateVideoDimensions('country,subscribedStatus')).toBe('country,subscribedStatus');
    expect(validateVideoDimensions('country,creatorContentType')).toBe('country,creatorContentType');
    expect(validateVideoDimensions('country,liveOrOnDemand')).toBe('country,liveOrOnDemand');
    expect(validateVideoDimensions('country,month')).toBe('country,month');
  });

  // The "max 4 dimensions" note in the old matrix was a misattribution: the
  // 5-dimension example that failed contained country,day. 7 dimensions is
  // accepted, so no arity ceiling is enforced.
  it('does not impose an arity ceiling (#143)', () => {
    const seven = 'day,deviceType,operatingSystem,subscribedStatus,youtubeProduct,creatorContentType,liveOrOnDemand';
    expect(validateVideoDimensions(seven)).toBe(seven);
  });
});

describe('dimension tables', () => {
  it('lists only dimensions the API accepts unfiltered', () => {
    for (const d of ['province', 'city', 'insightTrafficSourceDetail', 'insightPlayerLocationType']) {
      expect(VIDEO_DIMENSIONS.has(d)).toBe(false);
    }
    for (const d of ['youtubeProduct', 'liveOrOnDemand', 'dma']) {
      expect(VIDEO_DIMENSIONS.has(d)).toBe(true);
    }
  });

  it('keeps every combo entry reachable through the allowlist', () => {
    // A combo naming a non-allowlisted dimension is dead code: the per-dimension
    // check throws first and the combo message can never be reached.
    for (const combo of INVALID_DIMENSION_COMBOS) {
      for (const d of combo) {
        expect(VIDEO_DIMENSIONS.has(d)).toBe(true);
      }
    }
  });

  // Pinned to the full pairwise sweep: all 66 pairs among the allowlist were
  // probed and these 24 rejected. Reachability alone would still pass if a
  // measured pair were dropped, or if an unmeasured one were added and began
  // rejecting queries the API actually serves. Regenerate with
  // `bun scripts/sweep-analytics-compat.ts` if the API's behavior changes.
  it('pins the swept combination matrix exactly', () => {
    expect(INVALID_DIMENSION_COMBOS.map(c => c.join('+')).sort()).toEqual([
      'country+deviceType',
      'country+dma',
      'country+insightPlaybackLocationType',
      'country+insightTrafficSourceType',
      'country+operatingSystem',
      'day+country',
      'day+month',
      'deviceType+insightPlaybackLocationType',
      'deviceType+insightTrafficSourceType',
      'dma+deviceType',
      'dma+insightPlaybackLocationType',
      'dma+insightTrafficSourceType',
      'dma+liveOrOnDemand',
      'dma+operatingSystem',
      'dma+youtubeProduct',
      'insightTrafficSourceType+insightPlaybackLocationType',
      'month+deviceType',
      'month+insightPlaybackLocationType',
      'month+insightTrafficSourceType',
      'month+operatingSystem',
      'operatingSystem+insightPlaybackLocationType',
      'operatingSystem+insightTrafficSourceType',
      'youtubeProduct+insightPlaybackLocationType',
      'youtubeProduct+insightTrafficSourceType',
    ].sort());
  });
});

/**
 * Issue #173: the API rejects the whole query when a requested metric is
 * unavailable for the requested dimensions, and returns the same opaque error
 * it uses for dimension conflicts. All expectations below come from the sweep
 * in scripts/sweep-analytics-compat.ts.
 */
describe('metric compatibility (#173)', () => {
  it('reports what a single dimension permits', () => {
    expect(allowedMetricsFor(['day'])).toContain('comments');
    expect(allowedMetricsFor(['deviceType'])).toEqual([...VIEW_METRICS]);
    expect(allowedMetricsFor(['youtubeProduct'])).toContain('redViews');
    expect(allowedMetricsFor(['youtubeProduct'])).not.toContain('likes');
  });

  // Verified against the API rather than assumed: a combination permits exactly
  // the metrics every one of its dimensions permits.
  it('composes by intersection across dimensions', () => {
    expect(allowedMetricsFor(['day', 'deviceType'])).toEqual([...VIEW_METRICS]);
    expect(allowedMetricsFor(['day', 'subscribedStatus'])).toContain('likes');
    expect(allowedMetricsFor(['day', 'subscribedStatus'])).not.toContain('comments');
    expect(allowedMetricsFor(['day', 'creatorContentType'])).toContain('comments');
  });

  it('imposes no restriction for dimensions with no swept row', () => {
    expect(allowedMetricsFor(['somethingNew'])).toContain('likes');
  });

  it('narrows a defaulted metric list instead of failing', () => {
    const r = reconcileMetrics(['deviceType'], DEFAULT_VIDEO_METRICS.split(','), false);
    expect(r.metrics).toEqual([...VIEW_METRICS]);
    expect(r.dropped).toEqual(['likes', 'dislikes', 'comments', 'shares']);
  });

  it('leaves a defaulted list alone when every metric is permitted', () => {
    const r = reconcileMetrics(['day'], DEFAULT_VIDEO_METRICS.split(','), false);
    expect(r.metrics).toEqual(DEFAULT_VIDEO_METRICS.split(','));
    expect(r.dropped).toEqual([]);
  });

  // An explicitly requested metric is never silently swapped for another:
  // returning different data than asked for is worse than an error.
  it('errors rather than narrowing an explicit metric list', () => {
    expect(() => reconcileMetrics(['deviceType'], ['views', 'likes'], true)).toThrow(
      /Metrics not available for --dimensions deviceType: likes/,
    );
  });

  it('passes through metrics outside the swept vocabulary', () => {
    const r = reconcileMetrics(['deviceType'], ['views', 'someFutureMetric'], true);
    expect(r.metrics).toEqual(['views', 'someFutureMetric']);
  });
});

describe('arity caps (#173)', () => {
  it('rejects a capped dimension in an oversized query', () => {
    expect(() => validateVideoDimensions('day,dma,subscribedStatus')).toThrow(
      /cannot be combined with more than 1 other dimension/,
    );
  });

  it('allows a capped dimension alone and in a pair', () => {
    expect(validateVideoDimensions('dma')).toBe('dma');
    expect(validateVideoDimensions('day,dma')).toBe('day,dma');
  });

  it('leaves uncapped dimensions unbounded', () => {
    expect(DIMENSION_MAX_ARITY.day).toBeUndefined();
    const seven = 'day,deviceType,operatingSystem,subscribedStatus,youtubeProduct,creatorContentType,liveOrOnDemand';
    expect(validateVideoDimensions(seven)).toBe(seven);
  });
});

/**
 * The unsorted-output failure was measured against the live Analytics API on
 * 2026-08-21: `--dimensions day --metrics views` came back ranked by views,
 * while `--dimensions day --metrics engagedViews` over the identical range
 * came back in raw date order.
 */
describe('custom query sort (#179)', () => {
  it('keeps -views for any metric set selecting views', () => {
    expect(resolveCustomSort('country', 'views')).toBe('-views');
    expect(resolveCustomSort('country', 'views,estimatedMinutesWatched')).toBe('-views');
    // The pre-#179 rule already produced this; widening the preference list
    // must not move an existing query's ranking axis.
    expect(resolveCustomSort('country', 'views,engagedViews')).toBe('-views');
  });

  it('ranks a view metric the old literal check missed', () => {
    expect(resolveCustomSort('day', 'engagedViews')).toBe('-engagedViews');
    expect(resolveCustomSort('day', 'engagedViews,estimatedMinutesWatched')).toBe('-engagedViews');
    expect(resolveCustomSort('day', 'estimatedMinutesWatched')).toBe('-estimatedMinutesWatched');
  });

  it('does not match a metric that merely contains a sortable name', () => {
    expect(resolveCustomSort('day', 'redViews')).toBeUndefined();
    expect(resolveCustomSort('day', 'estimatedRedMinutesWatched')).toBeUndefined();
  });

  it('tolerates whitespace and empty entries in the metric list', () => {
    expect(resolveCustomSort('country', ' views , likes ')).toBe('-views');
    expect(resolveCustomSort('country', 'engagedViews,,')).toBe('-engagedViews');
  });

  it('leaves a query selecting nothing rankable to the API order', () => {
    expect(resolveCustomSort('ageGroup,gender', 'viewerPercentage')).toBeUndefined();
    expect(resolveCustomSort('country', 'likes,shares')).toBeUndefined();
  });

  it('honors an explicit sort over the preference order', () => {
    expect(resolveCustomSort('country', 'views,likes', 'likes')).toBe('likes');
    expect(resolveCustomSort('country', 'views,likes', '-likes')).toBe('-likes');
    // A dimension is a valid sort field too.
    expect(resolveCustomSort('day', 'views', 'day')).toBe('day');
  });

  it('rejects an explicit sort the query does not select', () => {
    expect(() => resolveCustomSort('country', 'views', 'likes')).toThrow(
      /Invalid --sort value: "likes"/,
    );
    // The message names what is actually available, per the #173 convention.
    expect(() => resolveCustomSort('country', 'views', '-shares')).toThrow(
      /Available: country, views/,
    );
    expect(() => resolveCustomSort('country', 'views', '-')).toThrow(/--sort cannot be empty/);
  });

  it('keeps engagedViews out of the predefined reports (#179 item 3)', () => {
    for (const [name, config] of Object.entries(CHANNEL_REPORT_TYPES)) {
      expect(config.metrics, `${name} metrics`).not.toContain('engagedViews');
      // Each predefined report carries its own sort, so it never reaches
      // resolveCustomSort and is unaffected by the preference order.
      expect(config.sort, `${name} sort`).toBeTruthy();
    }
  });

  it('lists the preference order most-specific first', () => {
    expect([...SORTABLE_METRIC_PREFERENCE]).toEqual([
      'views', 'engagedViews', 'estimatedMinutesWatched',
    ]);
  });
});

/**
 * The notice fires on the range, not on a guess about the data (#178).
 *
 * Live measurement on 2026-08-21, before the change: `views` and
 * `engagedViews` already differed for the same range (channel STAQAN, country
 * JP, 2026-05-01..2026-08-19: 1404 vs 802). So the notice deliberately does
 * NOT claim the two series are equal before the cutoff and diverge after it.
 * It states only what the date arithmetic supports: which dates were measured
 * under which definition.
 */
describe('view-counting change notice (#178)', () => {
  const AFTER = '2026-08-24';
  const BEFORE_END = '2026-08-23';

  it('stays silent for a range entirely on or after the change', () => {
    expect(viewCountingNoticeFor(AFTER, '2026-09-30', 'views')).toBeUndefined();
    expect(viewCountingNoticeFor('2026-09-01', '2026-09-30', 'views')).toBeUndefined();
  });

  it('fires on the first day that reaches back before the change', () => {
    // Boundary: a start one day earlier is affected, the change date itself is not.
    expect(viewCountingNoticeFor(BEFORE_END, '2026-09-30', 'views')).toBeDefined();
    expect(viewCountingNoticeFor(AFTER, '2026-09-30', 'views')).toBeUndefined();
  });

  it('reports a straddling range as mixing two definitions', () => {
    const n = viewCountingNoticeFor('2026-08-01', '2026-09-05', 'views');
    expect(n?.spansChange).toBe(true);
    // The affected slice ends the day before the change, not at the range end.
    expect(n?.affectedRange).toEqual({ startDate: '2026-08-01', endDate: BEFORE_END });
    expect(n?.message).toContain('mix the two');
  });

  it('reports a fully pre-change range as not comparable to later data', () => {
    const n = viewCountingNoticeFor('2026-05-01', '2026-08-19', 'views');
    expect(n?.spansChange).toBe(false);
    // Nothing is truncated here: the whole requested range is affected.
    expect(n?.affectedRange).toEqual({ startDate: '2026-05-01', endDate: '2026-08-19' });
    expect(n?.message).toContain('not comparable');
    expect(n?.message).not.toContain('mix the two');
  });

  it('only fires for metrics the change actually moved', () => {
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'views')).toBeDefined();
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'redViews')).toBeDefined();
    // engagedViews keeps the stricter definition on both sides, so a query
    // selecting only it is consistent end to end.
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'engagedViews')).toBeUndefined();
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'likes,shares')).toBeUndefined();
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'viewerPercentage')).toBeUndefined();
  });

  it('names every affected metric it found', () => {
    const n = viewCountingNoticeFor('2026-05-01', '2026-09-05', 'views,engagedViews,redViews');
    expect(n?.affectedMetrics).toEqual(['views', 'redViews']);
    expect(n?.affectedMetrics).not.toContain('engagedViews');
  });

  it('names only redViews for a redViews-only query', () => {
    // The message must not talk about `views` when the query never selected
    // it, which is what a hardcoded metric name in the wording would do.
    const n = viewCountingNoticeFor('2026-05-01', '2026-09-05', 'redViews');
    expect(n?.affectedMetrics).toEqual(['redViews']);
    expect(n?.message).toContain('redViews');
    expect(n?.message).not.toMatch(/(^|[^d])\bviews\b/);
  });

  it('does not match a metric that merely contains an affected name', () => {
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'redViewsPercentage')).toBeUndefined();
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', 'estimatedRedMinutesWatched')).toBeUndefined();
  });

  it('carries the date and the reference URL so callers need not hardcode them', () => {
    const n = viewCountingNoticeFor('2026-05-01', '2026-09-05', 'views');
    expect(n?.changeDate).toBe(VIEW_COUNTING_CHANGE_DATE);
    expect(n?.learnMoreUrl).toBe(VIEW_COUNTING_CHANGE_URL);
    expect(n?.message).toContain(VIEW_COUNTING_CHANGE_URL);
    expect(n?.message).toContain('2026-08-24');
  });

  it('tolerates whitespace in the metric list', () => {
    expect(viewCountingNoticeFor('2026-05-01', '2026-09-05', ' views , likes ')).toBeDefined();
  });
});

/**
 * The bulk Reporting API variant of the same notice (#177).
 *
 * Its inputs are a report's CSV header row, not an Analytics metric list, so
 * the affected fields are spelled `views` and `red_views` and the consistent
 * one is `engaged_views`. The date logic is shared with the Analytics path
 * and is covered above; these cover the parts that are not shared.
 *
 * Measured against the local archive on 2026-08-24 (3,683 reports,
 * 2026-01-22 to 2026-08-22): every report type carrying `views` also carried
 * `engaged_views`, from the earliest archived window onward, and no report
 * type had more than one column set. That is why this is keyed on dates and
 * not on detecting a new column: there is no new column to detect.
 */
describe('view-counting change notice for report columns (#177)', () => {
  // A real header row, from channel_basic_a3 in the local archive.
  const BASIC_A3 = [
    'date', 'channel_id', 'video_id', 'live_or_on_demand', 'subscribed_status',
    'country_code', 'views', 'engaged_views', 'comments', 'likes', 'dislikes',
    'shares', 'watch_time_minutes', 'red_views', 'red_watch_time_minutes',
  ];

  it('fires on a range reaching back before the change', () => {
    const n = viewCountingNoticeForColumns('2026-05-01', '2026-09-05', BASIC_A3);
    expect(n?.spansChange).toBe(true);
    expect(n?.affectedRange).toEqual({ startDate: '2026-05-01', endDate: '2026-08-23' });
  });

  it('stays silent for a range entirely on or after the change', () => {
    expect(viewCountingNoticeForColumns('2026-08-24', '2026-09-30', BASIC_A3)).toBeUndefined();
  });

  it('names the affected columns in the Reporting API spelling', () => {
    const n = viewCountingNoticeForColumns('2026-05-01', '2026-09-05', BASIC_A3);
    // snake_case, not the Analytics `redViews`.
    expect(n?.affectedMetrics).toEqual(['views', 'red_views']);
    expect(n?.affectedMetrics).not.toContain('redViews');
  });

  it('points at engaged_views, not engagedViews, as the consistent column', () => {
    // A message naming a column the CSV does not have sends the reader
    // looking for a field that is not there.
    const n = viewCountingNoticeForColumns('2026-05-01', '2026-09-05', BASIC_A3);
    expect(n?.message).toContain('engaged_views');
    expect(n?.message).not.toContain('engagedViews');
  });

  it('presence of engaged_views does not suppress the notice', () => {
    // The whole point: every affected report type already carries this
    // column, so treating it as an all-clear would silence the notice
    // everywhere it matters.
    expect(viewCountingNoticeForColumns('2026-05-01', '2026-09-05', BASIC_A3)).toBeDefined();
  });

  it('stays silent for a report type with no view columns', () => {
    // channel_demographics_a1 carries viewer_percentage and no view count.
    const demographics = ['date', 'channel_id', 'video_id', 'age_group', 'gender', 'views_percentage'];
    expect(viewCountingNoticeForColumns('2026-05-01', '2026-09-05', demographics)).toBeUndefined();
  });

  it('does not match a column that merely contains an affected name', () => {
    expect(
      viewCountingNoticeForColumns('2026-05-01', '2026-09-05', ['date', 'red_views_percentage'])
    ).toBeUndefined();
    expect(
      viewCountingNoticeForColumns('2026-05-01', '2026-09-05', ['date', 'annotation_views'])
    ).toBeUndefined();
  });

  it('fires for a red_views-only report without mentioning views', () => {
    const n = viewCountingNoticeForColumns('2026-05-01', '2026-09-05', ['date', 'red_views']);
    expect(n?.affectedMetrics).toEqual(['red_views']);
    // `red_views` contains "views", so the check has to exclude that match.
    expect(n?.message).not.toMatch(/(^|[^_])\bviews\b/);
  });
});

/**
 * The fixed-shape reports send metric sets the caller cannot override, so the
 * notice has to be derived from what each one hardcodes rather than from a
 * user-supplied `--metrics` (#185's sites, but not #185's decision).
 *
 * `get-traffic-sources` is the sharpest case: it exposes no date flags at all
 * and hardcodes a rolling 30-day window, so for the first 30 days after
 * 2026-08-24 its one and only behaviour straddles the change.
 */
describe('view-counting notice for fixed-metric reports', () => {
  it('fires for the traffic-source and per-video search-term metric set', () => {
    // Both send exactly `views`.
    expect(viewCountingNoticeFor('2026-07-26', '2026-08-25', 'views')).toBeDefined();
  });

  it('fires for the channel search-terms metric set', () => {
    // SEARCH_TERMS_METRICS is 'views,estimatedMinutesWatched'; only the first
    // is affected, and the note must not claim the watch-time metric moved.
    const n = viewCountingNoticeFor('2026-05-01', '2026-09-05', 'views,estimatedMinutesWatched');
    expect(n?.affectedMetrics).toEqual(['views']);
    expect(n?.message).not.toContain('estimatedMinutesWatched');
  });

  it('reports a rolling window that straddles the change as mixing definitions', () => {
    // A 30-day window ending after the change, which is what
    // get-traffic-sources produces unattended.
    const n = viewCountingNoticeFor('2026-07-26', '2026-08-25', 'views');
    expect(n?.spansChange).toBe(true);
    expect(n?.affectedRange).toEqual({ startDate: '2026-07-26', endDate: '2026-08-23' });
    expect(n?.message).toContain('mix the two');
  });

  it('goes quiet once the rolling window clears the change date', () => {
    // 30 days after the change these commands stop warning on their own.
    expect(viewCountingNoticeFor('2026-09-24', '2026-10-24', 'views')).toBeUndefined();
  });
});

/**
 * engagedViews support (#175), from the live sweep on 2026-08-24 (the day the
 * view-counting change took effect, which is the first day the metric could be
 * measured post-cutoff). Snapshot: docs/analytics-compat-snapshot.json.
 *
 * The measured behavior that motivated widening the default set, same channel,
 * 2026-07-13..2026-08-23:
 *
 *   BpesXOddpVc (short)     197 views     8 engagedViews
 *   qC_vD4tPNqA (short)     245 views    23 engagedViews
 *   -COxZI7L-IA (long-form) 548 views   548 engagedViews
 *
 * Long-form is unchanged because the minimum-watch-time rule the alignment
 * removed only ever applied to Shorts.
 */
describe('engagedViews (#175)', () => {
  it('is permitted by every dimension the sweep validated', () => {
    // The point of widening the default: unlike likes/comments/shares, this
    // metric never narrows a query, so it costs nothing in compatibility.
    for (const d of Object.keys(DIMENSION_METRICS)) {
      expect(allowedMetricsFor([d]), `dimension ${d}`).toContain('engagedViews');
    }
  });

  it('sits in the same compatibility class as views', () => {
    // Measured, not assumed: any dimension permitting views permits
    // engagedViews and vice versa. A future sweep that breaks this parity
    // should fail here rather than silently produce an asymmetric table.
    for (const d of Object.keys(DIMENSION_METRICS)) {
      const allowed = allowedMetricsFor([d]);
      expect(allowed.includes('views'), `dimension ${d}`).toBe(allowed.includes('engagedViews'));
    }
  });

  it('is carried by the swept vocabulary and the universal view set', () => {
    expect(ALL_SWEPT_METRICS).toContain('engagedViews');
    expect(VIEW_METRICS).toContain('engagedViews');
  });

  it('is in the default metric set, right after views', () => {
    const defaults = DEFAULT_VIDEO_METRICS.split(',');
    expect(defaults).toContain('engagedViews');
    expect(defaults.indexOf('engagedViews')).toBe(defaults.indexOf('views') + 1);
  });

  it('survives reconciliation for every dimension, including restrictive ones', () => {
    // The concern #175 raised about widening the default was that it would add
    // failure modes. It does not: the metric is never dropped, anywhere.
    for (const d of Object.keys(DIMENSION_METRICS)) {
      const r = reconcileMetrics([d], DEFAULT_VIDEO_METRICS.split(','), false);
      expect(r.metrics, `dimension ${d}`).toContain('engagedViews');
      expect(r.dropped, `dimension ${d}`).not.toContain('engagedViews');
    }
  });

  it('does not change which other metrics get dropped', () => {
    // Widening the default must not disturb the existing narrowing behavior.
    const r = reconcileMetrics(['deviceType'], DEFAULT_VIDEO_METRICS.split(','), false);
    expect(r.dropped).toEqual(['likes', 'dislikes', 'comments', 'shares']);
  });
});
