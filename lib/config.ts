import { promises as fs } from 'fs';
import path from 'path';
import { Config, ConfigKey, OutputFormat } from '../types';
import { CONFIG_DIR, warning, loadJsonIfPresent } from './utils';

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
  await ensureConfigDir();
  // Damaged config throws rather than reading as "no config set" (#195). That
  // silent fallback was the worst of the six: a stray comma from a hand-edit
  // made default.channel and default.output stop applying, with the CLI
  // behaving exactly as though they had never been set.
  return loadJsonIfPresent<Config>(CONFIG_PATH, 'config');
}

/**
 * Load configuration from file
 * Returns default config if file doesn't exist
 */
export async function loadConfig(): Promise<Config> {
  await ensureConfigDir();

  // Throws on a damaged config rather than returning defaults (#195). This is
  // the function that decides what every command actually does, so the old
  // catch-all was the most consequential of the six: a malformed config.json
  // made default.channel and default.output stop applying with no message,
  // which looks exactly like never having set them.
  const config = await loadJsonIfPresent<Config>(CONFIG_PATH, 'config');
  if (!config) return { ...DEFAULT_CONFIG };

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
 * Returns undefined if not set (i.e. only the built-in default would apply).
 *
 * For lock.timeout we read the raw (un-merged) config so that a value that
 * was never explicitly stored is reported as "not set" rather than the
 * DEFAULT_LOCK_TIMEOUT_MS that loadConfig() injects via DEFAULT_CONFIG.
 */
export async function getConfigValue(key: ConfigKey): Promise<string | undefined> {
  if (key === 'lock.timeout') {
    const raw = await loadRawConfig();
    const explicit = raw?.lock?.timeout;
    if (explicit === undefined) return undefined;
    // lock.timeout is stored as a number but getConfigValue's contract is
    // string | undefined (consistent with all other keys).  Callers that need
    // the numeric value should use getLockTimeout() instead.
    return String(explicit);
  }

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
  // If flag is explicitly set, validate and use it. Commander passes the raw
  // string through, so without this check an unknown value (--output yaml)
  // would silently fall through to each command's default/pretty branch.
  if (formatFlag !== undefined) {
    if (!VALID_OUTPUT_FORMATS.includes(formatFlag)) {
      throw new Error(`Invalid output format: ${formatFlag}. Must be one of: ${VALID_OUTPUT_FORMATS.join(', ')}`);
    }
    return formatFlag;
  }

  // Otherwise, check config default
  const defaultOutput = await getConfigValue('default.output');
  return (defaultOutput as OutputFormat) || 'pretty';
}
