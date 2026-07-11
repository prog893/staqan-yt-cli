import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, confirm, success, warning, info, debug, initCommand, createSpinner } from '../lib/utils';
import { UpdateTagsOptions } from '../types';

async function updateVideoTagsCommand(options: UpdateTagsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  try {
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    // Validate that at least one update is provided
    if (!options.replace && !options.add && !options.remove) {
      throw new Error('Please provide at least one of --replace, --add, or --remove');
    }

    // --replace is rewrite mode; --add/--remove is incremental mode — cannot mix
    if (options.replace && (options.add || options.remove)) {
      throw new Error(
        '--replace cannot be combined with --add or --remove\n' +
        '  Rewrite mode:      --replace "foo,bar"\n' +
        '  Incremental mode:  --add "foo" --remove "bar"'
      );
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
      throw new Error(`No video found with ID: ${parsedId}`);
    }

    const video = response.data.items[0];
    const currentTags = video.snippet?.tags || [];
    const title = video.snippet?.title || 'Untitled';

    spinner.succeed('Current tags retrieved');
    console.log('');

    // Calculate new tags
    let newTags: string[] = [];

    if (options.replace) {
      // Replace all tags
      newTags = options.replace.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
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
    const errorMessage = (err as Error).message;
    // The throw propagates to withHelpWrapper for the exit(1) (issue #110).
    if (errorMessage.includes('invalid video keywords')) {
      throw new Error(
        'Cannot update video tags\n' +
        'This usually means one of two things:\n' +
        "  1. You don't have permission to modify this video (not your channel)\n" +
        '  2. Tags contain invalid characters or exceed length limits\n' +
        'Tip: Tags use comma-separated format: --add "tokyo bar,craft beer,nightlife"'
      );
    }
    throw new Error(`Failed to update tags: ${errorMessage}`);
  }
}

export = updateVideoTagsCommand;
