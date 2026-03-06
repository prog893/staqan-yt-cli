#!/usr/bin/env node

import { program, Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { GroupedHelp } from '../lib/customHelp';
import { OutputOption, VerboseOption, ChannelAnalyticsOptions } from '../types';
import authCommand = require('../commands/auth');
import listVideosCommand = require('../commands/list-videos');
import getVideoCommand = require('../commands/get-video');
import updateVideoCommand = require('../commands/update-video');
import searchVideosCommand = require('../commands/search-videos');
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
import listCaptionsCommand = require('../commands/list-captions');
import getCaptionCommand = require('../commands/get-caption');
import getChannelAnalyticsCommand = require('../commands/get-channel-analytics');
import getChannelSearchTermsCommand = require('../commands/get-channel-search-terms');
import listReportTypesCommand = require('../commands/list-report-types');
import listReportJobsCommand = require('../commands/list-report-jobs');
import getReportDataCommand = require('../commands/get-report-data');
import fetchReportsCommand = require('../commands/fetch-reports');

// Helper function to wrap command actions to handle "help" as an argument
// Note: Using any[] here is pragmatic - we only check for "help" string,
// then forward args to the properly-typed command function
function withHelpWrapper(commandName: string, actionFn: (...args: any[]) => Promise<void> | void) {
  return async (...args: any[]) => {
    // Check if "help" is in the command arguments (before Commander's validation)
    // This works even for commands with required options
    const commandIndex = process.argv.indexOf(commandName);
    if (commandIndex !== -1 && process.argv[commandIndex + 1] === 'help') {
      // Find the command and show its help
      const cmd = program.commands.find((c: Command) => c.name() === commandName);
      if (cmd) {
        cmd.outputHelp();
        process.exit(0);
      }
      return;
    }

    // Also check if any argument passed to the action is "help" (for commands without positional args)
    for (const arg of args) {
      // Only check string arguments that aren't part of options object
      if (typeof arg === 'string' && arg === 'help') {
        // Find the command and show its help
        const cmd = program.commands.find((c: Command) => c.name() === commandName);
        if (cmd) {
          cmd.outputHelp();
          process.exit(0);
        }
        return;
      }
    }

    // Otherwise, execute the original action
    return actionFn(...args);
  };
}

// Get version - try to read from package.json, fallback to hardcoded version for compiled binaries
let version = '1.3.18'; // Fallback version for compiled binaries
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
  .helpOption(false) // Disable automatic -h, --help flags (use 'help' command instead)
  .configureOutput({
    writeErr: (_str) => {
      // Suppress Commander's default error output
      // We'll display user-friendly errors in exitOverride below
    },
    writeOut: (str) => process.stdout.write(str)
  })
  .createHelp = () => new GroupedHelp();

// Help command (AWS-style: just 'help' for main help)
program
  .command('help')
  .description('Show help information')
  .action(() => {
    program.help();
  });

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
  .description('Manage CLI configuration (set defaults, view settings, install completions)')
  .option('--show', 'Show all configuration settings')
  .option('--install', 'Install shell completion to appropriate location')
  .option('--print', 'Print completion script to stdout')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('config', configCommand));

// List videos command
program
  .command('list-videos [channelHandle]')
  .description('List all videos from a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-t, --type <type>', 'Filter by video type (short or regular)')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-videos', listVideosCommand));

// Get single video command
program
  .command('get-video <videoId>')
  .description('Get detailed metadata for a single video')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video', (videoId: string, options: OutputOption & VerboseOption) => getVideoCommand([videoId], options)));

// Get multiple videos command (batch operation)
program
  .command('get-videos <videoIds...>')
  .description('Get detailed metadata for multiple videos')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-videos', getVideoCommand));

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
  .action(withHelpWrapper('update-video', updateVideoCommand));

// Search videos command
program
  .command('search-videos <query>')
  .description('Search for videos on YouTube or within a specific channel')
  .option('-g, --global', 'Search all of YouTube (ignores channel filters)')
  .option('-c, --channel <handle>', 'Search within a specific channel (overrides config default)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('search-videos', searchVideosCommand));

// Get all video localizations (plural - returns multiple)
program
  .command('get-video-localizations <videoIds...>')
  .description('Get all video localizations including main metadata language (supports multiple videos)')
  .option('--languages <langs>', 'Comma-separated list of languages (e.g., "en,ja,ru")')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video-localizations', getVideoLocalizations));

// Get single video localization (singular - returns one)
program
  .command('get-video-localization <videoId>')
  .description('Get specific video localization (defaults to main metadata language)')
  .option('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video-localization', getVideoLocalization));

// Create new localization (PUT - fail if exists)
program
  .command('put-video-localization <videoId>')
  .description('Create new video localization (fails if already exists)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .requiredOption('--title <title>', 'Localized title')
  .requiredOption('--description <desc>', 'Localized description')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('put-video-localization', putVideoLocalization));

// Update existing localization (UPDATE - fail if doesn't exist)
program
  .command('update-video-localization <videoId>')
  .description('Update existing video localization (fails if does not exist)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--title <title>', 'New localized title')
  .option('--description <desc>', 'New localized description')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('update-video-localization', updateVideoLocalization));

// Analytics commands
program
  .command('get-video-analytics <videoId>')
  .description('Get video performance analytics (views, watch time, CTR, etc.)')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD), defaults to upload date')
  .option('--end-date <date>', 'End date (YYYY-MM-DD), defaults to today')
  .option('--metrics <metrics>', 'Comma-separated list of metrics to fetch')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video-analytics', getVideoAnalytics));

program
  .command('get-search-terms <videoId>')
  .description('Get YouTube search terms that led viewers to this video')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-search-terms', getSearchTerms));

program
  .command('get-traffic-sources <videoId>')
  .description('Get traffic source breakdown (search, suggested, external, etc.)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-traffic-sources', getTrafficSources));

program
  .command('get-video-retention <videoId>')
  .description('Get audience retention curve (% of viewers at each point in video)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video-retention', getVideoRetention));

// Tags commands
program
  .command('get-video-tags <videoId>')
  .description('Get video tags')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-video-tags', getVideoTags));

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
  .action(withHelpWrapper('update-video-tags', updateVideoTags));

// Thumbnail commands
program
  .command('get-thumbnail <videoId>')
  .description('Get video thumbnail URLs')
  .option('--quality <quality>', 'Specific quality (default, medium, high, standard, maxres)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-thumbnail', getThumbnail));

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
  .action(withHelpWrapper('get-playlist', getPlaylistCommand));

// Get multiple playlists command (plural - batch operation)
program
  .command('get-playlists <playlistIds...>')
  .description('Get detailed metadata for multiple playlists')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-playlists', getPlaylistsCommand));

// List playlists command (plural - list collection)
program
  .command('list-playlists [channelHandle]')
  .description('List all playlists from a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-playlists', listPlaylistsCommand));

// List comments command (plural - list collection)
program
  .command('list-comments <videoId>')
  .description('List comments for a YouTube video')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-l, --limit <number>', 'Limit number of results', '20')
  .option('-s, --sort <order>', 'Sort order: top or new', 'top')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-comments', listCommentsCommand));

// Get channel command (singular - single item)
program
  .command('get-channel [channelHandle]')
  .description('Get detailed metadata for a YouTube channel')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-channel', getChannelCommand));

// Caption commands
// List captions command (plural - list collection)
program
  .command('list-captions <videoId>')
  .description('List all caption tracks for a YouTube video')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-captions', listCaptionsCommand));

// Get single caption command (singular)
program
  .command('get-caption <captionId>')
  .description('Download caption content to stdout (get caption ID from list-captions)')
  .option('--format <format>', 'Caption format: srt, vtt, sbv, srv2, ttml, json (default: json)', 'json')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-caption', getCaptionCommand));

// Channel search terms command — top keywords from YouTube Search traffic
program
  .command('get-channel-search-terms [channelHandle]')
  .description('Get top search keywords driving traffic to a channel (YouTube Search source)')
  .option('-l, --limit <number>', 'Limit number of results (max 25, API restriction)', '25')
  .option('--content-type <type>', 'Filter by content type: all (default), video (non-shorts), shorts', 'all')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD), defaults to all-time (2005-02-14)')
  .option('--end-date <date>', 'End date (YYYY-MM-DD), defaults to today')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-channel-search-terms', getChannelSearchTermsCommand));

// Channel analytics command (singular - single channel report)
program
  .command('get-channel-analytics [channelHandle]')
  .description('Get channel-level analytics reports (demographics, devices, geography, etc.)')
  .option('--report <type>', 'Predefined report type: demographics, devices, geography, traffic-sources, subscription-status')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD), defaults to 30 days ago')
  .option('--end-date <date>', 'End date (YYYY-MM-DD), defaults to today')
  .option('--dimensions <dims>', 'Custom dimensions (comma-separated, requires --metrics)')
  .option('--metrics <metrics>', 'Custom metrics (comma-separated, requires --dimensions)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-channel-analytics', (channelHandle: string | undefined, options: ChannelAnalyticsOptions) => {
    // Commander v12+ automatically converts kebab-case to camelCase
    getChannelAnalyticsCommand(channelHandle, options);
  }));

// YouTube Reporting API commands
program
  .command('list-report-types')
  .description('List all available YouTube Reporting API report types')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-report-types', listReportTypesCommand));

program
  .command('list-report-jobs')
  .description('List YouTube Reporting API jobs with status and expiration warnings')
  .option('--type <id>', 'Filter by report type ID (e.g., channel_reach_basic_a1)')
  .option('--output <format>', 'Output format: json, table, text, pretty, csv')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('list-report-jobs', listReportJobsCommand));

program
  .command('get-report-data')
  .description('Get YouTube Reporting API report data (thumbnail impressions, CTR, etc.)')
  .requiredOption('--type <id>', 'Report type ID (e.g., channel_reach_basic_a1 for thumbnail data)')
  .option('--video-id <id>', 'Filter by video ID')
  .option('--start-date <date>', 'Start date (YYYY-MM-DD)')
  .option('--end-date <date>', 'End date (YYYY-MM-DD)')
  .option('--output <format>', 'Output format: json, csv', 'json')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('get-report-data', getReportDataCommand));

program
  .command('fetch-reports')
  .description('Download and cache all available report data (archival)')
  .option('-t, --type <id>', 'Fetch specific report type')
  .option('-T, --types <ids>', 'Fetch multiple report types (comma-separated)')
  .option('--start-date <date>', 'Filter by start date (YYYY-MM-DD)')
  .option('--end-date <date>', 'Filter by end date (YYYY-MM-DD)')
  .option('-f, --force', 'Re-download even if cached')
  .option('--verify', 'Verify cached file completeness')
  .option('-v, --verbose', 'Enable verbose output with debug information')
  .action(withHelpWrapper('fetch-reports', fetchReportsCommand));

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Graceful shutdown handler (Ctrl+C)
// Handle multiple signal types for better cross-platform compatibility
const shutdownHandler = (signal: string) => {
  console.log(chalk.yellow(`\nOperation cancelled by user (${signal})`));
  // Exit with success code to prevent npm/pnpm ELIFECYCLE errors
  process.exit(0);
};

process.on('SIGINT', () => shutdownHandler('SIGINT'));
process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

program.exitOverride((err) => {
  const error = err as { code?: string; message?: string; exitCode?: number };

  // Check if user is asking for help (even with missing required options)
  const args = process.argv.slice(2);
  const helpIndex = args.indexOf('help');

  if (helpIndex !== -1 && helpIndex > 0) {
    // Found "help" after a command name
    const commandName = args[helpIndex - 1];
    const cmd = program.commands.find((c: Command) => c.name() === commandName);
    if (cmd) {
      cmd.outputHelp();
      process.exit(0);
      return; // Make sure we return after showing help
    }
  }

  // Extract clean message (remove Commander's "error: " prefix if present)
  const cleanMessage = error.message?.replace(/^error:\s*/, '') || 'An unknown error occurred';

  // Handle all error cases with user-friendly messages
  if (error.code === 'commander.unknownOption') {
    console.error(chalk.red(`Error: ${cleanMessage}`));
    console.log(chalk.yellow("\nUse 'staqan-yt help' to see available options"));
    process.exit(1);
  } else if (error.code === 'commander.unknownCommand') {
    console.error(chalk.red(`Error: ${cleanMessage}`));
    console.log(chalk.yellow("\nUse 'staqan-yt help' to see available commands"));
    process.exit(1);
  } else if (error.code === 'commander.missingArgument') {
    console.error(chalk.red(`Error: ${cleanMessage}`));
    console.log(chalk.yellow("\nUse 'staqan-yt help <command>' for usage information"));
    process.exit(1);
  } else if (error.code?.includes('option') || error.code?.includes('required')) {
    console.error(chalk.red(`Error: ${cleanMessage}`));
    console.log(chalk.yellow("\nUse 'staqan-yt help <command>' for usage information"));
    process.exit(1);
  } else if (error.code === 'commander.help' || error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
    // Help or version was displayed, exit normally
    process.exit(0);
  } else {
    // For any other error, show just the message
    console.error(chalk.red(`Error: ${cleanMessage}`));
    process.exit(error.exitCode || 1);
  }
});

// Check for "help" argument BEFORE Commander parses
// This ensures help works even for commands with required options
const args = process.argv.slice(2);
const helpIndex = args.indexOf('help');
if (helpIndex > 0 && args[helpIndex - 1] !== 'help') {
  // Found "help" after a command name
  const commandName = args[helpIndex - 1];
  const cmd = program.commands.find((c: Command) => c.name() === commandName);
  if (cmd) {
    cmd.outputHelp();
    process.exit(0);
  }
}

program.parse(process.argv);
