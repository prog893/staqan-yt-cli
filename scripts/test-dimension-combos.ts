#!/usr/bin/env bun
/**
 * Probes every dimension combination (size 1–4) against the YouTube Analytics API.
 *
 * Strategy: doc-based pre-pruning + bottom-up anti-monotone pruning.
 *
 *   Pre-prune (documented incompatibilities, no API call needed):
 *     1. day + month     — docs: "0 or 1 time dimension per query"
 *
 *   Metric adjustment per combo:
 *     - liveOrOnDemand   — docs: incompatible with averageViewPercentage; stripped automatically
 *     - month            — docs: startDate/endDate must be first of month; uses month-aligned range
 *
 *   Runtime pruning (Apriori anti-monotone):
 *     If a k-combo fails → all supersets are marked pruned (no API call).
 *
 * Usage:
 *   bun scripts/test-dimension-combos.ts --video-id <videoId> [--delay-ms 600]
 *
 * Results are written to scripts/results/dimension-combos-<videoId>-<timestamp>.txt
 */

import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { toLocalYmd } from '../lib/utils';
import * as fs from 'fs';
import * as path from 'path';

// ── Dimensions under test ──────────────────────────────────────────────────
const DIMENSIONS = [
  'country',
  'day',
  'month',
  'deviceType',
  'operatingSystem',
  'subscribedStatus',
  'insightTrafficSourceType',
  'insightPlaybackLocationType',
  'liveOrOnDemand',
  'creatorContentType',
  'youtubeProduct',
] as const;

// ── Doc-based pre-prune: pairs that are always invalid ─────────────────────
// Sources:
//   docs: "0 or 1 time dimension — day or month, but not both"
//   live-tested (2026-06-10, both Short and regular video): all return
//   "The query is not supported" from the API regardless of video type.
const KNOWN_BAD_PAIRS: [string, string][] = [
  // Time dimension constraint (documented)
  ['day', 'month'],
  // Geographic × time/device — not a supported report type
  ['country', 'day'],
  ['country', 'deviceType'],
  ['country', 'operatingSystem'],
  // Geographic × traffic source dimensions
  ['country', 'insightTrafficSourceType'],
  ['country', 'insightPlaybackLocationType'],
  // Device × traffic source dimensions
  ['deviceType', 'insightTrafficSourceType'],
  ['deviceType', 'insightPlaybackLocationType'],
  ['operatingSystem', 'insightTrafficSourceType'],
  ['operatingSystem', 'insightPlaybackLocationType'],
  // Traffic source dimensions can't combine with each other or youtubeProduct
  ['insightTrafficSourceType', 'insightPlaybackLocationType'],
  ['insightTrafficSourceType', 'youtubeProduct'],
  ['insightPlaybackLocationType', 'youtubeProduct'],
  // month can't combine with device or traffic source dimensions
  ['month', 'deviceType'],
  ['month', 'operatingSystem'],
  ['month', 'insightTrafficSourceType'],
  ['month', 'insightPlaybackLocationType'],
];

// ── Metric sets ────────────────────────────────────────────────────────────
// liveOrOnDemand is incompatible with averageViewPercentage (documented).
const METRICS_DEFAULT  = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage';
const METRICS_NO_AVG_P = 'views,estimatedMinutesWatched,averageViewDuration';

function metricsFor(dims: string[]): string {
  return dims.includes('liveOrOnDemand') ? METRICS_NO_AVG_P : METRICS_DEFAULT;
}

// ── Date ranges ────────────────────────────────────────────────────────────
// month dimension requires both startDate and endDate on month boundaries.
// Use the previous complete calendar month so the range is always valid.
function datesFor(dims: string[]): { startDate: string; endDate: string } {
  const today = new Date();
  if (dims.includes('month')) {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    // API requires both dates on the 1st of a month
    return { startDate: toLocalYmd(firstOfPrevMonth), endDate: toLocalYmd(firstOfThisMonth) };
  }
  const thirtyAgo = new Date(today);
  thirtyAgo.setDate(today.getDate() - 30);
  return { startDate: toLocalYmd(thirtyAgo), endDate: toLocalYmd(today) };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function combinations<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ];
}

// Canonical sorted key for set membership checks
function key(dims: string[]): string {
  return [...dims].sort().join(',');
}

// Returns true if any (size-1) subset of `combo` is in `failedKeys`
function anySubsetFailed(combo: string[], failedKeys: Set<string>): boolean {
  if (combo.length <= 1) return false;
  for (let i = 0; i < combo.length; i++) {
    const subset = combo.filter((_, idx) => idx !== i);
    if (failedKeys.has(key(subset))) return true;
  }
  return false;
}

// Returns true if the combo contains a known-bad pair
function containsKnownBadPair(combo: string[]): boolean {
  const set = new Set(combo);
  return KNOWN_BAD_PAIRS.some(([a, b]) => set.has(a) && set.has(b));
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── API probe ──────────────────────────────────────────────────────────────
async function probe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ya: any,
  videoId: string,
  dims: string[],
): Promise<{ ok: boolean; error?: string }> {
  const { startDate, endDate } = datesFor(dims);
  try {
    await ya.reports.query({
      ids: 'channel==MINE',
      startDate,
      endDate,
      metrics: metricsFor(dims),
      dimensions: dims.join(','),
      filters: `video==${videoId}`,
    });
    return { ok: true };
  } catch (err: any) {
    const msg: string =
      err.response?.data?.error?.message ??
      err.response?.data?.error?.errors?.[0]?.message ??
      err.message;
    return { ok: false, error: msg };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const videoIdIdx = args.indexOf('--video-id');
  if (videoIdIdx === -1 || !args[videoIdIdx + 1]) {
    console.error('Usage: bun scripts/test-dimension-combos.ts --video-id <id> [--delay-ms 600]');
    process.exit(1);
  }
  const videoId = args[videoIdIdx + 1];

  const delayIdx = args.indexOf('--delay-ms');
  const delayMs = delayIdx !== -1 ? parseInt(args[delayIdx + 1], 10) : 600;

  const auth = await getAuthenticatedClient();
  const ya = google.youtubeAnalytics({ version: 'v2', auth });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const outPath = path.join(tmpDir, `dimension-combos-${videoId}-${timestamp}.txt`);
  const outLines: string[] = [];

  const log = (line: string) => {
    console.log(line);
    outLines.push(line);
  };

  log(`Dimension combo probe`);
  log(`Video   : ${videoId}`);
  log(`Delay   : ${delayMs}ms`);
  log(`Started : ${new Date().toISOString()}`);
  log(`Pre-prune rules:`);
  log(`  - day+month together (0 or 1 time dimension per query)`);
  log(`  - liveOrOnDemand: strips averageViewPercentage from probe metrics`);
  log(`  - month: uses month-aligned date range (1st of current month)`);
  log('');

  const failedKeys = new Set<string>();

  // Seed failedKeys with known-bad pairs so Apriori propagates them automatically
  for (const [a, b] of KNOWN_BAD_PAIRS) {
    failedKeys.add(key([a, b]));
  }

  type Row = { combo: string[]; status: 'pass' | 'fail' | 'pre-pruned' | 'pruned'; error?: string };
  const rows: Row[] = [];
  let apiCalls = 0;

  for (let size = 1; size <= 4; size++) {
    const combos = combinations([...DIMENSIONS] as string[], size);

    const prePruned = combos.filter(c => containsKnownBadPair(c)).length;
    const runtimePrunable = combos.filter(
      c => !containsKnownBadPair(c) && anySubsetFailed(c, failedKeys)
    ).length;
    const toTest = combos.length - prePruned - runtimePrunable;

    log(`── Size ${size}  (${combos.length} combos · ${prePruned} doc-pruned · ${runtimePrunable} runtime-pruned · ${toTest} to test) ──`);

    for (const combo of combos) {
      const tag = `[${combo.join(', ')}]`;

      if (containsKnownBadPair(combo)) {
        log(`  DOC   ${tag}  (known incompatible)`);
        failedKeys.add(key(combo));
        rows.push({ combo, status: 'pre-pruned', error: 'doc-pruned' });
        continue;
      }

      if (anySubsetFailed(combo, failedKeys)) {
        log(`  SKIP  ${tag}  (subset failed)`);
        failedKeys.add(key(combo));
        rows.push({ combo, status: 'pruned' });
        continue;
      }

      if (apiCalls > 0) await sleep(delayMs);
      const result = await probe(ya, videoId, combo);
      apiCalls++;

      if (result.ok) {
        log(`  ✓     ${tag}`);
        rows.push({ combo, status: 'pass' });
      } else {
        log(`  ✗     ${tag}  — ${result.error}`);
        failedKeys.add(key(combo));
        rows.push({ combo, status: 'fail', error: result.error });
      }
    }

    log('');
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed     = rows.filter(r => r.status === 'pass');
  const failed     = rows.filter(r => r.status === 'fail');
  const prePruned  = rows.filter(r => r.status === 'pre-pruned');
  const pruned     = rows.filter(r => r.status === 'pruned');

  log('═══════════════════════════════════════════════════════');
  log('RESULTS');
  log(`  API calls made  : ${apiCalls}`);
  log(`  Passed          : ${passed.length}`);
  log(`  Failed (root)   : ${failed.length}`);
  log(`  Doc-pruned      : ${prePruned.length}`);
  log(`  Runtime-pruned  : ${pruned.length}`);
  log('');

  if (passed.length > 0) {
    log('VALID COMBINATIONS:');
    for (const r of passed) {
      log(`  ${r.combo.join(', ')}`);
    }
    log('');
  }

  if (failed.length > 0) {
    log('FAILING ROOT CAUSES:');
    for (const r of failed) {
      log(`  [${r.combo.join(', ')}] — ${r.error}`);
    }
    log('');
  }

  log(`Finished: ${new Date().toISOString()}`);

  fs.writeFileSync(outPath, outLines.join('\n') + '\n');
  console.error(`\nResults saved → ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
