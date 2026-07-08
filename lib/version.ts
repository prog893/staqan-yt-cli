import * as path from 'path';

// Fallback for compiled binaries where package.json isn't on disk.
// Do not edit by hand: scripts/version.ts rewrites this line on `bun pm version`.
export const FALLBACK_VERSION = '2.0.11'; // synced by scripts/version.ts

/**
 * Resolve the CLI version: package.json when running from the repo/npm
 * install, FALLBACK_VERSION when running as a compiled binary.
 * Single source shared by the CLI entry point and the MCP server so the
 * two can never drift apart (issue #127 — MCP reported a stale 1.3.0).
 */
export function getVersion(): string {
  try {
    const packageJson = require(path.join(__dirname, '../../package.json'));
    return packageJson.version;
  } catch {
    return FALLBACK_VERSION;
  }
}
