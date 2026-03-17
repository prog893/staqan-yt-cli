import * as fs from 'fs/promises';
import * as path from 'path';
import os from 'os';
import { debug } from './utils';

export interface LockOptions {
  timeout?: number;        // Max wait time (ms) before giving up
  interval?: number;       // Retry interval (ms)
  staleAge?: number;       // Age to consider lock stale (ms) - default 30min
}

export interface LockInfo {
  pid: number;
  created: string;         // ISO 8601 timestamp
  purpose?: string;
  channelId?: string;
}

/**
 * Acquire a file-based lock with PID checking
 */
export async function acquireLock(
  lockPath: string,
  options: LockOptions = {}
): Promise<() => Promise<void>> {
  const {
    timeout = 30000,       // 30 second default timeout
    interval = 100,        // 100ms retry interval
    staleAge = 30 * 60 * 1000, // 30 minutes
  } = options;

  const startTime = Date.now();
  const myPid = process.pid;
  const lockInfo: LockInfo = {
    pid: myPid,
    created: new Date().toISOString(),
  };

  while (Date.now() - startTime < timeout) {
    try {
      // Try to create lock file exclusively (fails if exists)
      const lockContent = JSON.stringify(lockInfo, null, 2);
      await fs.writeFile(lockPath, lockContent, { flag: 'wx' });

      debug(`Acquired lock: ${lockPath} (PID ${myPid})`);

      // Return cleanup function
      return async () => {
        try {
          await fs.unlink(lockPath);
          debug(`Released lock: ${lockPath}`);
        } catch (err) {
          debug(`Failed to release lock ${lockPath}:`, (err as Error).message);
        }
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;

      // Lock exists - check if stale
      if (error.code === 'EEXIST') {
        const stale = await isLockStale(lockPath, staleAge);

        if (stale) {
          debug(`Removing stale lock: ${lockPath}`);
          try {
            await fs.unlink(lockPath);
            continue; // Try to acquire again
          } catch (unlinkErr) {
            debug(`Failed to remove stale lock:`, (unlinkErr as Error).message);
          }
        }

        // Lock is active - wait and retry
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }

      // Other error - give up
      throw error;
    }
  }

  throw new Error(`Failed to acquire lock ${lockPath} after ${timeout}ms`);
}

/**
 * Check if lock file is stale (PID doesn't exist or file is old)
 */
async function isLockStale(lockPath: string, staleAge: number): Promise<boolean> {
  try {
    const content = await fs.readFile(lockPath, 'utf-8');
    const lockInfo: LockInfo = JSON.parse(content);

    // Check file age
    const created = new Date(lockInfo.created).getTime();
    const age = Date.now() - created;
    if (age > staleAge) {
      debug(`Lock ${lockPath} is stale (age: ${Math.round(age / 1000)}s)`);
      return true;
    }

    // Check if PID exists
    const pidExists = await isProcessAlive(lockInfo.pid);
    if (!pidExists) {
      debug(`Lock ${lockPath} is stale (PID ${lockInfo.pid} not found)`);
      return true;
    }

    return false;
  } catch {
    // Can't read lock file - assume stale
    debug(`Failed to read lock file ${lockPath}, assuming stale`);
    return true;
  }
}

/**
 * Check if a process is running (cross-platform)
 */
async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    // POSIX: kill(pid, 0) tests if process exists without sending signal
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    // ESRCH = no such process
    return error.code !== 'ESRCH';
  }
}

/**
 * Get lock file path for a given resource
 */
export function getLockPath(type: 'completion' | 'handles' | 'reports', channelId?: string): string {
  const dataDir = path.join(os.homedir(), '.staqan-yt-cli', 'data');

  switch (type) {
    case 'completion':
      if (!channelId) throw new Error('channelId required for completion lock');
      return path.join(dataDir, channelId, 'completion_cache.json.lock');
    case 'handles':
      return path.join(dataDir, 'handle-to-channel-id.json.lock');
    case 'reports':
      if (!channelId) throw new Error('channelId required for reports lock');
      return path.join(dataDir, channelId, 'reports', '.lock');
  }
}
