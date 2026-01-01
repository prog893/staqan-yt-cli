#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const authCommand = require('../commands/auth');
const channelVideosCommand = require('../commands/channel-videos');
const videoInfoCommand = require('../commands/video-info');
const updateMetadataCommand = require('../commands/update-metadata');
const searchChannelCommand = require('../commands/search-channel');
const getVideoLocalizations = require('../commands/get-video-localizations');
const getVideoLocalization = require('../commands/get-video-localization');
const putVideoLocalization = require('../commands/put-video-localization');
const updateVideoLocalization = require('../commands/update-video-localization');

program
  .name('staqan-yt')
  .description('CLI tool for managing YouTube videos and metadata')
  .version('1.0.0');

// Auth command
program
  .command('auth')
  .description('Authenticate with YouTube API using OAuth 2.0')
  .action(authCommand);

// List videos command
program
  .command('list-videos <channelHandle>')
  .description('List all videos from a YouTube channel')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .action(channelVideosCommand);

// Get single video command
program
  .command('get-video <videoId>')
  .description('Get detailed metadata for a single video')
  .option('-j, --json', 'Output in JSON format')
  .action((videoId, options) => videoInfoCommand([videoId], options));

// Get multiple videos command (batch operation)
program
  .command('get-videos <videoIds...>')
  .description('Get detailed metadata for multiple videos')
  .option('-j, --json', 'Output in JSON format')
  .action(videoInfoCommand);

// Update video command
program
  .command('update-video <videoId>')
  .description('Update video title and/or description')
  .option('-t, --title <title>', 'New video title')
  .option('-d, --description <description>', 'New video description')
  .option('--dry-run', 'Preview changes without applying them')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(updateMetadataCommand);

// Search videos command
program
  .command('search-videos <channelHandle> <query>')
  .description('Search for videos in a channel by keyword')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .action(searchChannelCommand);

// Get all video localizations (plural - returns multiple)
program
  .command('get-video-localizations <videoId>')
  .description('Get all video localizations including main metadata language')
  .option('--languages <langs>', 'Comma-separated list of languages (e.g., "en,ja,ru")')
  .option('-j, --json', 'Output in JSON format')
  .action(getVideoLocalizations);

// Get single video localization (singular - returns one)
program
  .command('get-video-localization <videoId>')
  .description('Get specific video localization (defaults to main metadata language)')
  .option('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('-j, --json', 'Output in JSON format')
  .action(getVideoLocalization);

// Create new localization (PUT - fail if exists)
program
  .command('put-video-localization <videoId>')
  .description('Create new video localization (fails if already exists)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .requiredOption('--title <title>', 'Localized title')
  .requiredOption('--description <desc>', 'Localized description')
  .action(putVideoLocalization);

// Update existing localization (UPDATE - fail if doesn't exist)
program
  .command('update-video-localization <videoId>')
  .description('Update existing video localization (fails if does not exist)')
  .requiredOption('--language <lang>', 'Language code or name (e.g., "ja", "Japanese")')
  .option('--title <title>', 'New localized title')
  .option('--description <desc>', 'New localized description')
  .action(updateVideoLocalization);

// Error handling
program.exitOverride();

try {
  program.parse(process.argv);
} catch (err) {
  if (err.code === 'commander.missingArgument') {
    console.error(chalk.red(`Error: ${err.message}`));
    console.log(chalk.yellow('\nUse --help for usage information'));
    process.exit(1);
  } else if (err.code === 'commander.helpDisplayed') {
    // Help was displayed, exit normally
    process.exit(0);
  }
  throw err;
}

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
