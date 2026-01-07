import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';
import { ChannelHandle } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.staqan-yt-cli');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');

// Global verbose flag
let isVerboseEnabled = false;

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
 * Print success message
 */
function success(message: string): void {
  console.log(chalk.green('✓ ') + message);
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
 * Print info message
 */
function info(message: string): void {
  console.log(chalk.blue('ℹ ') + message);
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
 * Sleep for specified milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

export {
  CONFIG_DIR,
  CREDENTIALS_PATH,
  TOKEN_PATH,
  ensureConfigDir,
  parseChannelHandle,
  parseVideoId,
  formatDate,
  formatNumber,
  success,
  error,
  warning,
  info,
  confirm,
  setVerbose,
  isVerbose,
  debug,
  progress,
  convertToCSV,
  chunkDateRange,
  sleep,
  retryWithBackoff,
};
