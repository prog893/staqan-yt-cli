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
 * Read and parse a JSON file that is allowed not to exist.
 *
 * Returns `null` only when the file is absent (`ENOENT`). A permissions error,
 * an I/O error or a JSON syntax error all throw instead: the file is there and
 * unusable, which is not the same as never having been written. Callers read
 * `null` as "not configured yet", so the two must not collapse into one answer.
 *
 * `label` names the file in the thrown message, since the caller knows what
 * the file is for and this helper does not.
 */
export async function loadJsonIfPresent<T>(filePath: string, label: string): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(
      `Cannot read ${label} (${filePath}): ${(err as Error).message}. ` +
      `Check that the path is a readable file and fix its permissions.`
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `${label} (${filePath}) is not valid JSON: ${(err as Error).message}. ` +
      `Fix the file, or delete it to start over.`
    );
  }
}

/**
 * Classify channel input (handle, ID, or URL) as a handle or a channel ID.
 * Throws on legacy /c/ and /user/ URLs — their path segment is neither a
 * handle nor a channel ID, so no downstream lookup could succeed (issue #123).
 */
function parseChannelHandle(input: string): ChannelHandle {
  if (input.startsWith('@')) {
    return { type: 'handle', value: input };
  }

  // @-handle URLs are handles, not IDs. The previous code returned these as
  // type 'id' (with the @ stripped), which sent a bare handle into
  // channels.list({ id }) and produced silent empty results (issue #123).
  const handleUrl = input.match(/youtube\.com\/@([^/?]+)/);
  if (handleUrl) {
    return { type: 'handle', value: `@${handleUrl[1]}` };
  }

  const channelUrl = input.match(/youtube\.com\/channel\/([^/?]+)/);
  if (channelUrl) {
    return { type: 'id', value: channelUrl[1] };
  }

  const legacyUrl = input.match(/youtube\.com\/(?:c|user)\/([^/?]+)/);
  if (legacyUrl) {
    throw new Error(
      `Legacy channel URL not supported: ${input}\n` +
      `The /c/ and /user/ path segments are not channel IDs. ` +
      `Pass the channel's @handle or its UC… channel ID instead.`
    );
  }

  // Assume it's a raw channel ID
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
  // Prompt goes to stderr so machine-readable stdout (--output json/csv/…)
  // stays clean when the caller pipes it.
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
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
 * Parse a numeric flag value, falling back to a default when absent.
 * Throws if the value is not a positive integer.
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

/** Local-timezone YYYY-MM-DD for `n` days before today (CLI date-range defaults). */
function daysAgoYmd(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return toLocalYmd(date);
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

/**
 * Validate --privacy flag values before any API calls.
 * Throws if any value is not public/private/unlisted.
 *
 * Accepts string[] (not PrivacyStatus[]) because Commander.js parses option
 * values as raw strings before this validation runs. The call site's option
 * type is PrivacyStatus[], but at runtime the values are unvalidated strings
 * until this function confirms them.
 */
function validatePrivacyFilter(privacy: string[] | undefined): void {
  if (!privacy || privacy.length === 0) return;
  const valid = ['public', 'private', 'unlisted'];
  const invalid = privacy.filter(s => !valid.includes(s));
  if (invalid.length > 0) {
    throw new Error(`Invalid privacy value(s): ${invalid.join(', ')}. Valid values: public, private, unlisted`);
  }
}

/**
 * Run a throwing validator (or any void/value function) and on failure:
 * print the error message via `error()` and re-throw. This is the caller
 * side of the project's throw-and-catch helper contract — validators
 * throw, the command catches via this wrapper, formats the error, then
 * propagates it so a single CLI top-level catch (in `withHelpWrapper`)
 * can decide to exit. Keeps every command's
 * `try { validate() } catch (e) { error(...); process.exit(1); }` boilerplate
 * in one place.
 *
 * For async work wrapped in a spinner, prefer `withSpinner` (it owns its own
 * catch-and-rethrow). Use `runOrExit` for the synchronous validation calls
 * that run at the top of a command before any spinner starts.
 *
 * Note: this used to call `process.exit(1)` directly (issue #110). That made
 * it impossible to use the helpers from any context that must survive an
 * error path (e.g. an MCP server running multiple tools in one process).
 * Throwing is strictly safer and the CLI top-level handler keeps exit
 * semantics unchanged.
 */
function runOrExit<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const err = e as Error;
    error(err.message);
    throw markFormatted(err);
  }
}

/**
 * Wrap an error to signal "already printed to the user by a helper layer".
 * The CLI top-level catch in `withHelpWrapper` checks for this marker and
 * skips re-printing. The original error is preserved on `cause` (and the
 * marker itself chains the same message so the surface behavior is
 * unchanged for callers that don't care).
 */
function markFormatted(original: Error): Error {
  const marked = new Error(original.message);
  marked.name = original.name || 'Error';
  (marked as Error & { cause?: unknown }).cause = original;
  (marked as Error & { __helperFormatted?: boolean }).__helperFormatted = true;
  return marked;
}

/**
 * True if `err` was already printed by a helper layer (`runOrExit` or
 * `withSpinner`). The CLI top-level catch uses this to avoid double-printing.
 */
export function isHelperFormattedError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { __helperFormatted?: boolean }).__helperFormatted === true;
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
 * On error: stops the spinner with failMessage, prints the error, and re-throws
 * so a single CLI top-level catch (in `withHelpWrapper`) can exit 1.
 *
 * When quiet mode is enabled, uses a silent spinner that does nothing.
 *
 * Note: this used to call `process.exit(1)` directly (issue #110). That
 * killed the entire process — including any long-running caller such as the
 * MCP server. Throwing lets the caller decide whether to exit.
 */
async function withSpinner<T>(
  message: string,
  failMessage: string,
  fn: (spinner: Ora) => Promise<T>
): Promise<T> {
  // createSpinner returns a silent no-op spinner in quiet mode, so a single
  // code path covers both modes (previously the silent-spinner literal was
  // duplicated here).
  const spinner = createSpinner(message).start();
  try {
    return await fn(spinner);
  } catch (err) {
    spinner.fail(failMessage);
    if (!isQuietEnabled) {
      console.log('');
    }
    // Mirror the CLI top-level guard: if a nested helper already printed
    // this message and marked it, don't print it again here. Prevents
    // double-output for chains like runOrExit → withSpinner (CodeRabbit #121).
    if (!isHelperFormattedError(err)) {
      error((err as Error).message);
    }
    throw markFormatted(err as Error);
  }
}

/**
 * Write machine-readable output to stdout and wait until it has been handed
 * to the OS.
 *
 * `console.log` does not wait. When stdout is a pipe the kernel buffer is
 * 64KB, so a larger payload is written in chunks and the remainder is queued
 * inside the stream. If the process ends before that queue drains, the tail is
 * silently dropped: the consumer sees output cut mid-token and the command
 * still exits 0. For JSON that means unparseable output, and for any format it
 * means a downstream aggregation is wrong rather than merely short (#161).
 *
 * The write callback fires only once the chunk has been flushed, so awaiting
 * it is what makes the output whole. Use this for anything a script consumes;
 * `console.log` remains fine for human-facing lines, which are short.
 */
function writeStdout(data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(data, (err) => {
      if (!err) return resolve();
      // EPIPE means the consumer closed early, as `| head` does. That is the
      // consumer's choice, not a failure of this command.
      if ((err as NodeJS.ErrnoException).code === 'EPIPE') return resolve();
      reject(err);
    });
  });
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
/**
 * How a failed API call should be retried.
 *
 *  - `daily`     quota resets at 00:00 PT. Waiting is measured in hours, so
 *                the caller aborts rather than sleeping.
 *  - `rpm`       per-minute quota. Clears within a minute.
 *  - `qps`       per-second or per-user rate limit. Clears almost immediately,
 *                so it warrants a much shorter backoff than `rpm`.
 *  - `transient` server-side 5xx or a network blip. Nothing is wrong with the
 *                request, so the same call is expected to succeed on retry.
 */
type RetryKind = 'daily' | 'rpm' | 'qps' | 'transient';

/** Network-level failures that are worth retrying unchanged. */
const RETRIABLE_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'EPIPE',
]);

/** HTTP statuses where the server is asking to be tried again. */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504, 408]);

/**
 * A Retry-After at or above this is treated as a closed quota window rather
 * than a transient hiccup, and aborts instead of being clamped and retried.
 * Matches the threshold `downloadReport` has always used.
 */
const LONG_RETRY_AFTER_MS = 30 * 60 * 1000;

/** Pull the HTTP status off the various shapes an error can arrive in. */
function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as {
    status?: unknown; code?: unknown;
    response?: { status?: unknown };
    statusCode?: unknown;
  };
  for (const candidate of [e.status, e.response?.status, e.statusCode, e.code]) {
    const n = typeof candidate === 'string' ? Number(candidate) : candidate;
    if (typeof n === 'number' && Number.isFinite(n) && n >= 100 && n < 600) return n;
  }
  return undefined;
}

/** googleapis puts a machine-readable `reason` on each nested error entry. */
function getErrorReasons(err: unknown): string[] {
  if (!err || typeof err !== 'object') return [];
  const nested = (err as {
    response?: { data?: { error?: { errors?: Array<{ reason?: unknown }> } } };
  }).response?.data?.error;
  if (!Array.isArray(nested?.errors)) return [];
  return nested.errors
    .map((e) => (e && typeof e.reason === 'string' ? e.reason : ''))
    .filter(Boolean);
}

/** Collect every message string an API error might carry. */
function collectErrorMessages(err: unknown): string[] {
  if (!err || typeof err !== 'object') return [];
  const messages: string[] = [];
  const topMessage = (err as { message?: unknown }).message;
  if (typeof topMessage === 'string') messages.push(topMessage);
  const nested = (err as {
    response?: { data?: { error?: { errors?: Array<{ message?: unknown }>; message?: unknown } } };
  }).response?.data?.error;
  if (nested?.message && typeof nested.message === 'string') messages.push(nested.message);
  if (Array.isArray(nested?.errors)) {
    for (const e of nested.errors) {
      if (e && typeof e.message === 'string') messages.push(e.message);
    }
  }
  return messages;
}

/**
 * Classify a failed API call for retry purposes.
 *
 * Message text alone is not enough. It misses server-side 5xx entirely, which
 * is what dropped a report download mid-archive-refresh, and it misses the
 * per-second limit that googleapis reports as `userRateLimitExceeded` with no
 * "per second" wording. Status codes and googleapis `reason` fields are
 * checked alongside the text.
 *
 * Quota wording is checked before status, because a 403 carrying "per day"
 * must abort rather than being retried as a generic rate limit.
 */
function classifyRetryableError(err: unknown): RetryKind | null {
  if (!err || typeof err !== 'object') return null;

  const messages = collectErrorMessages(err).map((m) => m.toLowerCase());
  for (const msg of messages) {
    if (msg.includes('per day')) return 'daily';
    if (msg.includes('per minute')) return 'rpm';
    if (msg.includes('per second')) return 'qps';
  }

  const reasons = getErrorReasons(err);
  // quotaExceeded without "per minute"/"per second" wording is the daily cap.
  if (reasons.includes('quotaExceeded')) return 'daily';
  if (reasons.includes('userRateLimitExceeded') || reasons.includes('rateLimitExceeded')) return 'qps';
  if (reasons.includes('backendError') || reasons.includes('internalError')) return 'transient';

  const code = (err as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && RETRIABLE_NETWORK_CODES.has(code)) return 'transient';

  const status = getErrorStatus(err);
  if (status === 429) return 'rpm';
  if (status !== undefined && TRANSIENT_STATUSES.has(status)) return 'transient';

  return null;
}

/**
 * Backoff policy per failure kind. `qps` clears in about a second, so starting
 * at 5s like `rpm` would waste most of the wait.
 */
function retryPolicyFor(kind: RetryKind): { baseDelayMs: number; maxDelayMs: number; maxAttempts: number } {
  switch (kind) {
    case 'qps': return { baseDelayMs: 1_000, maxDelayMs: 15_000, maxAttempts: 6 };
    case 'rpm': return { baseDelayMs: 5_000, maxDelayMs: 90_000, maxAttempts: 5 };
    case 'transient': return { baseDelayMs: 2_000, maxDelayMs: 60_000, maxAttempts: 5 };
    case 'daily': return { baseDelayMs: 0, maxDelayMs: 0, maxAttempts: 1 };
  }
}

function isRateLimitError(err: unknown): 'rpm' | 'daily' | null {
  // Delegates the error-shape walk to collectErrorMessages. Keeping a second
  // copy here meant both had to be updated together whenever googleapis
  // changed how it nests messages.
  for (const msg of collectErrorMessages(err)) {
    const lower = msg.toLowerCase();
    if (lower.includes('per day')) return 'daily';
    if (lower.includes('per minute')) return 'rpm';
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
 * Retry a YouTube API call that failed for a reason worth retrying.
 *
 * The failure is classified by `classifyRetryableError` and each kind gets the
 * backoff suited to how quickly it clears (see `retryPolicyFor`):
 *
 *  - `qps` and `rpm`: exponential backoff, honoring the server's Retry-After
 *    when it asks for longer than our own wait.
 *  - `transient`: same treatment, since a 5xx or a dropped socket says nothing
 *    is wrong with the request itself.
 *  - `daily`: throws immediately. The quota resets at 00:00 PT, so no amount
 *    of waiting recovers within the run and retrying only hides the problem.
 *
 * A Retry-After of 30 minutes or more also throws rather than being clamped.
 * That length means a closed quota window, not a hiccup, and retrying under a
 * clamped delay would burn every attempt against a window that is still shut.
 * `downloadReport` has always applied this rule; both paths now agree.
 *
 * Each retry emits a `progress()` line so the operator (or a cron log) can see
 * the wait rather than watching an apparently hung command.
 *
 * On any other error: re-throws as-is.
 *
 * `maxAttempts` counts total attempts including the first, not retries after
 * it. Naming it `maxRetries` previously made `3` look like four calls when it
 * meant three. No caller overrides it; the per-kind policy applies by default.
 */
async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string } = {}
): Promise<T> {
  const label = opts.label ?? 'API call';
  // An explicit override applies to every kind; otherwise each kind uses the
  // policy suited to how quickly that condition clears.
  const overrideAttempts = opts.maxAttempts;
  const overrideBase = opts.baseDelayMs;
  const overrideMax = opts.maxDelayMs;

  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      const kind = classifyRetryableError(err);

      if (kind === null) throw err;

      if (kind === 'daily') {
        throw new Error(
          `Daily YouTube API quota exhausted while running ${label}. ` +
          `Aborting: the quota resets at 00:00 PT, so waiting here is not useful. ` +
          `Wait for the reset or request a quota increase. ` +
          `Original error: ${(err as Error).message}`
        );
      }

      const policy = retryPolicyFor(kind);
      const maxAttempts = overrideAttempts ?? policy.maxAttempts;
      const baseDelayMs = overrideBase ?? policy.baseDelayMs;
      const maxDelayMs = overrideMax ?? policy.maxDelayMs;

      if (attempt >= maxAttempts) {
        // Out of attempts. Surface what was being retried so the failure is
        // actionable instead of looking like a plain API error.
        throw new Error(
          `${label} failed after ${maxAttempts} attempts (${kind}). ` +
          `Original error: ${(err as Error).message}`
        );
      }

      const serverMs = getRetryAfterMs(err);

      // A Retry-After this long is a closed quota window, not a hiccup.
      // Clamping it to maxDelayMs and retrying anyway would spend every
      // remaining attempt against a window that is still shut, then fail with
      // a message that looks like a generic API error. downloadReport has
      // always aborted on the same threshold; both paths now agree.
      if (serverMs !== undefined && serverMs >= LONG_RETRY_AFTER_MS) {
        throw new Error(
          `${label} is rate limited for ${Math.round(serverMs / 1000)}s (${kind}). ` +
          `Aborting instead of retrying, since the wait exceeds ` +
          `${Math.round(LONG_RETRY_AFTER_MS / 60000)} minutes. ` +
          `Original error: ${(err as Error).message}`
        );
      }

      const expMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // Honor the server's Retry-After when it asks for longer than our own
      // backoff, but never below it.
      const targetMs = serverMs !== undefined
        ? Math.min(Math.max(serverMs, expMs), maxDelayMs)
        : expMs;
      // Equal jitter. Concurrent calls that hit the same limit would otherwise
      // wake at identical instants and re-trigger it together.
      const waitMs = targetMs / 2 + Math.random() * (targetMs / 2);
      const waitSec = Math.round(waitMs / 1000);
      const source = serverMs !== undefined && serverMs > expMs ? ' (server Retry-After)' : '';
      const reason = {
        rpm: 'per-minute quota',
        qps: 'per-second rate limit',
        transient: 'transient server or network error',
      }[kind];
      progress(
        `${reason} on ${label} (attempt ${attempt}/${maxAttempts}), ` +
        `waiting ${waitSec}s${source} before retry...`
      );
      await sleep(waitMs);
    }
  }
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
  writeStdout,
  sleep,
  isRateLimitError,
  classifyRetryableError,
  retryPolicyFor,
  getRetryAfterMs,
  withRateLimitRetry,
  parsePositiveInt,
  toLocalYmd,
  daysAgoYmd,
  validateDateOption,
  validateDateRange,
  validatePrivacyFilter,
  runOrExit,
};
