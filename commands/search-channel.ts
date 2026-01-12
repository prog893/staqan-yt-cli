import ora from 'ora';
import chalk from 'chalk';
import { searchChannelVideos } from '../lib/youtube';
import { formatDate, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { OutputOption, LimitOption, VerboseOption } from '../types';

async function searchChannelCommand(channelHandleOrQuery: string, queryOrOptions?: string | (OutputOption & LimitOption & VerboseOption), options?: OutputOption & LimitOption & VerboseOption): Promise<void> {
  // Determine if first argument is channel or query based on whether second argument is a string
  let channelHandle: string | undefined;
  let query: string;
  let opts: OutputOption & LimitOption & VerboseOption;

  if (typeof queryOrOptions === 'string') {
    // Two arguments provided: channel and query
    channelHandle = channelHandleOrQuery;
    query = queryOrOptions;
    opts = options || {};
  } else {
    // One argument provided: query only, need to load channel from config
    query = channelHandleOrQuery;
    opts = queryOrOptions || {};
  }

  // Enable verbose mode if requested
  if (opts.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora(`Searching for "${query}" in channel...`).start();

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

    const limit = parseInt(opts.limit || '25');
    debug(`Searching channel: ${channel}, query: "${query}", limit: ${limit}`);

    const videos = await searchChannelVideos(channel, query, limit);

    spinner.succeed(`Found ${videos.length} matching video(s)`);
    console.log('');

    if (videos.length === 0) {
      console.log(chalk.yellow('No videos found matching your query.'));
      return;
    }

    const outputFormat = await getOutputFormat(opts.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(videos));
        break;

      case 'table':
        const tableData = videos.map(video => ({
          id: video.id,
          title: video.title,
          published: formatDate(video.publishedAt),
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        videos.forEach(video => {
          console.log([video.id, video.title, video.publishedAt].join('\t'));
        });
        break;

      case 'pretty':
      default:
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
        break;
    }
  } catch (err) {
    spinner.fail('Search failed');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = searchChannelCommand;
