import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getConfig, getConfigValue, setConfigValue, getOutputFormat, DEFAULT_LOCK_TIMEOUT_MS } from '../lib/config';
import { success, info, CACHE_DIR } from '../lib/utils';
import { formatData } from '../lib/formatters';
import { ConfigKey, CONFIG_KEYS, CONFIG_KEY_HELP, OutputFormat } from '../types';
import { installCompletion, detectShell } from '../lib/completion';

function availableConfigKeysHelp(): string {
  return 'Available keys:\n' + CONFIG_KEYS.map(k => `  ${k.padEnd(18)} - ${CONFIG_KEY_HELP[k]}`).join('\n');
}

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
  output?: OutputFormat;
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
  const outputFormat = await getOutputFormat(options?.output);

  // Handle --show flag (list all settings)
  if (options?.show || action === 'list' || !action) {
    const config = await getConfig();
    // getConfigValue returns undefined when lock.timeout was never explicitly
    // stored, so we correctly show "(default)" only when the user hasn't set it.
    const explicitLockTimeout = await getConfigValue('lock.timeout');

    if (outputFormat !== 'pretty') {
      console.log(formatData([
        { key: 'default.channel', value: config.default?.channel ?? null },
        { key: 'default.output', value: config.default?.output ?? 'pretty' },
        { key: 'lock.timeout', value: explicitLockTimeout !== undefined ? Number(explicitLockTimeout) : DEFAULT_LOCK_TIMEOUT_MS },
      ], outputFormat));
      return;
    }

    console.log(chalk.bold('\nCurrent Configuration:'));
    console.log('');
    console.log(chalk.cyan('default.channel:') + '  ' + (config.default?.channel || chalk.dim('(not set)')));
    console.log(chalk.cyan('default.output:') + '   ' + (config.default?.output || chalk.dim('pretty')));
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
      throw new Error(`Usage: staqan-yt config set <key> <value>\n${availableConfigKeysHelp()}`);
    }

    // Validate key
    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      throw new Error(`Invalid config key: ${key}\n${availableConfigKeysHelp()}`);
    }

    await setConfigValue(key as ConfigKey, value);
    if (key === 'default.channel') {
      await invalidateChannelCache();
    }
    if (outputFormat !== 'pretty') {
      console.log(formatData([{ key, value }], outputFormat));
    }
    const displayValue = key === 'lock.timeout' ? `${value}ms` : value;
    success(`Set ${chalk.cyan(key)} = ${chalk.yellow(displayValue)}`);
    return;
  }

  // Handle 'get' action
  if (action === 'get') {
    if (!key) {
      throw new Error('Usage: staqan-yt config get <key>');
    }

    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      throw new Error(`Invalid config key: ${key}\n${availableConfigKeysHelp()}`);
    }

    const currentValue = await getConfigValue(key as ConfigKey);

    // 'text' and 'pretty' keep the raw-value contract (`config get x` has
    // always printed just the value — scripts depend on it).
    if (outputFormat !== 'pretty' && outputFormat !== 'text') {
      console.log(formatData([{ key, value: currentValue ?? null }], outputFormat));
      return;
    }

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
        throw new Error('Could not detect shell type. Please specify bash or zsh.');
      }
      shell = detected;
      info(`Auto-detected shell: ${shell}`);
    } else {
      throw new Error(
        `Invalid shell type: ${key}\n` +
        'Usage: staqan-yt config completion <bash|zsh|auto> [--install|--print]'
      );
    }

    const install = options?.install || false;
    options?.print || false; // Reserved for future use

    await installCompletion(shell, !install);
    return;
  }

  // Invalid action
  throw new Error(
    `Unknown action: ${action}\n` +
    'Usage:\n' +
    '  staqan-yt config list              - Show all configuration\n' +
    '  staqan-yt config set <key> <value> - Set a configuration value\n' +
    '  staqan-yt config get <key>         - Get a configuration value\n' +
    '  staqan-yt config completion <bash|zsh|auto> [--install|--print]'
  );
}

export = configCommand;
