/**
 * Best-effort cleanup that swallowed more than the errno it documented (#196).
 *
 * The shape was always the same: a filesystem operation whose failure is
 * genuinely fine in one specific case, guarded by a catch that discarded every
 * case. `// Ignore if file doesn't exist` sat on top of a catch that also
 * ignored EACCES, EPERM, EBUSY, EROFS and EIO.
 *
 * The user-visible instance is `cache clean`, whose whole output is a count of
 * work done. With the cache directory unwritable, every unlink failed, the
 * counter never advanced, and it printed `Nothing to clean` with exit 0 while
 * all three files were still on disk. That is worse than an undercount: it
 * reports that there was nothing to remove.
 *
 * Two things these tests deliberately pin as NOT throwing: rolling back a
 * partial download (the original error must survive) and removing a temp file
 * whose contents are already parsed in memory. Making those strict would
 * replace a real error, or a completed download, with a temp-file complaint.
 *
 * The permission cases are skipped when running as root, since root bypasses
 * the mode bits and every `unlink` would succeed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { unlinkIfPresent } from '../lib/utils';
import { deleteReportFromCache, loadCacheIndex, saveReportToCache } from '../lib/cache';

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const describeUnlessRoot = isRoot ? describe.skip : describe;

const CHANNEL = 'UCtesttesttesttesttest0';
const TYPE = 'channel_reach_basic_a1';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staqan-cleanup-'));
});

/**
 * Restore write permission on every directory under `root` before removal.
 * Several tests chmod a directory to 555 to make `unlink` fail, and `rm -r`
 * cannot unlink through a read-only parent, so a shallow reset leaves the
 * temp tree (and the next test) behind.
 */
async function restorePermissions(root: string): Promise<void> {
  await fs.chmod(root, 0o700).catch(() => undefined);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) await restorePermissions(path.join(root, entry.name));
  }
}

afterEach(async () => {
  await restorePermissions(dir);
  await fs.rm(dir, { recursive: true, force: true });
});

describe('unlinkIfPresent (#196)', () => {
  it('removes a file that is there', async () => {
    const p = path.join(dir, 'present.json');
    await fs.writeFile(p, '{}');
    await unlinkIfPresent(p);
    expect(await fs.access(p).then(() => true, () => false)).toBe(false);
  });

  it('is a no-op when the file is already gone', async () => {
    // The one case that may be silent: the file being absent is the outcome
    // the caller wanted.
    await expect(unlinkIfPresent(path.join(dir, 'never-existed.json'))).resolves.toBeUndefined();
  });
});

describeUnlessRoot('unlinkIfPresent, unremovable file (#196)', () => {
  it('throws instead of reporting the file as already gone', async () => {
    // The regression. unlink fails EACCES because the *parent* is read-only,
    // and the old catch treated that identically to ENOENT.
    const p = path.join(dir, 'locked.json');
    await fs.writeFile(p, '{}');
    await fs.chmod(dir, 0o555);

    await expect(unlinkIfPresent(p)).rejects.toThrow();
    // And the file really is still there, which is the point.
    await fs.chmod(dir, 0o700);
    expect(await fs.access(p).then(() => true, () => false)).toBe(true);
  });

  it('surfaces the errno rather than flattening it to a generic message', async () => {
    const p = path.join(dir, 'locked2.json');
    await fs.writeFile(p, '{}');
    await fs.chmod(dir, 0o555);

    const err = await unlinkIfPresent(p).catch((e: NodeJS.ErrnoException) => e);
    expect((err as NodeJS.ErrnoException).code).toBe('EACCES');
  });
});

describeUnlessRoot('deleteReportFromCache (#196)', () => {
  let previousDataDir: string | undefined;

  beforeEach(() => {
    previousDataDir = process.env.STAQAN_YT_DATA_DIR;
    process.env.STAQAN_YT_DATA_DIR = dir;
  });

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.STAQAN_YT_DATA_DIR;
    else process.env.STAQAN_YT_DATA_DIR = previousDataDir;
  });

  it('does not drop the index entry when the payload could not be removed', async () => {
    // Orphaning is the failure mode: the CSV stays on disk holding the bytes
    // while the index entry that names it is gone, so nothing can find it and
    // nothing will re-download it.
    await saveReportToCache(CHANNEL, 'report-1', TYPE, 'day,views\n2026-01-01,5\n', {
      reportId: 'report-1',
      reportTypeId: TYPE,
      channelId: CHANNEL,
      startTime: '2026-01-01',
      endTime: '2026-01-01',
      startTimeActual: '2026-01-01',
      endTimeActual: '2026-01-01',
      downloadedAt: '2026-01-02T00:00:00.000Z',
      expiresAt: '2126-01-02T00:00:00.000Z',
      columns: ['day', 'views'],
      fileSize: 24,
      jobId: 'job-1',
    });

    // The payload lives under reports/<typeId>/, so that is the directory
    // whose write bit governs the unlink.
    const reportTypeDir = path.join(dir, CHANNEL, 'reports', TYPE);
    await fs.chmod(reportTypeDir, 0o555);

    await expect(deleteReportFromCache(CHANNEL, 'report-1', TYPE)).rejects.toThrow();

    await fs.chmod(reportTypeDir, 0o700);
    const index = await loadCacheIndex(CHANNEL);
    expect(index.entries.some(e => e.reportId === 'report-1')).toBe(true);
  });
});

/**
 * `cache clean` end to end.
 *
 * Driven as a child process because CACHE_DIR is derived from os.homedir() at
 * module load, so the scratch HOME has to be set before the CLI is imported.
 * `os.homedir()` honours $HOME on POSIX, which is the seam.
 */
describe('cache clean (#196)', () => {
  const CLI = path.resolve('dist/bin/staqan-yt.js');

  async function seed(home: string): Promise<void> {
    await fs.mkdir(path.join(home, '.staqan-yt-cli', 'cache', 'UCtest'), { recursive: true });
    for (const rel of [
      ['cache', 'completion_cache.json'],
      ['cache', 'handle-to-channel-id.json'],
      ['cache', 'UCtest', 'completion_cache.json'],
    ]) {
      await fs.writeFile(path.join(home, '.staqan-yt-cli', ...rel), '{}');
    }
  }

  function run(home: string): { stdout: string; stderr: string; status: number } {
    const res = spawnSync('bun', [CLI, 'cache', 'clean', '--yes'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf-8',
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status ?? -1 };
  }

  async function remaining(home: string): Promise<number> {
    const root = path.join(home, '.staqan-yt-cli', 'cache');
    let n = 0;
    for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (entry.isFile() && entry.name.endsWith('.json')) n++;
      else if (entry.isDirectory()) {
        n += (await fs.readdir(path.join(root, entry.name)).catch(() => []))
          .filter(f => f.endsWith('.json')).length;
      }
    }
    return n;
  }

  it('reports the count and exits 0 when every file is removable', async () => {
    // Positive control: the behaviour that must not regress.
    const home = path.join(dir, 'ok');
    await seed(home);
    const res = run(home);
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toContain('Cleared 3 cache file(s)');
    expect(await remaining(home)).toBe(0);
  });

  it('reports nothing to clean, and exits 0, on an empty cache', async () => {
    // The other legitimate quiet path: absent is not failure.
    const home = path.join(dir, 'empty');
    await fs.mkdir(path.join(home, '.staqan-yt-cli', 'cache'), { recursive: true });
    const res = run(home);
    expect(res.status).toBe(0);
    expect(res.stdout + res.stderr).toContain('Nothing to clean');
  });
});

describeUnlessRoot('cache clean, unwritable cache (#196)', () => {
  const CLI = path.resolve('dist/bin/staqan-yt.js');

  it('fails loudly instead of printing "Nothing to clean" with the files intact', async () => {
    const home = path.join(dir, 'ro');
    const cache = path.join(home, '.staqan-yt-cli', 'cache');
    await fs.mkdir(path.join(cache, 'UCtest'), { recursive: true });
    await fs.writeFile(path.join(cache, 'completion_cache.json'), '{}');
    await fs.writeFile(path.join(cache, 'handle-to-channel-id.json'), '{}');
    await fs.writeFile(path.join(cache, 'UCtest', 'completion_cache.json'), '{}');
    await fs.chmod(path.join(cache, 'UCtest'), 0o555);
    await fs.chmod(cache, 0o555);

    const res = spawnSync('bun', [CLI, 'cache', 'clean', '--yes'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf-8',
    });
    const out = (res.stdout ?? '') + (res.stderr ?? '');

    await fs.chmod(cache, 0o700);
    await fs.chmod(path.join(cache, 'UCtest'), 0o700);

    expect(res.status).not.toBe(0);
    expect(out).not.toContain('Nothing to clean');
    expect(out).toContain('Could not clear');
    // Names the paths that failed, since the errno alone does not say where.
    expect(out).toContain(path.join(cache, 'completion_cache.json'));
    expect(out).toContain(path.join(cache, 'UCtest', 'completion_cache.json'));
  });
});
