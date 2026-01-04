import ora from 'ora';
import chalk from 'chalk';
import { searchChannelVideos } from '../lib/youtube';
import { formatDate, error } from '../lib/utils';
import { JsonOption, LimitOption } from '../types';

async function searchChannelCommand(channelHandle: string, query: string, options: JsonOption & LimitOption): Promise<void> {
  const spinner = ora(`Searching for "${query}" in channel...`).start();

  try {
    const limit = parseInt(options.limit || '25');
    const videos = await searchChannelVideos(channelHandle, query, limit);

    spinner.succeed(`Found ${videos.length} matching video(s)`);
    console.log('');

    if (videos.length === 0) {
      console.log(chalk.yellow('No videos found matching your query.'));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(videos, null, 2));
    } else {
      videos.forEach((video, index) => {
        console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(video.title));
        console.log('  ID: ' + chalk.yellow(video.id));
        console.log('  Published: ' + formatDate(video.publishedAt));
        console.log('  URL: ' + chalk.blue(`https://youtube.com/watch?v=${video.id}`));

        // Show description preview if it contains the query
        if (video.description && video.description.toLowerCase().includes(query.toLowerCase())) {
          const maxLen = 100;
          const preview = video.description.length > maxLen
            ? video.description.substring(0, maxLen) + '...'
            : video.description;
          console.log('  ' + chalk.gray(preview));
        }

        console.log('');
      });
    }
  } catch (err) {
    spinner.fail('Search failed');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = searchChannelCommand;
