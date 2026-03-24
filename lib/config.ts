import { promises as fs } from 'fs';
import path from 'path';
import { Config, ConfigKey, OutputFormat } from '../types';
import { CONFIG_DIR, warning } from './utils';

const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * Valid output formats
 */
export const VALID_OUTPUT_FORMATS: OutputFormat[] = ['json', 'table', 'text', 'pretty', 'csv'];

/**
 * Default lock acquisition timeout (ms)
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 60000;

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Config = {
  cache: {
    enabled: true,
    verifyOnLoad: false,
  },
  default: {
    channel: undefined,
    output: 'pretty',
  },
  lock: {
    timeout: DEFAULT_LOCK_TIMEOUT_MS,
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
 * Load raw configuration from file without merging defaults.
 * Returns null if the file doesn't exist or is invalid.
 */
async function loadRawConfig(): Promise<Config | null> {
  try {
    await ensureConfigDir();
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data) as Config;
  } catch {
    return null;
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
      cache: {
        ...DEFAULT_CONFIG.cache,
        ...config.cache,
      },
      default: {
        ...DEFAULT_CONFIG.default,
        ...config.default,
      },
      lock: {
        ...DEFAULT_CONFIG.lock,
        ...config.lock,
      },
    };
  } catch {
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

  // lock.timeout: validate and store as a number
  if (key === 'lock.timeout') {
    const ms = parseInt(value, 10);
    if (isNaN(ms) || ms <= 0) {
      throw new Error(`Invalid lock timeout: ${value}. Must be a positive integer (milliseconds).`);
    }
    config.lock!.timeout = ms;
    await saveConfig(config);
    return;
  }

  const [section, field] = key.split('.') as ['default', 'channel' | 'output'];

  if (!config[section]) {
    config[section] = {};
  }

  // Validate output format
  if (field === 'output' && !VALID_OUTPUT_FORMATS.includes(value as OutputFormat)) {
    throw new Error(`Invalid output format: ${value}. Must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}`);
  }

  config[section][field] = value as never;
  await saveConfig(config);
}

/**
 * Get the lock acquisition timeout in milliseconds.
 * Priority: STAQAN_YT_LOCK_TIMEOUT_MS env var > config lock.timeout > 60000ms default
 */
export async function getLockTimeout(): Promise<number> {
  const envVal = process.env.STAQAN_YT_LOCK_TIMEOUT_MS;
  if (envVal !== undefined) {
    const ms = parseInt(envVal, 10);
    if (!isNaN(ms) && ms > 0) return ms;
    warning(`Invalid STAQAN_YT_LOCK_TIMEOUT_MS value "${envVal}" — must be a positive integer. Using config/default instead.`);
  }

  const config = await loadConfig();
  return config.lock?.timeout ?? DEFAULT_LOCK_TIMEOUT_MS;
}

/**
 * Get a configuration value by key path (e.g., "default.channel")
 * Returns undefined if not set
 */
export async function getConfigValue(key: ConfigKey): Promise<string | undefined> {
  const config = await loadConfig();

  if (key === 'lock.timeout') {
    const raw = await loadRawConfig();
    const explicit = raw?.lock?.timeout;
    if (explicit === undefined) return undefined;
    return String(config.lock?.timeout ?? DEFAULT_LOCK_TIMEOUT_MS);
  }

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
 * Resolve the channel to use for a command.
 * Uses `provided` if given, otherwise falls back to `default.channel` from config.
 * Throws if neither is available — callers should let this propagate to withSpinner.
 */
export async function requireChannel(provided?: string): Promise<string> {
  const channel = provided || await getConfigValue('default.channel');
  if (!channel) {
    throw new Error('No channel specified. Please provide a channel handle or set a default: staqan-yt config set default.channel @yourChannel');
  }
  return channel;
}

/**
 * Get the output format to use
 * CLI flag takes precedence over config
 */
export async function getOutputFormat(formatFlag?: OutputFormat): Promise<OutputFormat> {
  // If flag is explicitly set, use it
  if (formatFlag !== undefined) {
    return formatFlag;
  }

  // Otherwise, check config default
  const defaultOutput = await getConfigValue('default.output');
  return (defaultOutput as OutputFormat) || 'pretty';
}
