import chalk from 'chalk';
import ora from 'ora';
import type { Ora } from 'ora';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';
import { ChannelHandle } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.staqan-yt-cli');
const CACHE_DIR = path.join(CONFIG_DIR, 'cache');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');

// Global verbose flag
let isVerboseEnabled = false;

// Global quiet flag
let isQuietEnabled = false;

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
 * Extract channel ID from various input formats
 */
function parseChannelHandle(input: string): ChannelHandle {
  // Remove @ if present
  if (input.startsWith('@')) {
    return { type: 'handle', value: input };
  }

  // Extract from URL
  const urlPatterns = [
    /youtube\.com\/@([^\/\?]+)/,
    /youtube\.com\/channel\/([^\/\?]+)/,
    /youtube\.com\/c\/([^\/\?]+)/,
    /youtube\.com\/user\/([^\/\?]+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      return { type: 'id', value: match[1] };
    }
  }

  // Assume it's a channel ID or handle
  return { type: 'id', value: input };
}

/**
 * Extract video ID from various input formats
 */
function parseVideoId(input: string): string {
  // Already a video ID
  if (input.length === 11 && !input.includes('/') && !input.includes('?')) {
    return input;
  }

  // Extract from URL
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\?\/]+)/,
    /youtube\.com\/embed\/([^&\?\/]+)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return input;
}

/**
 * Extract playlist ID from various input formats
 */
function parsePlaylistId(input: string): string {
  // Playlist IDs are longer and typically start with PL
  // If it looks like a raw playlist ID (no slashes or question marks), return as-is
  if (!input.includes('/') && !input.includes('?')) {
    return input;
  }

  // Extract from URL
  const patterns = [
    /(?:[?&]list=)([^&]+)/,
    /youtube\.com\/playlist\?list=([^&\?\/]+)/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return input;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Parse ISO 8601 duration (e.g., "PT15M40S") to seconds
 */
function parseDuration(duration: string): number {
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to timestamp (M:SS or H:MM:SS)
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Print success message (to stderr to avoid interfering with stdout piping)
 */
function success(message: string): void {
  if (!isQuietEnabled) {
    process.stderr.write(chalk.green('✓ ') + message + '\n');
  }
}

/**
 * Print error message
 */
function error(message: string): void {
  console.error(chalk.red('✗ ') + message);
}

/**
 * Print warning message
 */
function warning(message: string): void {
  console.warn(chalk.yellow('⚠ ') + message);
}

/**
 * Print info message (to stderr to avoid interfering with stdout piping)
 */
function info(message: string): void {
  if (!isQuietEnabled) {
    process.stderr.write(chalk.blue('ℹ ') + message + '\n');
  }
}

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Set verbose mode
 */
function setVerbose(enabled: boolean): void {
  isVerboseEnabled = enabled;
}

/**
 * Get verbose mode status
 */
function isVerbose(): boolean {
  return isVerboseEnabled;
}

/**
 * Set quiet mode
 */
function setQuiet(enabled: boolean): void {
  isQuietEnabled = enabled;
}

/**
 * Get quiet mode status
 */
function isQuiet(): boolean {
  return isQuietEnabled;
}

/**
 * Print debug/verbose message (only if verbose mode is enabled)
 */
function debug(message: string, data?: unknown): void {
  if (isVerboseEnabled) {
    console.log(chalk.gray('[DEBUG] ') + chalk.dim(message));
    if (data !== undefined) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}

/**
 * Print progress message to stderr (doesn't interfere with stdout piping)
 */
function progress(message: string): void {
  process.stderr.write(chalk.cyan('⏳ ') + message + '\n');
}

/**
 * Convert analytics data to CSV format
 */
function convertToCSV(headers: { name?: string | null }[], rows: unknown[][]): string {
  // Create CSV header
  const csvHeaders = headers.map(h => h.name || '').join(',');

  // Create CSV rows
  const csvRows = rows.map(row => {
    return row.map(cell => {
      // Escape cells containing commas or quotes
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',');
  }).join('\n');

  return `${csvHeaders}\n${csvRows}`;
}

/**
 * Chunk a date range into 90-day periods (YouTube Analytics API limit)
 */
function chunkDateRange(startDate: string, endDate: string): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let currentStart = start;

  while (currentStart < end) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 89); // 90 days (inclusive)

    if (currentEnd > end) {
      chunks.push({
        start: currentStart.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
      });
      break;
    } else {
      chunks.push({
        start: currentStart.toISOString().split('T')[0],
        end: currentEnd.toISOString().split('T')[0],
      });
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }
  }

  return chunks;
}

/**
 * Validate --privacy flag values before any API calls.
 * Exits with an error message if any value is not public/private/unlisted.
 *
 * Accepts string[] (not PrivacyStatus[]) because Commander.js parses option
 * values as raw strings before this validation runs. The call site's option
 * type is PrivacyStatus[], but at runtime the values are unvalidated strings
 * until this function confirms them.
 */
function parsePositiveInt(flag: string, opt: string | undefined, defaultValue: number): number {
  const n = opt ? parseInt(opt, 10) : defaultValue;
  if (isNaN(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
  return n;
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function validateDateOption(flag: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be in YYYY-MM-DD format (got: ${value})`);
  }
  // Catch invalid calendar dates like 2024-02-30.
  // Days-in-month check is tz-independent; UTC methods make that explicit.
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) {
    throw new Error(`${flag} is not a valid date: ${value}`);
  }
}

function validateDateRange(startDate: string, endDate: string): void {
  if (startDate > endDate) {
    throw new Error(`--start-date must be on or before --end-date (${startDate} > ${endDate})`);
  }
}

function validatePrivacyFilter(privacy: string[] | undefined): void {
  if (!privacy || privacy.length === 0) return;
  const valid = ['public', 'private', 'unlisted'];
  const invalid = privacy.filter(s => !valid.includes(s));
  if (invalid.length > 0) {
    throw new Error(`Invalid privacy value(s): ${invalid.join(', ')}. Valid values: public, private, unlisted`);
  }
}

/**
 * Run a throwing validator (or any void/value function) and catch-and-die on
 * failure: print the error message via `error()` and exit(1). This is the
 * caller side of the project's throw-and-catch helper contract — validators
 * throw, the command decides to exit via this wrapper. Keeps every command's
 * `try { validate() } catch (e) { error(...); process.exit(1); }` boilerplate
 * in one place.
 *
 * For async work wrapped in a spinner, prefer `withSpinner` (it owns its own
 * catch-and-die). Use `runOrExit` for the synchronous validation calls that
 * run at the top of a command before any spinner starts.
 */
function runOrExit<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    error((e as Error).message);
    process.exit(1);
  }
}

/**
 * Initialize a command: enable verbose mode if requested.
 * Call at the top of every command before any async work.
 */
function initCommand(options: { verbose?: boolean }): void {
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }
}

/**
 * Create an ora spinner, or a silent spinner in quiet mode.
 * Use this instead of calling ora() directly in commands.
 */
function createSpinner(message: string): Ora {
  if (isQuietEnabled) {
    const silentSpinner = {
      succeed: () => {},
      fail: () => {},
      info: () => {},
      warn: () => {},
      start: () => silentSpinner as unknown as Ora,
      stop: () => {},
      stopAndPersist: () => {},
      clear: () => {},
      render: () => {},
      frame: () => '',
      text: message,
      indent: 0,
      spinner: {},
      color: 'cyan',
      hideCursor: true,
    } as unknown as Ora;
    return silentSpinner;
  }
  return ora(message);
}

/**
 * Run an async function wrapped in an ora spinner.
 * On success the caller is responsible for calling spinner.succeed() inside fn.
 * On error: stops the spinner with failMessage, prints the error, and exits 1.
 *
 * When quiet mode is enabled, uses a silent spinner that does nothing.
 */
async function withSpinner<T>(
  message: string,
  failMessage: string,
  fn: (spinner: Ora) => Promise<T>
): Promise<T> {
  // In quiet mode, create a silent spinner
  if (isQuietEnabled) {
    const silentSpinner = {
      succeed: () => {}, // Do nothing
      fail: () => {}, // Do nothing
      info: () => {}, // Do nothing
      warn: () => {}, // Do nothing
      start: () => silentSpinner as unknown as Ora,
      stop: () => {},
      stopAndPersist: () => {},
      clear: () => {},
      render: () => {},
      frame: () => '',
      text: '',
      indent: 0,
      spinner: {},
      color: 'cyan',
      hideCursor: true,
    } as unknown as Ora;

    try {
      return await fn(silentSpinner);
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  }

  // Normal mode: use spinner
  const spinner = ora(message).start();
  try {
    return await fn(spinner);
  } catch (err) {
    spinner.fail(failMessage);
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

/**
 * Sleep for specified milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify a Google API error by quota type.
 *
 * Returns:
 *   'rpm'   — YouTube Reporting/Data API "Free requests per minute" limit hit.
 *             Retriable after the per-minute window resets (≈60s).
 *   'daily' — Daily quota exhausted. Not retriable; abort the run.
 *   null    — Some other error; let the caller decide what to do.
 *
 * YouTube's error message format (per API docs and observed in cron logs):
 *   "Quota exceeded for quota metric 'Free requests' and limit 'Free requests per minute'"
 *   "Quota exceeded for quota metric 'Free requests' and limit 'Free requests per day'"
 *
 * Both arrive as HTTP 429 with reason `rateLimitExceeded`, so status code alone
 * can't tell them apart — we have to inspect the message text.
 *
 * The googleapis library surfaces the API's `errors[].message` either in
 * `err.message` or nested in `err.response.data.error.errors[]`. We check both.
 */
function isRateLimitError(err: unknown): 'rpm' | 'daily' | null {
  if (!err || typeof err !== 'object') return null;

  const messages: string[] = [];

  // googleapis / GaxiosError: the API message is usually on err.message
  const topMessage = (err as { message?: unknown }).message;
  if (typeof topMessage === 'string') messages.push(topMessage);

  // Some errors nest the YouTube message under response.data.error.errors[].message
  const nested = (err as { response?: { data?: { error?: { errors?: Array<{ message?: unknown }>; message?: unknown } } } }).response?.data?.error;
  if (nested?.message && typeof nested.message === 'string') messages.push(nested.message);
  if (Array.isArray(nested?.errors)) {
    for (const e of nested.errors) {
      if (e && typeof e.message === 'string') messages.push(e.message);
    }
  }

  for (const msg of messages) {
    const lower = msg.toLowerCase();
    if (lower.includes('per day')) return 'daily';
    if (lower.includes('per minute') || lower.includes('per minute ')) return 'rpm';
  }
  return null;
}

/**
 * Extract the server's `Retry-After` value (in seconds) from a thrown API
 * error, if any. Supports both gaxios's Headers-like object (with `.get`)
 * and plain Node IncomingHttpHeaders (lowercase keys).
 *
 * YouTube may send this on 429 responses to suggest a longer wait than our
 * default exponential backoff. Per the HTTP spec it can be either a delta in
 * seconds or an HTTP-date; we only honor the numeric form.
 */
function getRetryAfterMs(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const response = (err as { response?: { headers?: unknown } }).response;
  const headers = response?.headers as unknown;
  if (!headers) return undefined;

  // gaxios Headers — has .get(name)
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const v = (headers as { get: (n: string) => string | null }).get('retry-after');
    if (v) {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n * 1000 : undefined;
    }
  }
  // Plain IncomingHttpHeaders — lowercase keys
  const raw = (headers as Record<string, unknown>)['retry-after'];
  if (typeof raw === 'string' || typeof raw === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n * 1000 : undefined;
  }
  return undefined;
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      // Check if it's a quota error
      const errorMessage = lastError.message || '';
      if (errorMessage.includes('quota') || errorMessage.includes('429')) {
        const delay = initialDelay * Math.pow(2, i);
        progress(`Quota limit hit, retrying in ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        // Not a quota error, throw immediately
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Retry a YouTube API call that may hit the per-minute (RPM) quota limit.
 *
 * On "Free requests per minute": backs off exponentially — 5s → 10s → 20s →
 * 40s → 80s, capped at `maxDelayMs` (default 90s) — and retries, up to
 * `maxRetries` times. Each retry emits a `progress()` line so the user (or
 * cron log) can see what's happening. Honors the server's Retry-After header
 * (via getRetryAfterMs) and waits the larger of (Retry-After, exponential),
 * but still capped by `maxDelayMs`.
 *
 * On "Free requests per day" (or any longer-window quota — week / month):
 * throws immediately with a clear message — no amount of waiting will
 * recover within the same window, so retrying wastes time and hides the
 * real problem from the operator.
 *
 * On any other error: re-throws as-is.
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 5_000;
  const maxDelayMs = opts.maxDelayMs ?? 90_000;
  const label = opts.label ?? 'API call';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const kind = isRateLimitError(err);
      if (kind === 'daily') {
        throw new Error(
          `Daily YouTube API quota exhausted while running ${label}. ` +
          `Aborting — wait until 00:00 PT (quota reset) or request a quota increase. ` +
          `Original error: ${(err as Error).message}`
        );
      }
      if (kind === 'rpm' && attempt < maxRetries) {
        const expMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
        // Honor server's Retry-After when it's larger than our exponential wait.
        const serverMs = getRetryAfterMs(err);
        const waitMs = serverMs !== undefined
          ? Math.min(Math.max(serverMs, expMs), maxDelayMs)
          : expMs;
        const waitSec = Math.round(waitMs / 1000);
        const source = serverMs !== undefined && serverMs > expMs ? ' (server Retry-After)' : '';
        progress(`RPM quota hit on ${label} (attempt ${attempt}/${maxRetries}), backing off ${waitSec}s${source} before retry...`);
        await sleep(waitMs);
        continue;
      }
      // Not a retriable rate-limit error (or out of attempts) — bubble up.
      throw err;
    }
  }
  // Should be unreachable, but keep typescript happy.
  throw lastError instanceof Error ? lastError : new Error(`Max RPM retries exceeded for ${label}`);
}

/**
 * Get the user's local timezone
 * Returns the IANA timezone identifier (e.g., 'America/New_York', 'Asia/Tokyo')
 */
function getLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback to UTC if timezone detection fails
    return 'UTC';
  }
}

/**
 * Format a date with timezone information
 * Returns both ISO string and localized string with timezone
 */
function formatTimestampWithTimezone(dateInput: string | Date): {
  iso: string;
  local: string;
  timezone: string;
} {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const timezone = getLocalTimeZone();

  return {
    iso: date.toISOString(),
    local: date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    timezone,
  };
}

export {
  initCommand,
  withSpinner,
  createSpinner,
  CONFIG_DIR,
  CACHE_DIR,
  CREDENTIALS_PATH,
  TOKEN_PATH,
  ensureConfigDir,
  parseChannelHandle,
  parseVideoId,
  parsePlaylistId,
  formatDate,
  formatNumber,
  parseDuration,
  formatTimestamp,
  success,
  error,
  warning,
  getLocalTimeZone,
  formatTimestampWithTimezone,
  info,
  confirm,
  setVerbose,
  isVerbose,
  setQuiet,
  isQuiet,
  debug,
  progress,
  convertToCSV,
  chunkDateRange,
  sleep,
  retryWithBackoff,
  isRateLimitError,
  getRetryAfterMs,
  withRateLimitRetry,
  parsePositiveInt,
  toLocalYmd,
  validateDateOption,
  validateDateRange,
  validatePrivacyFilter,
  runOrExit,
};
