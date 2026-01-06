import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, setVerbose, debug } from '../lib/utils';
import { shouldUseJson } from '../lib/config';
import { GetTagsOptions } from '../types';

async function getVideoTagsCommand(videoId: string, options: GetTagsOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video tags...').start();

  try {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

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
    const tags = video.snippet?.tags || [];
    const title = video.snippet?.title || 'Untitled';

    spinner.succeed(`Retrieved ${tags.length} tag(s)`);
    console.log('');

    const useJson = await shouldUseJson(options.json);
    if (useJson) {
      console.log(JSON.stringify({ videoId: parsedId, title, tags }, null, 2));
    } else {
      console.log(chalk.bold.cyan(title));
      console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
      console.log('');

      if (tags.length === 0) {
        console.log(chalk.gray('(No tags set)'));
      } else {
        console.log(chalk.bold(`Tags (${tags.length}):`));
        tags.forEach((tag, index) => {
          console.log(chalk.gray(`  ${index + 1}.`) + ` ${tag}`);
        });
      }
      console.log('');
    }
  } catch (err) {
    spinner.fail('Failed to fetch video tags');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getVideoTagsCommand;
