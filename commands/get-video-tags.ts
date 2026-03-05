import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { GetTagsOptions } from '../types';

async function getVideoTagsCommand(videoId: string, options: GetTagsOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching video tags...', 'Failed to fetch video tags', async (spinner) => {
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

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson({ videoId: parsedId, title, tags }));
        break;

      case 'table':
        const tableData = tags.map((tag, index) => ({ index: index + 1, tag }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        tags.forEach(tag => console.log(tag));
        break;

      case 'csv':
        const csvData = tags.map((tag, index) => ({ index: index + 1, tag }));
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
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
        break;
    }
  });
}

export = getVideoTagsCommand;
