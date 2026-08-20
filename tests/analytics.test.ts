import { describe, it, expect } from 'bun:test';
import {
  VIDEO_DIMENSIONS,
  INVALID_DIMENSION_COMBOS,
  validateVideoDimensions,
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
});
