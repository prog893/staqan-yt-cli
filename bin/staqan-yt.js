#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const authCommand = require('../commands/auth');
const channelVideosCommand = require('../commands/channel-videos');
const videoInfoCommand = require('../commands/video-info');
const updateMetadataCommand = require('../commands/update-metadata');
const searchChannelCommand = require('../commands/search-channel');

program
  .name('staqan-yt')
  .description('CLI tool for managing YouTube videos and metadata')
  .version('1.0.0');

// Auth command
program
  .command('auth')
  .description('Authenticate with YouTube API using OAuth 2.0')
  .action(authCommand);

// Channel videos command
program
  .command('channel-videos <channelHandle>')
  .description('List all videos from a YouTube channel')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .action(channelVideosCommand);

// Video info command
program
  .command('video-info <videoIds...>')
  .description('Get detailed metadata for one or more videos')
  .option('-j, --json', 'Output in JSON format')
  .action(videoInfoCommand);

// Update metadata command
program
  .command('update-metadata <videoId>')
  .description('Update video title and/or description')
  .option('-t, --title <title>', 'New video title')
  .option('-d, --description <description>', 'New video description')
  .option('--dry-run', 'Preview changes without applying them')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(updateMetadataCommand);

// Search channel command
program
  .command('search-channel <channelHandle> <query>')
  .description('Search for videos in a channel by keyword')
  .option('-j, --json', 'Output in JSON format')
  .option('-l, --limit <number>', 'Limit number of results', '25')
  .action(searchChannelCommand);

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
