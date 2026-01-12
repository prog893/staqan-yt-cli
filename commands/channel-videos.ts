import ora from 'ora';
import chalk from 'chalk';
import { getChannelVideos } from '../lib/youtube';
import { formatDate, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { OutputOption, LimitOption, VerboseOption, TypeFilterOption } from '../types';

async function channelVideosCommand(channelHandle: string | undefined, options: OutputOption & LimitOption & VerboseOption & TypeFilterOption): Promise<void> {
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

    let videos = await getChannelVideos(channel, limit);

    // Filter by video type if specified
    if (options.type) {
      const typeFilter = options.type;
      debug(`Filtering by video type: ${typeFilter}`);
      videos = videos.filter(v => v.videoType === typeFilter);
    }

    const typeLabel = options.type ? ` ${options.type}` : '';
    spinner.succeed(`Found ${videos.length}${typeLabel} video(s)`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(videos));
        break;

      case 'table':
        const tableData = videos.map(video => ({
          id: video.id,
          title: video.title,
          published: formatDate(video.publishedAt),
          type: video.videoType,
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        videos.forEach(video => {
          console.log([video.id, video.title, video.publishedAt, video.videoType].join('\t'));
        });
        break;

      case 'pretty':
      default:
        videos.forEach((video, index) => {
          const typeIndicator = video.videoType === 'short' ? chalk.magenta(' [Short]') : '';
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(video.title) + typeIndicator);
          console.log('  ID: ' + chalk.yellow(video.id));
          console.log('  Published: ' + formatDate(video.publishedAt));
          console.log('  URL: ' + chalk.blue(`https://youtube.com/watch?v=${video.id}`));
          console.log('');
        });
        break;
    }
  } catch (err) {
    spinner.fail('Failed to fetch videos');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = channelVideosCommand;
