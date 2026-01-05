import { promises as fs } from 'fs';
import path from 'path';
import { Config, ConfigKey } from '../types';
import { CONFIG_DIR } from './utils';

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  default: {
    channel: undefined,
    output: 'text',
  },
};

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file
 * Returns default config if file doesn't exist
 */
export async function loadConfig(): Promise<Config> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data) as Config;

    // Merge with defaults to ensure all keys exist
    return {
      default: {
        ...DEFAULT_CONFIG.default,
        ...config.default,
      },
    };
  } catch (err) {
    // File doesn't exist or is invalid - return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Set a configuration value by key path (e.g., "default.channel")
 */
export async function setConfigValue(key: ConfigKey, value: string): Promise<void> {
  const config = await loadConfig();
  const [section, field] = key.split('.') as ['default', 'channel' | 'output'];

  if (!config[section]) {
    config[section] = {};
  }

  // Validate output format
  if (field === 'output' && value !== 'text' && value !== 'json') {
    throw new Error(`Invalid output format: ${value}. Must be "text" or "json"`);
  }

  config[section][field] = value as string & ('text' | 'json');
  await saveConfig(config);
}

/**
 * Get a configuration value by key path (e.g., "default.channel")
 * Returns undefined if not set
 */
export async function getConfigValue(key: ConfigKey): Promise<string | undefined> {
  const config = await loadConfig();
  const [section, field] = key.split('.') as ['default', 'channel' | 'output'];

  return config[section]?.[field];
}

/**
 * Get entire configuration
 */
export async function getConfig(): Promise<Config> {
  return await loadConfig();
}

/**
 * Determine if JSON output should be used
 * CLI flag takes precedence over config
 */
export async function shouldUseJson(jsonFlag?: boolean): Promise<boolean> {
  // If flag is explicitly set, use it
  if (jsonFlag !== undefined) {
    return jsonFlag;
  }

  // Otherwise, check config default
  const defaultOutput = await getConfigValue('default.output');
  return defaultOutput === 'json';
}
