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
