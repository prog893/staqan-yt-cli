import { describe, it, expect } from 'bun:test';
import {
  parseVideoId,
  parsePlaylistId,
  parseChannelHandle,
  parseDuration,
  formatTimestamp,
  formatNumber,
  chunkDateRange,
  convertToCSV,
  parsePositiveInt,
  validateDateOption,
  validateDateRange,
  validatePrivacyFilter,
  isRateLimitError,
  getRetryAfterMs,
} from '../lib/utils';

describe('parseVideoId', () => {
  it('returns 11-char IDs unchanged', () => {
    expect(parseVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from watch URLs', () => {
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from youtu.be and embed URLs', () => {
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});

describe('parsePlaylistId', () => {
  it('returns raw playlist IDs unchanged', () => {
    expect(parsePlaylistId('PLabc123')).toBe('PLabc123');
  });

  it('extracts list= from URLs', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
    expect(parsePlaylistId('https://www.youtube.com/watch?v=x&list=PLabc123')).toBe('PLabc123');
  });
});

describe('parseChannelHandle (#123 semantics)', () => {
  it('classifies @handles as handles', () => {
    expect(parseChannelHandle('@staqan')).toEqual({ type: 'handle', value: '@staqan' });
  });

  it('classifies @-URLs as handles, preserving the @', () => {
    expect(parseChannelHandle('https://www.youtube.com/@staqan')).toEqual({ type: 'handle', value: '@staqan' });
  });

  it('classifies /channel/ URLs as IDs and strips query strings', () => {
    expect(parseChannelHandle('https://youtube.com/channel/UCBQQNUsrd9mgCjsrLogKW6Q?sub=1'))
      .toEqual({ type: 'id', value: 'UCBQQNUsrd9mgCjsrLogKW6Q' });
  });

  it('treats raw UC… strings as IDs', () => {
    expect(parseChannelHandle('UCBQQNUsrd9mgCjsrLogKW6Q')).toEqual({ type: 'id', value: 'UCBQQNUsrd9mgCjsrLogKW6Q' });
  });

  it('rejects legacy /c/ and /user/ URLs with guidance', () => {
    expect(() => parseChannelHandle('https://youtube.com/c/SomeName')).toThrow(/Legacy channel URL/);
    expect(() => parseChannelHandle('https://youtube.com/user/oldname')).toThrow(/@handle/);
  });
});

describe('parseDuration', () => {
  it('parses full H/M/S durations', () => {
    expect(parseDuration('PT1H2M3S')).toBe(3723);
  });

  it('parses partial durations', () => {
    expect(parseDuration('PT59S')).toBe(59);
    expect(parseDuration('PT15M40S')).toBe(940);
    expect(parseDuration('PT2H')).toBe(7200);
  });

  it('returns 0 for garbage', () => {
    expect(parseDuration('not-a-duration')).toBe(0);
  });

  it('is the Shorts boundary oracle (<60s = Short)', () => {
    expect(parseDuration('PT59S')).toBeLessThan(60);
    expect(parseDuration('PT1M')).toBe(60);
  });
});

describe('formatTimestamp', () => {
  it('formats M:SS below an hour', () => {
    expect(formatTimestamp(75)).toBe('1:15');
    expect(formatTimestamp(0)).toBe('0:00');
  });

  it('formats H:MM:SS at an hour and above', () => {
    expect(formatTimestamp(3723)).toBe('1:02:03');
  });
});

describe('formatNumber', () => {
  it('inserts thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(999)).toBe('999');
  });
});

// Day-difference helper: parse as UTC so assertions hold in any test-runner TZ
// (dev machine is UTC+9, CI is UTC).
function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

describe('chunkDateRange (90-day Analytics API limit)', () => {
  it('keeps a short range as a single chunk', () => {
    const chunks = chunkDateRange('2026-01-01', '2026-01-31');
    expect(chunks).toEqual([{ start: '2026-01-01', end: '2026-01-31' }]);
  });

  it('covers the full range contiguously with chunks of at most 90 days', () => {
    const chunks = chunkDateRange('2025-01-01', '2026-01-01');
    expect(chunks[0].start).toBe('2025-01-01');
    expect(chunks[chunks.length - 1].end).toBe('2026-01-01');
    for (const c of chunks) {
      expect(daysInclusive(c.start, c.end)).toBeLessThanOrEqual(90);
    }
    for (let i = 1; i < chunks.length; i++) {
      // Each chunk starts the day after the previous one ends: no gaps, no overlap
      expect(daysInclusive(chunks[i - 1].end, chunks[i].start)).toBe(2);
    }
  });
});

describe('convertToCSV', () => {
  it('joins headers and rows', () => {
    const out = convertToCSV([{ name: 'a' }, { name: 'b' }], [[1, 2], [3, 4]]);
    expect(out).toBe('a,b\n1,2\n3,4');
  });

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const out = convertToCSV([{ name: 'v' }], [['say "hi", ok\nbye']]);
    expect(out).toBe('v\n"say ""hi"", ok\nbye"');
  });
});

describe('parsePositiveInt', () => {
  it('falls back to the default when the flag is absent', () => {
    expect(parsePositiveInt('--limit', undefined, 25)).toBe(25);
  });

  it('parses valid values', () => {
    expect(parsePositiveInt('--limit', '7', 25)).toBe(7);
  });

  it('throws on zero, negatives, and non-numbers', () => {
    expect(() => parsePositiveInt('--limit', '0', 25)).toThrow('--limit');
    expect(() => parsePositiveInt('--limit', '-3', 25)).toThrow();
    expect(() => parsePositiveInt('--limit', 'abc', 25)).toThrow();
  });
});

describe('validateDateOption', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(() => validateDateOption('--start-date', '2026-02-28')).not.toThrow();
  });

  it('rejects wrong formats', () => {
    expect(() => validateDateOption('--start-date', '2026/02/28')).toThrow('YYYY-MM-DD');
    expect(() => validateDateOption('--start-date', '28-02-2026')).toThrow();
  });

  it('rejects impossible calendar dates (#61 class)', () => {
    expect(() => validateDateOption('--start-date', '2024-02-30')).toThrow('not a valid date');
    expect(() => validateDateOption('--start-date', '2026-13-01')).toThrow();
  });

  it('accepts leap-day only in leap years', () => {
    expect(() => validateDateOption('--d', '2024-02-29')).not.toThrow();
    expect(() => validateDateOption('--d', '2026-02-29')).toThrow();
  });
});

describe('validateDateRange', () => {
  it('accepts start <= end (inclusive)', () => {
    expect(() => validateDateRange('2026-01-01', '2026-01-01')).not.toThrow();
    expect(() => validateDateRange('2026-01-01', '2026-06-30')).not.toThrow();
  });

  it('rejects start > end', () => {
    expect(() => validateDateRange('2026-06-30', '2026-01-01')).toThrow('--start-date');
  });
});

describe('validatePrivacyFilter', () => {
  it('accepts valid statuses and empty input', () => {
    expect(() => validatePrivacyFilter(['public', 'unlisted'])).not.toThrow();
    expect(() => validatePrivacyFilter(undefined)).not.toThrow();
    expect(() => validatePrivacyFilter([])).not.toThrow();
  });

  it('rejects unknown statuses', () => {
    expect(() => validatePrivacyFilter(['public', 'hidden'])).toThrow('hidden');
  });
});

describe('isRateLimitError (quota classification)', () => {
  it("classifies per-minute quota as 'rpm'", () => {
    expect(isRateLimitError({
      message: "Quota exceeded for quota metric 'Free requests' and limit 'Free requests per minute'",
    })).toBe('rpm');
  });

  it("classifies daily quota as 'daily'", () => {
    expect(isRateLimitError({
      message: "Quota exceeded for quota metric 'Free requests' and limit 'Free requests per day'",
    })).toBe('daily');
  });

  it('reads messages nested under response.data.error.errors[]', () => {
    expect(isRateLimitError({
      response: { data: { error: { errors: [{ message: 'blah per minute blah' }] } } },
    })).toBe('rpm');
  });

  it('returns null for everything else', () => {
    expect(isRateLimitError({ message: 'Video not found' })).toBeNull();
    expect(isRateLimitError(undefined)).toBeNull();
    expect(isRateLimitError('string error')).toBeNull();
  });
});

describe('getRetryAfterMs', () => {
  it('reads gaxios Headers-like objects', () => {
    const headers = { get: (n: string) => (n === 'retry-after' ? '7' : null) };
    expect(getRetryAfterMs({ response: { headers } })).toBe(7000);
  });

  it('reads plain lowercase header records', () => {
    expect(getRetryAfterMs({ response: { headers: { 'retry-after': '30' } } })).toBe(30000);
  });

  it('ignores HTTP-date and negative forms', () => {
    expect(getRetryAfterMs({ response: { headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } } })).toBeUndefined();
    expect(getRetryAfterMs({ response: { headers: { 'retry-after': '-5' } } })).toBeUndefined();
  });

  it('returns undefined when absent', () => {
    expect(getRetryAfterMs({})).toBeUndefined();
    expect(getRetryAfterMs({ response: {} })).toBeUndefined();
  });
});
