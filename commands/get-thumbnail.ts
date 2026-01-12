import ora from 'ora';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, setVerbose, debug } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson } from '../lib/formatters';
import { GetThumbnailOptions } from '../types';

async function getThumbnailCommand(videoId: string, options: GetThumbnailOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video thumbnail...').start();

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
    const thumbnails = video.snippet?.thumbnails;
    const title = video.snippet?.title || 'Untitled';

    spinner.succeed('Retrieved thumbnail information');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    if (outputFormat === 'json') {
      console.log(formatJson({ videoId: parsedId, title, thumbnails }));
    } else {
      // For all other formats, use pretty output (thumbnails don't work well in table/text)
      console.log(chalk.bold.cyan(title));
      console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
      console.log('');

      if (!thumbnails) {
        console.log(chalk.gray('(No thumbnails available)'));
      } else {
        console.log(chalk.bold('Available Thumbnails:'));
        console.log('');

        // Show all available thumbnail sizes
        const sizes = ['default', 'medium', 'high', 'standard', 'maxres'] as const;
        sizes.forEach(size => {
          const thumbnail = thumbnails[size];
          if (thumbnail && thumbnail.url) {
            console.log(chalk.bold(`  ${size.toUpperCase()}:`));
            console.log(chalk.gray('    URL:   ') + chalk.blue(thumbnail.url));
            if (thumbnail.width && thumbnail.height) {
              console.log(chalk.gray('    Size:  ') + `${thumbnail.width}x${thumbnail.height}`);
            }
            console.log('');
          }
        });

        // If quality option specified, show only that one
        if (options.quality) {
          const quality = options.quality.toLowerCase();
          const thumbnail = thumbnails[quality as keyof typeof thumbnails];
          if (thumbnail && thumbnail.url) {
            console.log(chalk.bold(`Selected Quality (${quality}):`));
            console.log(chalk.blue(thumbnail.url));
          } else {
            console.log(chalk.yellow(`No thumbnail found for quality: ${options.quality}`));
          }
        }
      }
      console.log('');
    }
  } catch (err) {
    spinner.fail('Failed to fetch video thumbnail');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getThumbnailCommand;
