/**
 * `loadJsonIfPresent`: absent versus damaged (#195).
 *
 * Eight loaders across the codebase shared one shape, `readFile` then
 * `JSON.parse` inside a `try` whose `catch` returned a neutral value. That
 * collapsed two situations callers treat very differently:
 *
 *   - absent  -> "not configured yet", and the caller prints setup guidance
 *   - damaged -> the file exists and is unusable, and that guidance is wrong
 *
 * A corrupt `credentials.json` produced "run staqan-yt auth" for a file that
 * already existed. A stray comma in `config.json` made every setting silently
 * revert to its default. These tests pin the distinction itself, which is the
 * only thing the eight call sites rely on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadJsonIfPresent } from '../lib/utils';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staqan-json-loader-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('loadJsonIfPresent (#195)', () => {
  it('returns null when the file does not exist', () => {
    // The only case that may be silent. Every caller reads this as
    // "not configured yet".
    return expect(
      loadJsonIfPresent(path.join(dir, 'nope.json'), 'thing'),
    ).resolves.toBeNull();
  });

  it('parses a valid file', async () => {
    const p = path.join(dir, 'ok.json');
    await fs.writeFile(p, JSON.stringify({ a: 1, nested: { b: 'two' } }));
    expect(await loadJsonIfPresent<Record<string, unknown>>(p, 'thing')).toEqual({ a: 1, nested: { b: 'two' } });
  });

  it('throws on malformed JSON instead of reporting the file as absent', async () => {
    // The regression this exists for. A trailing comma is the realistic
    // hand-edit, and it used to read as "no config".
    const p = path.join(dir, 'bad.json');
    await fs.writeFile(p, '{"default": {"channel": "@x",}}');
    await expect(loadJsonIfPresent(p, 'config')).rejects.toThrow(/not valid JSON/);
  });

  it('names the file and its path in the parse error', async () => {
    // The old failure sent readers to fix the wrong thing, so the message has
    // to say which file is broken and where it is.
    const p = path.join(dir, 'bad2.json');
    await fs.writeFile(p, 'not json at all');
    await expect(loadJsonIfPresent(p, 'auth token')).rejects.toThrow(/auth token/);
    await expect(loadJsonIfPresent(p, 'auth token')).rejects.toThrow(p);
  });

  it('tells the reader how to recover', async () => {
    const p = path.join(dir, 'bad3.json');
    await fs.writeFile(p, '{');
    await expect(loadJsonIfPresent(p, 'config')).rejects.toThrow(/Fix the file, or delete it/);
  });

  it('throws on a read error that is not ENOENT', async () => {
    // A directory where a file is expected fails with EISDIR. Any non-ENOENT
    // errno takes the same path, which is the point: only absence is silent.
    const p = path.join(dir, 'adirectory.json');
    await fs.mkdir(p);
    await expect(loadJsonIfPresent(p, 'thing')).rejects.toThrow(/Cannot read thing/);
  });

  it('treats an empty file as damaged, not absent', async () => {
    // A truncated write leaves a zero-byte file. It exists, so it is not
    // absent, and it does not parse, so it is damaged.
    const p = path.join(dir, 'empty.json');
    await fs.writeFile(p, '');
    await expect(loadJsonIfPresent(p, 'cache')).rejects.toThrow(/not valid JSON/);
  });

  it('returns JSON null as null, same as an absent file', async () => {
    // A file containing the literal `null` parses successfully to null.
    // Callers cannot distinguish it from absence, and none of them need to:
    // both mean "nothing configured".
    const p = path.join(dir, 'null.json');
    await fs.writeFile(p, 'null');
    expect(await loadJsonIfPresent(p, 'thing')).toBeNull();
  });
});
