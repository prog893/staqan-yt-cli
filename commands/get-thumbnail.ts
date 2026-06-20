import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { GetThumbnailOptions } from '../types';

const THUMBNAIL_SIZES = ['default', 'medium', 'high', 'standard', 'maxres'] as const;

async function getThumbnailCommand(options: GetThumbnailOptions): Promise<void> {
  initCommand(options);

  const videoId = options.videoId;
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  await withSpinner('Fetching video thumbnail...', 'Failed to fetch video thumbnail', async (spinner) => {
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

    const thumbnailData: Array<{ quality: string; url: string; width?: number; height?: number }> = [];
    if (thumbnails) {
      THUMBNAIL_SIZES.forEach(size => {
        const thumbnail = thumbnails[size];
        if (thumbnail && thumbnail.url) {
          thumbnailData.push({
            quality: size,
            url: thumbnail.url || '',
            width: thumbnail.width || undefined,
            height: thumbnail.height || undefined,
          });
        }
      });
    }

    switch (outputFormat) {
      case 'json':
        console.log(formatJson({ videoId: parsedId, title, thumbnails: thumbnailData }));
        break;

      case 'table':
        console.log(formatTable(thumbnailData));
        break;

      case 'text':
        thumbnailData.forEach(thumb => {
          console.log([thumb.quality, thumb.url, thumb.width || '', thumb.height || ''].join('\t'));
        });
        break;

      case 'csv':
        console.log(formatCsv(thumbnailData));
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log('');

        if (thumbnailData.length === 0) {
          console.log(chalk.gray('(No thumbnails available)'));
        } else {
          console.log(chalk.bold('Available Thumbnails:'));
          console.log('');

          thumbnailData.forEach(thumb => {
            console.log(chalk.bold(`  ${thumb.quality.toUpperCase()}:`));
            console.log(chalk.gray('    URL:   ') + chalk.blue(thumb.url));
            if (thumb.width && thumb.height) {
              console.log(chalk.gray('    Size:  ') + `${thumb.width}x${thumb.height}`);
            }
            console.log('');
          });
        }
        console.log('');
        break;
    }
  });
}

export = getThumbnailCommand;
