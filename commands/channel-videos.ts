import ora from 'ora';
import chalk from 'chalk';
import { getChannelVideos } from '../lib/youtube';
import { formatDate, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, shouldUseJson } from '../lib/config';
import { JsonOption, LimitOption, VerboseOption } from '../types';

async function channelVideosCommand(channelHandle: string | undefined, options: JsonOption & LimitOption & VerboseOption): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching channel videos...').start();

  try {
    // Use provided channelHandle or load from config
    let channel = channelHandle;
    if (!channel) {
      channel = await getConfigValue('default.channel');
      if (!channel) {
        spinner.fail('No channel specified');
        console.log('');
        error('Please provide a channel handle or set a default: staqan-yt config set default.channel @yourChannel');
        process.exit(1);
      }
      debug(`Using default channel from config: ${channel}`);
    }

    const limit = parseInt(options.limit || '50');
    debug(`Channel handle: ${channel}, limit: ${limit}`);

    const videos = await getChannelVideos(channel, limit);

    spinner.succeed(`Found ${videos.length} video(s)`);
    console.log('');

    const useJson = await shouldUseJson(options.json);
    if (useJson) {
      console.log(JSON.stringify(videos, null, 2));
    } else {
      videos.forEach((video, index) => {
        console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(video.title));
        console.log('  ID: ' + chalk.yellow(video.id));
        console.log('  Published: ' + formatDate(video.publishedAt));
        console.log('  URL: ' + chalk.blue(`https://youtube.com/watch?v=${video.id}`));
        console.log('');
      });
    }
  } catch (err) {
    spinner.fail('Failed to fetch videos');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = channelVideosCommand;
