#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import authCommand = require('../commands/auth');
import channelVideosCommand = require('../commands/channel-videos');
import videoInfoCommand = require('../commands/video-info');
import updateMetadataCommand = require('../commands/update-metadata');
import searchChannelCommand = require('../commands/search-channel');
import getVideoLocalizations = require('../commands/get-video-localizations');
import getVideoLocalization = require('../commands/get-video-localization');
import putVideoLocalization = require('../commands/put-video-localization');
import updateVideoLocalization = require('../commands/update-video-localization');
import configCommand = require('../commands/config');

// Get version - try to read from package.json, fallback to hardcoded version for compiled binaries
let version = '1.1.1'; // Fallback version for compiled binaries
try {
  const packageJson = require(path.join(__dirname, '../../package.json'));
  version = packageJson.version;
} catch (err) {
  // Running as compiled binary - use hardcoded version
}

program
  .name('staqan-yt')
  .description('CLI tool for managing YouTube videos and metadata')
  .version(version);

// Auth command
program
  .command('auth')
  .description('Authenticate with YouTube API using OAuth 2.0')
  .action(authCommand);

// Config command
program
  .command('config [action] [key] [value]')
  .description('Manage CLI configuration (set defaults, view settings)')
  .option('--show', 'Show all configuration settings')
  .action(configCommand);

// List videos command
program
  .command('list-videos [channelHandle]')
  .description('List all videos from a YouTube channel')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(channelVideosCommand);

// Get single video command
program
  .command('get-video <videoId>')
  .description('Get detailed metadata for a single video')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action((videoId: string, options: { json?: boolean; verbose?: boolean }) => videoInfoCommand([videoId], options));

// Get multiple videos command (batch operation)
program
  .command('get-videos <videoIds...>')
  .description('Get detailed metadata for multiple videos')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(videoInfoCommand);

// Update video command
program
  .command('update-video <videoId>')
  .description('Update video title and/or description')
  .option('-t, --title <title>', 'New video title')
  .option('-d, --description <description>', 'New video description')
  .option('--dry-run', 'Preview changes without applying them')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(updateMetadataCommand);

// Search videos command
program
  .command('search-videos [channelHandle] <query>')
  .description('Search for videos in a channel by keyword')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(searchChannelCommand);

// Get all video localizations (plural - returns multiple)
program
  .command('get-video-localizations <videoIds...>')
  .description('Get all video localizations including main metadata language (supports multiple videos)')
  .option('--languages <langs>', 'Comma-separated list of languages (e.g., "en,ja,ru")')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoLocalizations);

// Get single video localization (singular - returns one)
program
  .command('get-video-localization <videoId>')
  .description('Get specific video localization (defaults to main metadata language)')
  .option('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('-j, --json', 'Output in JSON format')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoLocalization);

// Create new localization (PUT - fail if exists)
program
  .command('put-video-localization <videoId>')
  .description('Create new video localization (fails if already exists)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .requiredOption('--title <title>', 'Localized title')
  .requiredOption('--description <desc>', 'Localized description')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(putVideoLocalization);

// Update existing localization (UPDATE - fail if doesn't exist)
program
  .command('update-video-localization <videoId>')
  .description('Update existing video localization (fails if does not exist)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--title <title>', 'New localized title')
  .option('--description <desc>', 'New localized description')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(updateVideoLocalization);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Error handling
program.exitOverride();

try {
  program.parse(process.argv);
} catch (err) {
  const error = err as { code?: string; message?: string };
  if (error.code === 'commander.missingArgument') {
    console.error(chalk.red(`Error: ${error.message}`));
    console.log(chalk.yellow('\nUse --help for usage information'));
    process.exit(1);
  } else if (error.code === 'commander.help' || error.code === 'commander.helpDisplayed') {
    // Help was displayed, exit normally
    process.exit(0);
  } else if (error.code === 'commander.version') {
    // Version was displayed, exit normally
    process.exit(0);
  }
  throw err;
}
