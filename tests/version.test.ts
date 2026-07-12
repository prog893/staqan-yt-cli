import { describe, it, expect } from 'bun:test';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { getVersion, FALLBACK_VERSION } from '../lib/version';
import packageJson from '../package.json';

describe('getVersion (#127)', () => {
  it('resolves the real package.json version from the source layout', () => {
    expect(getVersion()).toBe(packageJson.version);
  });

  it('keeps FALLBACK_VERSION in sync (scripts/version.ts contract)', () => {
    // If this fails, a release was cut without the sync script running —
    // compiled binaries would report a stale version.
    expect(FALLBACK_VERSION).toBe(packageJson.version);
  });

  it('keeps the sync marker line intact for scripts/version.ts', async () => {
    const src = await readFile(path.join(__dirname, '../lib/version.ts'), 'utf-8');
    expect(src).toMatch(/export const FALLBACK_VERSION = '[^']+'; \/\/ synced by scripts\/version\.ts/);
  });
});
