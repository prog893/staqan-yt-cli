import { describe, it, expect } from 'bun:test';
import { mkdtemp, readFile, writeFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { acquireLock } from '../lib/lock';

async function scratchLockPath(): Promise<{ dir: string; lockPath: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'staqan-lock-test-'));
  return { dir, lockPath: path.join(dir, 'test.lock') };
}

describe('acquireLock', () => {
  it('creates a lock file with our PID and removes it on release', async () => {
    const { dir, lockPath } = await scratchLockPath();
    try {
      const release = await acquireLock(lockPath, { timeout: 1000 });
      const info = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(info.pid).toBe(process.pid);
      await release();
      await expect(stat(lockPath)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('times out with the contention message when a live lock is held', async () => {
    const { dir, lockPath } = await scratchLockPath();
    try {
      const release = await acquireLock(lockPath, { timeout: 1000 });
      // Second acquire against our own live PID must wait, then fail with
      // the distinct contention message #132's error handling keys on.
      await expect(
        acquireLock(lockPath, { timeout: 300, interval: 50 })
      ).rejects.toThrow(/^Failed to acquire lock/);
      await release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('steals a stale lock (dead PID)', async () => {
    const { dir, lockPath } = await scratchLockPath();
    try {
      // PID 1 is init/launchd — process.kill(1, 0) throws EPERM for us, which
      // reads as "alive", so use a PID from the (usually) unused high range.
      await writeFile(lockPath, JSON.stringify({ pid: 3999999, created: new Date().toISOString() }));
      const release = await acquireLock(lockPath, { timeout: 1000, interval: 50 });
      const info = JSON.parse(await readFile(lockPath, 'utf-8'));
      expect(info.pid).toBe(process.pid);
      await release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('steals a lock older than staleAge even if the PID is alive', async () => {
    const { dir, lockPath } = await scratchLockPath();
    try {
      const oldCreated = new Date(Date.now() - 60_000).toISOString();
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, created: oldCreated }));
      const release = await acquireLock(lockPath, { timeout: 1000, interval: 50, staleAge: 10_000 });
      expect(typeof release).toBe('function');
      await release();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
