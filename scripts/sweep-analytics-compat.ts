/**
 * Live compatibility sweep for video-level Analytics queries (issue #173).
 *
 * Rebuilds the dimension and metric compatibility tables from the API instead
 * of trusting a hand-maintained matrix. The previous matrix (#143) drifted
 * because nothing ever re-checked it; this script exists so drift is a command
 * away from being visible.
 *
 * Method: two independent 1-D sweeps plus a composition law, rather than the
 * intractable dimension-set x metric-set cross product.
 *
 *   - Dimension validity is probed with `views` only. Every dimension permits
 *     `views`, so any rejection is a dimension conflict and never a metric one.
 *   - Metric validity is probed one dimension at a time, so any rejection is a
 *     metric conflict and never a dimension one.
 *
 * The two results then compose:
 *
 *   valid(dims, metrics)  <=>  every PAIR in dims is valid
 *                         AND  metrics is a subset of the intersection of the
 *                              per-dimension allowed metric sets
 *
 * Phase D does not assume that. It predicts higher-order cases from the laws
 * and reports every contradiction, so a wrong law fails loudly instead of
 * silently producing a bad table.
 *
 * Usage: bun scripts/sweep-analytics-compat.ts --video-id <id> [--out <file>]
 */

import { google, youtubeAnalytics_v2 } from 'googleapis';
import { writeFileSync } from 'fs';
import { getAuthenticatedClient } from '../lib/auth';

/**
 * Both ends must be the first of a month or the `month` dimension is rejected
 * on date alignment, which would look like an incompatibility. Every other
 * dimension accepts this range.
 */
const START_DATE = '2026-06-01';
const END_DATE = '2026-08-01';

/** Permitted by every dimension, so it isolates dimension conflicts. */
const CARRIER_METRIC = 'views';

/** Probed one at a time against a single dimension. */
const CANDIDATE_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'averageViewPercentage',
  'likes',
  'dislikes',
  'comments',
  'shares',
  'subscribersGained',
  'subscribersLost',
  'videosAddedToPlaylists',
  'redViews',
  'estimatedRedMinutesWatched',
  'annotationClickThroughRate',
  'cardClickRate',
];

/**
 * Every dimension the Analytics API v2 documents, plus the ones this CLI has
 * shipped at some point. Deliberately includes known-bad ones: a sweep that
 * only probes the current allowlist can never discover that it is too narrow.
 */
const CANDIDATE_DIMENSIONS = [
  'video', 'day', 'month', 'country', 'province', 'city', 'dma',
  'continent', 'subContinent', 'deviceType', 'operatingSystem',
  'subscribedStatus', 'youtubeProduct', 'liveOrOnDemand', 'creatorContentType',
  'insightTrafficSourceType', 'insightTrafficSourceDetail',
  'insightPlaybackLocationType', 'insightPlaybackLocationDetail',
  'insightPlayerLocationType', 'ageGroup', 'gender', 'sharingService',
  'channel', 'playlist', 'group', 'uploaderType', 'elapsedVideoTimeRatio',
  'audienceType',
];

type Verdict = 'OK' | 'REJECT' | 'UNKNOWN_ID' | 'ALIGN' | 'OTHER';

interface Probe {
  dimensions: string;
  metrics: string;
  verdict: Verdict;
  rows?: number;
  error?: string;
}

export interface SweepReport {
  generatedAt: string;
  videoId: string;
  dateRange: { startDate: string; endDate: string };
  validDimensions: string[];
  rejectedDimensions: { dimension: string; verdict: Verdict }[];
  invalidPairs: string[][];
  /** Dimensions valid in any pair but rejected in any larger query. */
  arityCaps: Record<string, number>;
  dimensionMetrics: Record<string, string[]>;
  lawChecks: { law: string; passed: number; failed: number; contradictions: string[] };
  probeCount: number;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Classify by cause. `Unknown identifier` means the name is not a dimension
 *  at all, which is a different finding from a real-but-incompatible one. */
function classify(message: string): Verdict {
  if (/Unknown identifier/i.test(message)) return 'UNKNOWN_ID';
  if (/does not align/i.test(message)) return 'ALIGN';
  if (/query is not supported/i.test(message)) return 'REJECT';
  return 'OTHER';
}

class Sweeper {
  private probes = 0;

  constructor(
    private readonly api: youtubeAnalytics_v2.Youtubeanalytics,
    private readonly videoId: string,
  ) {}

  get probeCount(): number {
    return this.probes;
  }

  async probe(dimensions: string, metrics: string): Promise<Probe> {
    this.probes++;
    try {
      const res = await this.api.reports.query({
        ids: 'channel==MINE',
        startDate: START_DATE,
        endDate: END_DATE,
        metrics,
        dimensions,
        filters: `video==${this.videoId}`,
      });
      await sleep(220);
      return { dimensions, metrics, verdict: 'OK', rows: res.data.rows?.length ?? 0 };
    } catch (e) {
      await sleep(220);
      const message = ((e as { message?: string }).message ?? String(e)).split('\n')[0];
      return { dimensions, metrics, verdict: classify(message), error: message.slice(0, 160) };
    }
  }
}

/** Phase A: which dimensions are usable at all, probed with the carrier metric. */
async function sweepSingles(s: Sweeper): Promise<{ valid: string[]; rejected: { dimension: string; verdict: Verdict }[] }> {
  const valid: string[] = [];
  const rejected: { dimension: string; verdict: Verdict }[] = [];
  console.log(`\n=== Phase A: ${CANDIDATE_DIMENSIONS.length} dimensions, singly (metrics=${CARRIER_METRIC}) ===`);
  for (const d of CANDIDATE_DIMENSIONS) {
    const r = await s.probe(d, CARRIER_METRIC);
    if (r.verdict === 'OK') {
      valid.push(d);
      console.log(`  OK      ${d} (${r.rows} rows)`);
    } else {
      rejected.push({ dimension: d, verdict: r.verdict });
      console.log(`  ${r.verdict.padEnd(7)} ${d}`);
    }
  }
  return { valid, rejected };
}

/** Phase B: all pairs among survivors. The `video` dimension is a filter-style
 *  passthrough, so pairing it adds noise rather than signal. */
async function sweepPairs(s: Sweeper, valid: string[]): Promise<string[][]> {
  const pairable = valid.filter(d => d !== 'video');
  const invalid: string[][] = [];
  const total = (pairable.length * (pairable.length - 1)) / 2;
  console.log(`\n=== Phase B: ${total} pairs (metrics=${CARRIER_METRIC}) ===`);
  for (let i = 0; i < pairable.length; i++) {
    for (let j = i + 1; j < pairable.length; j++) {
      const pair = [pairable[i], pairable[j]];
      const r = await s.probe(pair.join(','), CARRIER_METRIC);
      if (r.verdict !== 'OK') {
        invalid.push(pair);
        console.log(`  ${r.verdict.padEnd(7)} ${pair.join(' + ')}`);
      }
    }
  }
  console.log(`  ${invalid.length} invalid, ${total - invalid.length} valid`);
  return invalid;
}

/** Phase C: allowed metrics per dimension. Probes the whole set first and only
 *  falls back to per-metric probing when that is rejected, which keeps the
 *  common "allows everything" case at one probe instead of fifteen. */
async function sweepMetrics(s: Sweeper, valid: string[]): Promise<Record<string, string[]>> {
  const table: Record<string, string[]> = {};
  console.log(`\n=== Phase C: metrics per dimension (bisected) ===`);
  for (const d of valid) {
    const all = await s.probe(d, CANDIDATE_METRICS.join(','));
    if (all.verdict === 'OK') {
      table[d] = [...CANDIDATE_METRICS];
      console.log(`  ${d}: all ${CANDIDATE_METRICS.length} (1 probe)`);
      continue;
    }
    const allowed: string[] = [];
    for (const m of CANDIDATE_METRICS) {
      const r = await s.probe(d, m);
      if (r.verdict === 'OK') allowed.push(m);
    }
    table[d] = allowed;
    console.log(`  ${d}: ${allowed.length}/${CANDIDATE_METRICS.length} -> ${allowed.join(',') || '(none)'}`);
  }
  return table;
}

/**
 * Phase C2: some dimensions are valid in any pair but rejected in every larger
 * query, which the pairwise law cannot express. Discover that cap per dimension
 * rather than hardcoding the one we happened to trip over.
 */
async function sweepArityCaps(
  s: Sweeper,
  valid: string[],
  invalidPairs: string[][],
): Promise<Record<string, number>> {
  const isInvalidPair = (a: string, b: string): boolean =>
    invalidPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  const allPairsValid = (set: string[]): boolean =>
    set.every((a, i) => set.slice(i + 1).every(b => !isInvalidPair(a, b)));

  const pairable = valid.filter(d => d !== 'video');
  const caps: Record<string, number> = {};
  console.log(`\n=== Phase C2: per-dimension arity caps ===`);
  for (const d of pairable) {
    // Up to three triples that the pairwise law says should work. If every one
    // is rejected, the dimension itself is capped at 2.
    const triples: string[][] = [];
    for (const a of pairable) {
      for (const b of pairable) {
        if (triples.length >= 3) break;
        if (a === d || b === d || a === b) continue;
        const set = [d, a, b];
        if (allPairsValid(set)) triples.push(set);
      }
    }
    if (triples.length === 0) continue;
    let anyOk = false;
    for (const t of triples) {
      const r = await s.probe(t.join(','), CARRIER_METRIC);
      if (r.verdict === 'OK') {
        anyOk = true;
        break;
      }
    }
    if (!anyOk) {
      caps[d] = 2;
      console.log(`  ${d}: capped at 2 (every all-pairs-valid triple rejected)`);
    }
  }
  if (Object.keys(caps).length === 0) console.log('  no capped dimensions found');
  return caps;
}

/** Phase D: predict higher-order cases from the laws and check them. */
async function verifyLaws(
  s: Sweeper,
  valid: string[],
  invalidPairs: string[][],
  metricTable: Record<string, string[]>,
  arityCaps: Record<string, number>,
): Promise<SweepReport['lawChecks']> {
  const contradictions: string[] = [];
  let passed = 0;
  let failed = 0;
  const isInvalidPair = (a: string, b: string): boolean =>
    invalidPairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  const withinCaps = (set: string[]): boolean =>
    set.every(d => set.length <= (arityCaps[d] ?? Number.POSITIVE_INFINITY));
  const allPairsValid = (set: string[]): boolean =>
    set.every((a, i) => set.slice(i + 1).every(b => !isInvalidPair(a, b))) && withinCaps(set);

  const pairable = valid.filter(d => d !== 'video');
  const sets: string[][] = [];
  // Triples and quads that the laws predict valid.
  for (let i = 0; i < pairable.length && sets.length < 12; i++) {
    for (let j = i + 1; j < pairable.length && sets.length < 12; j++) {
      for (let k = j + 1; k < pairable.length && sets.length < 12; k++) {
        const set = [pairable[i], pairable[j], pairable[k]];
        if (allPairsValid(set)) sets.push(set);
      }
    }
  }
  // Capped dimensions in an oversized set, which the laws predict rejected.
  for (const d of Object.keys(arityCaps)) {
    const filler = pairable.filter(x => x !== d && !isInvalidPair(d, x)).slice(0, 2);
    if (filler.length === 2) sets.push([d, ...filler]);
  }
  // Sets containing exactly one invalid pair, which the law predicts rejected.
  for (const p of invalidPairs.slice(0, 6)) {
    const filler = pairable.find(d => !p.includes(d) && allPairsValid([...p.slice(0, 1), d]));
    if (filler) sets.push([...p, filler]);
  }

  console.log(`\n=== Phase D: ${sets.length} predictions from the two laws ===`);
  for (const set of sets) {
    const predicted = allPairsValid(set) ? 'OK' : 'REJECT';
    // Carrier metric keeps this a pure test of the pairwise law.
    const r = await s.probe(set.join(','), CARRIER_METRIC);
    const actual = r.verdict === 'OK' ? 'OK' : 'REJECT';
    if (actual === predicted) {
      passed++;
    } else {
      failed++;
      const note = `pairwise law: ${set.join(',')} predicted ${predicted}, got ${actual}`;
      contradictions.push(note);
      console.log(`  CONTRADICTION  ${note}`);
    }
  }

  // Intersection law: a metric allowed by every dimension in a set must work,
  // and one disallowed by any single dimension must not.
  const intersect = (set: string[]): string[] =>
    set.map(d => metricTable[d] ?? []).reduce((acc, cur) => acc.filter(m => cur.includes(m)));
  for (const set of sets.filter(allPairsValid).slice(0, 8)) {
    const shared = intersect(set);
    const excluded = CANDIDATE_METRICS.find(m => !shared.includes(m));
    if (shared.length > 0) {
      const r = await s.probe(set.join(','), shared.join(','));
      if (r.verdict === 'OK') {
        passed++;
      } else {
        failed++;
        const note = `intersection law: ${set.join(',')} with shared metrics predicted OK, got ${r.verdict}`;
        contradictions.push(note);
        console.log(`  CONTRADICTION  ${note}`);
      }
    }
    if (excluded) {
      const r = await s.probe(set.join(','), [...shared, excluded].join(','));
      if (r.verdict !== 'OK') {
        passed++;
      } else {
        failed++;
        const note = `intersection law: ${set.join(',')} + excluded metric ${excluded} predicted REJECT, got OK`;
        contradictions.push(note);
        console.log(`  CONTRADICTION  ${note}`);
      }
    }
  }

  console.log(`  ${passed} predictions held, ${failed} contradicted`);
  return { law: 'pairwise + intersection', passed, failed, contradictions };
}

function parseArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const videoId = parseArg('--video-id');
  const out = parseArg('--out') ?? 'analytics-compat-snapshot.json';
  if (!videoId) {
    console.error('Usage: bun scripts/sweep-analytics-compat.ts --video-id <id> [--out <file>]');
    process.exit(1);
  }

  const auth = await getAuthenticatedClient();
  const api = google.youtubeAnalytics({ version: 'v2', auth });
  const s = new Sweeper(api, videoId);

  const { valid, rejected } = await sweepSingles(s);
  const invalidPairs = await sweepPairs(s, valid);
  const dimensionMetrics = await sweepMetrics(s, valid);
  const arityCaps = await sweepArityCaps(s, valid, invalidPairs);
  const lawChecks = await verifyLaws(s, valid, invalidPairs, dimensionMetrics, arityCaps);

  const report: SweepReport = {
    generatedAt: new Date().toISOString(),
    videoId,
    dateRange: { startDate: START_DATE, endDate: END_DATE },
    validDimensions: valid,
    rejectedDimensions: rejected,
    invalidPairs,
    arityCaps,
    dimensionMetrics,
    lawChecks,
    probeCount: s.probeCount,
  };
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`probes:            ${s.probeCount}`);
  console.log(`valid dimensions:  ${valid.length} -> ${valid.join(', ')}`);
  console.log(`invalid pairs:     ${invalidPairs.length}`);
  console.log(`law contradictions: ${lawChecks.failed}`);
  console.log(`written to:        ${out}`);
  if (lawChecks.failed > 0) {
    console.error('\nComposition laws contradicted. Do not generate tables from this run.');
    process.exit(2);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
