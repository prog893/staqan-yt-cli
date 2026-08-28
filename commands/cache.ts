import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CACHE_DIR, success, info, initCommand, confirm } from '../lib/utils';

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

    // Anything that stopped a file being removed. This command's entire output
    // is a claim about work done, so a failure must not be folded into the
    // count. A swallowed EACCES used to print "Nothing to clean" with exit 0
    // while every file was still on disk.
    const failures: string[] = [];

    // Per-channel completion caches: cache/{channelId}/completion_cache.json
    try {
      const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          targets.push(path.join(CACHE_DIR, entry.name, 'completion_cache.json'));
        }
      }
    } catch (err) {
      // ENOENT means cache/ was never created, so there is nothing per-channel
      // to enumerate. Any other error means the per-channel caches may exist
      // and we cannot see them, so we still clean the global targets below but
      // must not claim the cache is now empty.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        failures.push(`${CACHE_DIR}: cannot list per-channel caches: ${(err as Error).message}`);
      }
    }

    let removed = 0;
    for (const target of targets) {
      try {
        await fs.unlink(target);
        removed++;
      } catch (err) {
        // Already gone is the outcome we wanted; it just does not count as
        // work done. Anything else leaves the file in place.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        failures.push(`${target}: ${(err as Error).message}`);
      }
    }

    if (failures.length > 0) {
      if (removed > 0) {
        info(`Cleared ${removed} cache file(s) before failing`);
      }
      throw new Error(
        `Could not clear ${failures.length} cache location(s):\n` +
        failures.map(f => `  ${f}`).join('\n') +
        `\nFix the permissions on the paths above and run again.`
      );
    }

    if (removed === 0) {
      info('Nothing to clean');
    } else {
      success(`Cleared ${removed} cache file(s)`);
    }
    return;
  }

  throw new Error(
    `Unknown action: ${action}\n` +
    'Available actions:\n' +
    '  clean   Remove all cached data'
  );
}

export = cacheCommand;
