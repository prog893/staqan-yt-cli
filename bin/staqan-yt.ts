#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { GroupedHelp } from '../lib/customHelp';
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
import getVideoAnalytics = require('../commands/get-video-analytics');
import getSearchTerms = require('../commands/get-search-terms');
import getTrafficSources = require('../commands/get-traffic-sources');
import getVideoRetention = require('../commands/get-video-retention');
import getVideoTags = require('../commands/get-video-tags');
import updateVideoTags = require('../commands/update-video-tags');
import getThumbnail = require('../commands/get-thumbnail');
import mcpCommand = require('../commands/mcp');
import getPlaylistCommand = require('../commands/get-playlist');
import getPlaylistsCommand = require('../commands/get-playlists');
import listPlaylistsCommand = require('../commands/list-playlists');
import listCommentsCommand = require('../commands/list-comments');
import getChannelCommand = require('../commands/get-channel');

// Get version - try to read from package.json, fallback to hardcoded version for compiled binaries
let version = '1.3.9'; // Fallback version for compiled binaries
try {
  const packageJson = require(path.join(__dirname, '../../package.json'));
  version = packageJson.version;
} catch {
  // Running as compiled binary - use hardcoded version
}

program
  .name('staqan-yt')
  .description('CLI tool for managing YouTube videos and metadata')
  .version(version)
  .createHelp = () => new GroupedHelp();

// Auth command
program
  .command('auth')
  .description('Authenticate with YouTube API using OAuth 2.0')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(authCommand);

// Config command
program
  .command('config [action] [key] [value]')
  .description('Manage CLI configuration (set defaults, view settings)')
  .option('--show', 'Show all configuration settings')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(configCommand);

// List videos command
program
  .command('list-videos [channelHandle]')
  .description('List all videos from a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-t, --type <type>', 'Filter by video type (short or regular)')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(channelVideosCommand);

// Get single video command
program
  .command('get-video <videoId>')
  .description('Get detailed metadata for a single video')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action((videoId: string, options: { output?: 'json' | 'table' | 'text' | 'pretty' | 'csv'; verbose?: boolean }) => videoInfoCommand([videoId], options));

// Get multiple videos command (batch operation)
program
  .command('get-videos <videoIds...>')
  .description('Get detailed metadata for multiple videos')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
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
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(updateMetadataCommand);

// Search videos command
program
  .command('search-videos <query>')
  .description('Search for videos on YouTube or within a specific channel')
  .option('-g, --global', 'Search all of YouTube (ignores channel filters)')
  .option('-c, --channel <handle>', 'Search within a specific channel (overrides config default)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(searchChannelCommand);

// Get all video localizations (plural - returns multiple)
program
  .command('get-video-localizations <videoIds...>')
  .description('Get all video localizations including main metadata language (supports multiple videos)')
  .option('--languages <langs>', 'Comma-separated list of languages (e.g., "en,ja,ru")')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoLocalizations);

// Get single video localization (singular - returns one)
program
  .command('get-video-localization <videoId>')
  .description('Get specific video localization (defaults to main metadata language)')
  .option('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoLocalization);

// Create new localization (PUT - fail if exists)
program
  .command('put-video-localization <videoId>')
  .description('Create new video localization (fails if already exists)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .requiredOption('--title <title>', 'Localized title')
  .requiredOption('--description <desc>', 'Localized description')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(putVideoLocalization);

// Update existing localization (UPDATE - fail if doesn't exist)
program
  .command('update-video-localization <videoId>')
  .description('Update existing video localization (fails if does not exist)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--title <title>', 'New localized title')
  .option('--description <desc>', 'New localized description')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(updateVideoLocalization);

// Analytics commands
program
  .command('get-video-analytics <videoId>')
  .description('Get video performance analytics (views, watch time, CTR, etc.)')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD), defaults to upload date')
  .option('--end-date <date>', 'End date (YYYY-MM-DD), defaults to today')
  .option('--metrics <metrics>', 'Comma-separated list of metrics to fetch')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoAnalytics);

program
  .command('get-search-terms <videoId>')
  .description('Get YouTube search terms that led viewers to this video')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getSearchTerms);

program
  .command('get-traffic-sources <videoId>')
  .description('Get traffic source breakdown (search, suggested, external, etc.)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getTrafficSources);

program
  .command('get-video-retention <videoId>')
  .description('Get audience retention curve (% of viewers at each point in video)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoRetention);

// Tags commands
program
  .command('get-video-tags <videoId>')
  .description('Get video tags')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getVideoTags);

program
  .command('update-video-tags <videoId>')
  .description('Update video tags (replace, add, or remove)')
  .option('--tags <tags>', 'Replace all tags with comma-separated list')
  .option('--add <tags>', 'Add comma-separated tags')
  .option('--remove <tags>', 'Remove comma-separated tags')
  .option('--dry-run', 'Preview changes without applying them')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(updateVideoTags);

// Thumbnail commands
program
  .command('get-thumbnail <videoId>')
  .description('Get video thumbnail URLs')
  .option('--quality <quality>', 'Specific quality (default, medium, high, standard, maxres)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getThumbnail);

// MCP server command
program
  .command('mcp')
  .description('Start MCP server for AI assistant integration')
  .action(mcpCommand);

// Playlist commands
// Get single playlist command (singular)
program
  .command('get-playlist <playlistId>')
  .description('Get detailed metadata for a single playlist')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getPlaylistCommand);

// Get multiple playlists command (plural - batch operation)
program
  .command('get-playlists <playlistIds...>')
  .description('Get detailed metadata for multiple playlists')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getPlaylistsCommand);

// List playlists command (plural - list collection)
program
  .command('list-playlists [channelHandle]')
  .description('List all playlists from a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(listPlaylistsCommand);

// List comments command (plural - list collection)
program
  .command('list-comments <videoId>')
  .description('List comments for a YouTube video')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('-s, --sort <order>', 'Sort order: top or new', 'top')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(listCommentsCommand);

// Get channel command (singular - single item)
program
  .command('get-channel [channelHandle]')
  .description('Get detailed metadata for a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(getChannelCommand);

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
