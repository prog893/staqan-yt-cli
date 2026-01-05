import chalk from 'chalk';
import { getConfig, setConfigValue } from '../lib/config';
import { success, error, info } from '../lib/utils';
import { ConfigKey } from '../types';

interface ConfigOptions {
  show?: boolean;
}

/**
 * Config command handler
 * Supports: config set <key> <value>, config get <key>, config list
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

    // Invalid action
    error(`Unknown action: ${action}`);
    console.log('');
    console.log('Usage:');
    console.log('  staqan-yt config list              - Show all configuration');
    console.log('  staqan-yt config set <key> <value> - Set a configuration value');
    console.log('  staqan-yt config get <key>         - Get a configuration value');
    process.exit(1);
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}

export = configCommand;
