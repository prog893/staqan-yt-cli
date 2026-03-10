import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getConfig, setConfigValue } from '../lib/config';
import { success, error, info, CONFIG_DIR } from '../lib/utils';
import { ConfigKey, CompletionCache } from '../types';
import { installCompletion, detectShell } from '../lib/completion';

async function invalidateChannelCache(): Promise<void> {
  const cachePath = path.join(CONFIG_DIR, 'completion-cache.json');
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    const cache: CompletionCache = JSON.parse(raw);
    for (const key of Object.keys(cache)) {
      if (key.startsWith('video-id:') || key.startsWith('playlist-id:')) {
        delete cache[key];
      }
    }
    await fs.writeFile(cachePath, JSON.stringify(cache));
  } catch {
    // Cache may not exist yet — ignore
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
      console.log(chalk.cyan('default.output:') + '   ' + (config.default?.output || chalk.dim('text')));
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
        console.log('  default.output   - Default output format (text or json)');
        process.exit(1);
      }

      // Validate key
      const validKeys: ConfigKey[] = ['default.channel', 'default.output'];
      if (!validKeys.includes(key as ConfigKey)) {
        error(`Invalid config key: ${key}`);
        console.log('');
        console.log('Available keys:');
        console.log('  default.channel  - Default channel handle or ID (e.g., @staqan)');
        console.log('  default.output   - Default output format (text or json)');
        process.exit(1);
      }

      await setConfigValue(key as ConfigKey, value);
      if (key === 'default.channel') {
        await invalidateChannelCache();
      }
      success(`Set ${chalk.cyan(key)} = ${chalk.yellow(value)}`);
      return;
    }

    // Handle 'get' action
    if (action === 'get') {
      if (!key) {
        error('Usage: staqan-yt config get <key>');
        process.exit(1);
      }

      const config = await getConfig();
      const [section, field] = key.split('.') as ['default', 'channel' | 'output'];
      const currentValue = config[section]?.[field];

      if (currentValue) {
        console.log(currentValue);
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
