/**
 * Internal completion helper for tab completion
 * Called by shell scripts as: staqan-yt __complete --type <type>
 * Outputs one "id\ttitle" per line, silent on any error.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import ora from 'ora';
import { google } from 'googleapis';
import { getChannelVideos, listChannelPlaylists, getChannelId } from '../lib/youtube';
import { getConfigValue } from '../lib/config';
import { getAuthenticatedClient } from '../lib/auth';
import { acquireLock, getLockPath } from '../lib/lock';
import { CACHE_DIR, debug } from '../lib/utils';
import { CompletionType, CompletionCache } from '../types';

const TTL: Record<CompletionType, number> = {
  'video-id': 5 * 60 * 1000,
  'playlist-id': 5 * 60 * 1000,
  'report-type': 60 * 60 * 1000,
};

// report-type completions are credential-scoped (not channel-specific)
const GLOBAL_CACHE_PATH = path.join(CACHE_DIR, 'completion_cache.json');

function getChannelCachePath(channelId: string): string {
  return path.join(CACHE_DIR, channelId, 'completion_cache.json');
}

async function loadCache(cachePath: string): Promise<CompletionCache> {
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

// channelId is optional: provided for per-channel caches (acquires lock),
// omitted for the global report-type cache (no lock needed).
async function saveCache(cachePath: string, cache: CompletionCache, channelId?: string): Promise<void> {
  let release: (() => Promise<void>) | null = null;

  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    if (channelId) {
      // Acquire lock with 2 second timeout (completion is fast)
      release = await acquireLock(getLockPath('completion', channelId), { timeout: 2000 });
    }
    await fs.writeFile(cachePath, JSON.stringify(cache), { mode: 0o600 });

    debug('Completion cache saved');
  } catch (err) {
    debug('Failed to save completion cache:', (err as Error).message);
  } finally {
    if (release) await release();
  }
}

const VALID_TYPES: CompletionType[] = ['video-id', 'playlist-id', 'report-type'];

async function completeCommand(options: { type: string }): Promise<void> {
  try {
    if (!VALID_TYPES.includes(options.type as CompletionType)) process.exit(0);
    const type = options.type as CompletionType;

    let items: Array<{ id: string; title: string }> | undefined;

    // Spinner for cold fetch - only show when running interactively (both stdout and stderr TTY)
    const isInteractive = Boolean(process.stdout.isTTY) && Boolean(process.stderr.isTTY);
    let spinner: ReturnType<typeof ora> | null = null;

    try {
      if (type === 'video-id' || type === 'playlist-id') {
        // Video/playlist completions are channel-specific — require configured channel
        const channel = await getConfigValue('default.channel');
        if (!channel) process.exit(0);

        const channelId = await getChannelId(channel);
        const cachePath = getChannelCachePath(channelId);
        const cache = await loadCache(cachePath);

        const entry = cache[type];
        if (entry && Date.now() - entry.fetchedAt < TTL[type]) {
          items = entry.items;
        } else {
          if (isInteractive) {
            spinner = ora('Fetching completion candidates...').start();
          }
          const raw = type === 'video-id'
            ? await getChannelVideos(channel, 50)
            : await listChannelPlaylists(channel, 50);
          items = raw
            .filter(v => v.id && v.title)
            .map(v => ({ id: v.id, title: v.title }));
          try {
            if (isInteractive && spinner) {
              spinner.succeed(`Fetched ${items.length} completion candidates`);
            }
          } catch {
            if (spinner) spinner.stop();
          }
          if (items.length > 0) {
            cache[type] = { items, fetchedAt: Date.now() };
            await saveCache(cachePath, cache, channelId);
          }
        }
      } else if (type === 'report-type') {
        // Report types are credential-scoped (same for any channel on this account)
        // No channel configuration required
        const cache = await loadCache(GLOBAL_CACHE_PATH);

        const entry = cache[type];
        if (entry && Date.now() - entry.fetchedAt < TTL[type]) {
          items = entry.items;
        } else {
          if (isInteractive) {
            spinner = ora('Fetching report types...').start();
          }
          const auth = await getAuthenticatedClient();
          const yt = google.youtubereporting({ version: 'v1', auth });
          const res = await yt.reportTypes.list({});
          items = (res.data.reportTypes || [])
            .filter(t => t.id && t.name)
            .map(t => ({ id: t.id!, title: t.name! }));
          try {
            if (isInteractive && spinner) {
              spinner.succeed(`Fetched ${items.length} report types`);
            }
          } catch {
            if (spinner) spinner.stop();
          }
          if (items.length > 0) {
            cache[type] = { items, fetchedAt: Date.now() };
            await saveCache(GLOBAL_CACHE_PATH, cache);
          }
        }
      }

      (items || []).forEach(item => console.log(`${item.id}\t${item.title}`));
    } finally {
      if (isInteractive && spinner) {
        spinner.stop();
      }
    }
  } catch {
    process.exit(0);
  }
}

export = completeCommand;
