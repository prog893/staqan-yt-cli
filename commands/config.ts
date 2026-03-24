import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getConfig, getConfigValue, setConfigValue, DEFAULT_LOCK_TIMEOUT_MS } from '../lib/config';
import { success, error, info, CACHE_DIR } from '../lib/utils';
import { ConfigKey } from '../types';
import { installCompletion, detectShell } from '../lib/completion';

async function invalidateChannelCache(): Promise<void> {
  // Per-channel completion caches (video-id, playlist-id) are channel-specific.
  // When the default channel changes, wipe them all so stale IDs aren't suggested.
  try {
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const cachePath = path.join(CACHE_DIR, entry.name, 'completion_cache.json');
        await fs.unlink(cachePath).catch(() => {});
      }
    }
  } catch {
    // cache/ may not exist yet — ignore
  }
}

interface ConfigOptions {
  show?: boolean;
  install?: boolean;
  print?: boolean;
}

/**
 * Config command handler
 * Supports: config set <key> <value>, config get <key>, config list, config completion <shell>
 */
async function configCommand(
  action?: string,
  key?: string,
  value?: string,
  options?: ConfigOptions
): Promise<void> {
  try {
    // Handle --show flag (list all settings)
    if (options?.show || action === 'list' || !action) {
      const config = await getConfig();
      console.log(chalk.bold('\nCurrent Configuration:'));
      console.log('');
      console.log(chalk.cyan('default.channel:') + '  ' + (config.default?.channel || chalk.dim('(not set)')));
      console.log(chalk.cyan('default.output:') + '   ' + (config.default?.output || chalk.dim('pretty')));
      // getConfigValue returns undefined when lock.timeout was never explicitly
      // stored, so we correctly show "(default)" only when the user hasn't set it.
      const explicitLockTimeout = await getConfigValue('lock.timeout');
      const lockTimeoutDisplay = explicitLockTimeout === undefined
        ? chalk.dim(`${DEFAULT_LOCK_TIMEOUT_MS}ms (default)`)
        : `${explicitLockTimeout}ms`;
      console.log(chalk.cyan('lock.timeout:') + '     ' + lockTimeoutDisplay);
      console.log('');
      return;
    }

    // Handle 'set' action
    if (action === 'set') {
      if (!key || !value) {
        error('Usage: staqan-yt config set <key> <value>');
        console.log('');
        console.log('Available keys:');
        console.log('  default.channel  - Default channel handle or ID (e.g., @staqan)');
        console.log('  default.output   - Default output format (json|table|text|pretty|csv)');
        console.log('  lock.timeout     - Lock acquisition timeout in ms (default: 60000)');
        process.exit(1);
      }

      // Validate key
      const validKeys: ConfigKey[] = ['default.channel', 'default.output', 'lock.timeout'];
      if (!validKeys.includes(key as ConfigKey)) {
        error(`Invalid config key: ${key}`);
        console.log('');
        console.log('Available keys:');
        console.log('  default.channel  - Default channel handle or ID (e.g., @staqan)');
        console.log('  default.output   - Default output format (json|table|text|pretty|csv)');
        console.log('  lock.timeout     - Lock acquisition timeout in ms (default: 60000)');
        process.exit(1);
      }

      await setConfigValue(key as ConfigKey, value);
      if (key === 'default.channel') {
        await invalidateChannelCache();
      }
      const displayValue = key === 'lock.timeout' ? `${value}ms` : value;
      success(`Set ${chalk.cyan(key)} = ${chalk.yellow(displayValue)}`);
      return;
    }

    // Handle 'get' action
    if (action === 'get') {
      if (!key) {
        error('Usage: staqan-yt config get <key>');
        process.exit(1);
      }

      const currentValue = await getConfigValue(key as ConfigKey);

      if (currentValue !== undefined) {
        console.log(key === 'lock.timeout' ? `${currentValue}ms` : currentValue);
      } else {
        info(`${key} is not set`);
      }
      return;
    }

    // Handle 'completion' action
    if (action === 'completion') {
      // Determine shell type
      let shell: 'bash' | 'zsh';
      if (key && ['bash', 'zsh'].includes(key)) {
        shell = key as 'bash' | 'zsh';
      } else if (key === 'auto' || !key) {
        const detected = detectShell();
        if (detected === 'auto') {
          error('Could not detect shell type. Please specify bash or zsh.');
          process.exit(1);
        }
        shell = detected;
        info(`Auto-detected shell: ${shell}`);
      } else {
        error(`Invalid shell type: ${key}`);
        console.log('');
        console.log('Usage: staqan-yt config completion <bash|zsh|auto> [--install|--print]');
        process.exit(1);
      }

      const install = options?.install || false;
      options?.print || false; // Reserved for future use

      try {
        await installCompletion(shell, !install);
      } catch (err) {
        error((err as Error).message);
        process.exit(1);
      }
      return;
    }

    // Invalid action
    error(`Unknown action: ${action}`);
    console.log('');
    console.log('Usage:');
    console.log('  staqan-yt config list              - Show all configuration');
    console.log('  staqan-yt config set <key> <value> - Set a configuration value');
    console.log('  staqan-yt config get <key>         - Get a configuration value');
    console.log('  staqan-yt config completion <bash|zsh|auto> [--install|--print]');
    process.exit(1);
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}

export = configCommand;
