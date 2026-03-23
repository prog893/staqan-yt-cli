import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CACHE_DIR, error, success, info, initCommand, confirm } from '../lib/utils';

interface CacheOptions {
  yes?: boolean;
  verbose?: boolean;
}

/**
 * Cache command handler
 * Supports: cache clean
 */
async function cacheCommand(action?: string, options: CacheOptions = {}): Promise<void> {
  initCommand(options);

  if (!action || action === 'help') {
    console.log('');
    console.log(chalk.bold('Usage:'));
    console.log('  staqan-yt cache clean   Remove all locally cached data (completions, handle map)');
    console.log('');
    console.log(chalk.bold('Options:'));
    console.log('  -y, --yes   Skip confirmation prompt');
    console.log('');
    console.log(chalk.gray('Note: Report archive data is not affected. Use export-reports/import-reports'));
    console.log(chalk.gray('      for report data management.'));
    console.log('');
    return;
  }

  if (action === 'clean') {
    if (!options.yes) {
      const confirmed = await confirm('Remove all cached data (completions, handle map)?');
      if (!confirmed) {
        info('Cancelled');
        return;
      }
    }

    // Files to delete
    const targets = [
      // Global completion cache (report-type completions)
      path.join(CACHE_DIR, 'completion_cache.json'),
      // Handle → channel ID map
      path.join(CACHE_DIR, 'handle-to-channel-id.json'),
    ];

    // Per-channel completion caches: cache/{channelId}/completion_cache.json
    try {
      const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          targets.push(path.join(CACHE_DIR, entry.name, 'completion_cache.json'));
        }
      }
    } catch {
      // cache/ may not exist yet — nothing to clean
    }

    let removed = 0;
    for (const target of targets) {
      try {
        await fs.unlink(target);
        removed++;
      } catch {
        // File doesn't exist — skip silently
      }
    }

    if (removed === 0) {
      info('Nothing to clean');
    } else {
      success(`Cleared ${removed} cache file(s)`);
    }
    return;
  }

  error(`Unknown action: ${action}`);
  console.log('');
  console.log('Available actions:');
  console.log('  clean   Remove all cached data');
  process.exit(1);
}

export = cacheCommand;
