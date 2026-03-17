import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, confirm, success, error, warning, info, debug, initCommand, createSpinner } from '../lib/utils';
import { UpdateTagsOptions } from '../types';

async function updateVideoTagsCommand(options: UpdateTagsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  try {
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    // Validate that at least one update is provided
    if (!options.tags && !options.add && !options.remove) {
      error('Please provide at least one of --tags, --add, or --remove');
      process.exit(1);
    }

    // Fetch current video info
    const spinner = createSpinner('Fetching current video tags...').start();
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: ['snippet'],
      id: [parsedId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      spinner.fail('Video not found');
      error(`No video found with ID: ${parsedId}`);
      process.exit(1);
    }

    const video = response.data.items[0];
    const currentTags = video.snippet?.tags || [];
    const title = video.snippet?.title || 'Untitled';

    spinner.succeed('Current tags retrieved');
    console.log('');

    // Calculate new tags
    let newTags: string[] = [];

    if (options.tags) {
      // Replace all tags
      newTags = options.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    } else {
      // Start with current tags
      newTags = [...currentTags];

      // Add tags
      if (options.add) {
        const tagsToAdd = options.add.split(',').map(t => t.trim()).filter(t => t.length > 0);
        tagsToAdd.forEach(tag => {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
          }
        });
      }

      // Remove tags
      if (options.remove) {
        const tagsToRemove = options.remove.split(',').map(t => t.trim()).filter(t => t.length > 0);
        newTags = newTags.filter(tag => !tagsToRemove.includes(tag));
      }
    }

    // Show current state
    console.log(chalk.bold.cyan(title));
    console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
    console.log('');

    console.log(chalk.bold('Current tags:'));
    if (currentTags.length === 0) {
      console.log(chalk.gray('  (No tags)'));
    } else {
      currentTags.forEach(tag => {
        console.log(`  ${tag}`);
      });
    }
    console.log('');

    // Show proposed changes
    console.log(chalk.bold('New tags:'));
    if (newTags.length === 0) {
      console.log(chalk.gray('  (No tags)'));
    } else {
      newTags.forEach(tag => {
        const isNew = !currentTags.includes(tag);
        if (isNew) {
          console.log(chalk.green(`  + ${tag}`));
        } else {
          console.log(`  ${tag}`);
        }
      });
    }

    // Show removed tags
    const removedTags = currentTags.filter(tag => !newTags.includes(tag));
    if (removedTags.length > 0) {
      console.log('');
      console.log(chalk.bold('Removed tags:'));
      removedTags.forEach(tag => {
        console.log(chalk.red(`  - ${tag}`));
      });
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
    const updateSpinner = createSpinner('Updating video tags...').start();

    await youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: parsedId,
        snippet: {
          ...video.snippet,
          tags: newTags,
          categoryId: video.snippet?.categoryId || '22', // Default to People & Blogs if missing
        },
      },
    });

    updateSpinner.succeed('Tags updated successfully');
    console.log('');
    success(`Video updated: https://youtube.com/watch?v=${parsedId}`);
  } catch (err) {
    console.log('');
    error(`Failed to update tags: ${(err as Error).message}`);
    process.exit(1);
  }
}

export = updateVideoTagsCommand;
