import * as path from 'path';

// Fallback for compiled binaries where package.json isn't on disk.
// Do not edit by hand: scripts/version.ts rewrites this line on `bun pm version`.
export const FALLBACK_VERSION = '2.1.1'; // synced by scripts/version.ts

/**
 * Resolve the CLI version: package.json when running from the repo/npm
 * install, FALLBACK_VERSION when running as a compiled binary.
 * Single source shared by the CLI entry point and the MCP server so the
 * two can never drift apart (issue #127 — MCP reported a stale 1.3.0).
 *
 * Both layouts are probed because __dirname differs by how we run:
 * dist/lib/ when built (root is ../../), lib/ when executed from source
 * via tsx/bun (root is ../) — CodeRabbit on #135.
 */
export function getVersion(): string {
  for (const rel of ['../../package.json', '../package.json']) {
    try {
      const packageJson = require(path.join(__dirname, rel));
      // Name check so a stray package.json in a parent directory can't
      // hijack the version (one layout's correct path is the other's parent).
      if (packageJson?.name === 'staqan-yt-cli' && packageJson.version) {
        return packageJson.version;
      }
    } catch {
      // try next layout
    }
  }
  return FALLBACK_VERSION;
}
