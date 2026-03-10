/**
 * Internal completion helper for tab completion
 * Called by shell scripts as: staqan-yt __complete --type <type>
 * Outputs one "id\ttitle" per line, silent on any error.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { google } from 'googleapis';
import { getChannelVideos, listChannelPlaylists } from '../lib/youtube';
import { getConfigValue } from '../lib/config';
import { getAuthenticatedClient } from '../lib/auth';
import { CONFIG_DIR, ensureConfigDir } from '../lib/utils';
import { CompletionType, CompletionCache } from '../types';

const CACHE_PATH = path.join(CONFIG_DIR, 'completion-cache.json');

const TTL: Record<CompletionType, number> = {
  'video-id': 5 * 60 * 1000,
  'playlist-id': 5 * 60 * 1000,
  'report-type': 60 * 60 * 1000,
};

async function loadCache(): Promise<CompletionCache> {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

async function saveCache(cache: CompletionCache): Promise<void> {
  try {
    await ensureConfigDir();
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache));
  } catch {
    // silent
  }
}

const VALID_TYPES: CompletionType[] = ['video-id', 'playlist-id', 'report-type'];

async function completeCommand(options: { type: string }): Promise<void> {
  try {
    if (!VALID_TYPES.includes(options.type as CompletionType)) process.exit(0);
    const type = options.type as CompletionType;
    const cache = await loadCache();
    let cacheKey: string = type;

    let items: Array<{ id: string; title: string }> | undefined;

    if (type === 'video-id' || type === 'playlist-id') {
      const channel = await getConfigValue('default.channel');
      if (!channel) process.exit(0);
      cacheKey = `${type}:${channel}`;
      const entry = cache[cacheKey];
      if (entry && Date.now() - entry.fetchedAt < TTL[type]) {
        items = entry.items;
      } else {
        // 50 is a practical cap: enough for meaningful completion without
        // hammering the API or making tab press noticeably slow.
        const raw = type === 'video-id'
          ? await getChannelVideos(channel, 50)
          : await listChannelPlaylists(channel, 50);
        items = raw
          .filter(v => v.id && v.title)
          .map(v => ({ id: v.id, title: v.title }));
        if (items.length > 0) {
          cache[cacheKey] = { items, fetchedAt: Date.now() };
          await saveCache(cache);
        }
      }
    } else if (type === 'report-type') {
      const entry = cache[cacheKey];
      if (entry && Date.now() - entry.fetchedAt < TTL[type]) {
        items = entry.items;
      } else {
        const auth = await getAuthenticatedClient();
        const yt = google.youtubereporting({ version: 'v1', auth });
        const res = await yt.reportTypes.list({});
        items = (res.data.reportTypes || [])
          .filter(t => t.id && t.name)
          .map(t => ({ id: t.id!, title: t.name! }));
        if (items.length > 0) {
          cache[cacheKey] = { items, fetchedAt: Date.now() };
          await saveCache(cache);
        }
      }
    }

    (items || []).forEach(item => console.log(`${item.id}\t${item.title}`));
  } catch {
    process.exit(0);
  }
}

export = completeCommand;
