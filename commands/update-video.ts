import chalk from 'chalk';
import { getVideoInfo, updateVideoMetadata } from '../lib/youtube';
import { parseVideoId, confirm, success, error, warning, info, debug, initCommand, createSpinner } from '../lib/utils';
import { UpdateVideoOptions, VideoIdOption } from '../types';

async function updateMetadataCommand(options: UpdateVideoOptions & VideoIdOption): Promise<void> {
  initCommand(options);

  const videoId = options.videoId;
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  try {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    // Validate that at least one update is provided
    if (!options.title && !options.description) {
      error('Please provide at least one of --title or --description');
      process.exit(1);
    }

    // Fetch current video info
    const spinner = createSpinner('Fetching current video metadata...').start();
    const [currentVideo] = await getVideoInfo([parsedId]);
    spinner.succeed('Current metadata retrieved');
    console.log('');

    // Show current state
    console.log(chalk.bold('Current metadata:'));
    console.log(chalk.gray('Title:       ') + currentVideo.title);
    console.log(chalk.gray('Description: ') + (currentVideo.description.substring(0, 100) + '...'));
    console.log('');

    // Show proposed changes
    console.log(chalk.bold('Proposed changes:'));
    const updates: { title?: string; description?: string } = {};

    if (options.title) {
      updates.title = options.title;
      console.log(chalk.gray('Title:       ') + chalk.green(options.title));
    } else {
      console.log(chalk.gray('Title:       ') + chalk.dim('(no change)'));
    }

    if (options.description) {
      updates.description = options.description;
      const preview = options.description.length > 100
        ? options.description.substring(0, 100) + '...'
        : options.description;
      console.log(chalk.gray('Description: ') + chalk.green(preview));
    } else {
      console.log(chalk.gray('Description: ') + chalk.dim('(no change)'));
    }
    console.log('');

    // Dry run mode
    if (options.dryRun) {
      info('Dry run mode - no changes will be applied');
      success('Preview complete');
      return;
    }

    // Confirm changes
    if (!options.yes) {
      const confirmed = await confirm('Apply these changes?');
      if (!confirmed) {
        warning('Update cancelled');
        return;
      }
    }

    // Apply updates
    const updateSpinner = createSpinner('Updating video metadata...').start();
    await updateVideoMetadata(parsedId, updates);
    updateSpinner.succeed('Metadata updated successfully');
    console.log('');
    success(`Video updated: https://youtube.com/watch?v=${parsedId}`);
  } catch (err) {
    console.log('');
    error(`Failed to update metadata: ${(err as Error).message}`);
    process.exit(1);
  }
}

export = updateMetadataCommand;
