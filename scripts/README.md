# Scripts

Build and release automation scripts for staqan-yt-cli.

## sync-version.ts

Synchronizes the version from `package.json` to all files that need it.

**Usage:**
```bash
bun run sync-version
```

**What it does:**
1. Reads version from `package.json` (single source of truth)
2. Updates `bin/staqan-yt.ts` fallback version (for compiled binaries)
3. Updates `Formula/staqan-yt.rb` version (for Homebrew)

**When to use:**
- Automatically runs via the `version` lifecycle script (`preversion` /
  `version` / `postversion` in `package.json`) — invoke with
  `bun run version`
- Can be run manually after editing `package.json` version

**Note:** You rarely need to run this manually. Use `bun run version`
instead, which handles everything automatically.

## sweep-analytics-compat.ts

Rebuilds the video-level Analytics compatibility tables in `lib/analytics.ts`
from the live API (issue #173).

**Usage:**

```bash
bun scripts/sweep-analytics-compat.ts --video-id <id> [--out snapshot.json]
```

**What it does:**
1. Probes every candidate dimension singly, with `views` as the carrier metric
2. Probes all pairs among the survivors
3. Probes which metrics each dimension permits: the whole set at once, then
   individually only if that is rejected
4. Discovers per-dimension arity caps
5. Predicts higher-order cases from the composition laws and verifies each one

**When to use:** when the API's behavior may have changed, or when
`tests/analytics.test.ts` fails on a pinned table. If any composition-law
prediction is contradicted, the run exits non-zero and writes no snapshot at
all, since a contradicted law means the generated tables would be wrong.

A transient failure is retried with backoff and never recorded as an
incompatibility. If one cannot be resolved, the run aborts instead of guessing:
a single rate-limit response misread as a verdict would ship as a permanent
table entry.

**Cost:** around 300 read-only queries. Requires a video the authenticated
channel owns.
