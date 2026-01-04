import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createInterface } from 'readline';
import { ChannelHandle } from '../types';

const CONFIG_DIR = path.join(os.homedir(), '.staqan-yt-cli');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');

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
};
