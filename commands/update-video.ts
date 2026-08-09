import chalk from 'chalk';
import { getVideoInfo, updateVideoMetadata } from '../lib/youtube';
import { parseVideoId, confirm, success, warning, info, debug, initCommand, createSpinner, writeStdout } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatData } from '../lib/formatters';
import { UpdateVideoOptions, VideoIdOption } from '../types';

async function updateMetadataCommand(options: UpdateVideoOptions & VideoIdOption): Promise<void> {
  initCommand(options);

  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  // Validate that at least one update is provided — before the try block so
  // the catch below can't re-wrap this as a misleading "Failed to update
  // metadata" (the request never leaves the client).
  if (!options.title && !options.description) {
    throw new Error('Please provide at least one of --title or --description');
  }

  const outputFormat = await getOutputFormat(options.output);

  try {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    // Fetch current video info
    const spinner = createSpinner('Fetching current video metadata...').start();
    const [currentVideo] = await getVideoInfo([parsedId]);
    spinner.succeed('Current metadata retrieved');

    const updates: { title?: string; description?: string } = {};
    if (options.title) updates.title = options.title;
    if (options.description) updates.description = options.description;

    // Human preview only in pretty mode — machine formats keep stdout as
    // pure data (spinner/success/info/confirm all write to stderr).
    if (outputFormat === 'pretty') {
      console.log('');
      console.log(chalk.bold('Current metadata:'));
      console.log(chalk.gray('Title:       ') + currentVideo.title);
      console.log(chalk.gray('Description: ') + (currentVideo.description.substring(0, 100) + '...'));
      console.log('');

      console.log(chalk.bold('Proposed changes:'));
      if (updates.title) {
        console.log(chalk.gray('Title:       ') + chalk.green(updates.title));
      } else {
        console.log(chalk.gray('Title:       ') + chalk.dim('(no change)'));
      }
      if (updates.description) {
        const preview = updates.description.length > 100
          ? updates.description.substring(0, 100) + '...'
          : updates.description;
        console.log(chalk.gray('Description: ') + chalk.green(preview));
      } else {
        console.log(chalk.gray('Description: ') + chalk.dim('(no change)'));
      }
      console.log('');
    }

    // Dry run mode
    if (options.dryRun) {
      if (outputFormat !== 'pretty') {
        await writeStdout(formatData([{ videoId: parsedId, ...updates, dryRun: true }], outputFormat) + '\n');
      }
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

    if (outputFormat !== 'pretty') {
      await writeStdout(formatData([{
        videoId: parsedId,
        ...updates,
        url: `https://youtube.com/watch?v=${parsedId}`,
        dryRun: false,
      }], outputFormat) + '\n');
    } else {
      console.log('');
    }
    success(`Video updated: https://youtube.com/watch?v=${parsedId}`);
  } catch (err) {
    throw new Error(`Failed to update metadata: ${(err as Error).message}`);
  }
}

export = updateMetadataCommand;
