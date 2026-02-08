import ora from 'ora';
import chalk from 'chalk';
import { searchChannelVideos, searchVideosGlobal } from '../lib/youtube';
import { formatDate, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { SearchVideosOptions } from '../types';

async function searchVideosCommand(
  query: string,
  options: SearchVideosOptions
): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  // Determine search mode
  const isGlobal = options.global === true;
  const explicitChannel = options.channel;

  // Validation: can't use both --global and --channel
  if (isGlobal && explicitChannel) {
    error('Cannot use both --global and --channel flags together');
    console.log('');
    console.log(chalk.yellow('Use either:'));
    console.log('  - staqan-yt search-videos "<query>" --global');
    console.log('  - staqan-yt search-videos "<query>" --channel @handle');
    console.log('  - staqan-yt search-videos "<query>" (uses config default.channel)');
    process.exit(1);
  }

  let searchMode: 'global' | 'channel';
  let targetChannel: string | undefined;

  if (isGlobal) {
    searchMode = 'global';
    debug('Global search mode enabled');
  } else if (explicitChannel) {
    searchMode = 'channel';
    targetChannel = explicitChannel;
    debug(`Channel search mode with explicit channel: ${targetChannel}`);
  } else {
    // Try to load from config
    targetChannel = await getConfigValue('default.channel');
    if (!targetChannel) {
      error('No channel specified');
      console.log('');
      console.log(chalk.yellow('Options:'));
      console.log('  1. Use --global flag to search all of YouTube');
      console.log('  2. Use --channel @handle to search a specific channel');
      console.log('  3. Set a default channel: staqan-yt config set default.channel @yourChannel');
      console.log('');
      console.log(chalk.gray('Examples:'));
      console.log(chalk.gray('  staqan-yt search-videos "tutorial" --global'));
      console.log(chalk.gray('  staqan-yt search-videos "tutorial" --channel @mkbhd'));
      console.log(chalk.gray('  staqan-yt config set default.channel @mkbhd'));
      process.exit(1);
    }
    searchMode = 'channel';
    debug(`Channel search mode with config default: ${targetChannel}`);
  }

  const spinner = ora(
    searchMode === 'global'
      ? `Searching YouTube for "${query}"...`
      : `Searching ${targetChannel} for "${query}"...`
  ).start();

  try {
    const limit = parseInt(options.limit || '25');
    debug(`Search mode: ${searchMode}, query: "${query}", limit: ${limit}`);

    let videos;
    if (searchMode === 'global') {
      videos = await searchVideosGlobal(query, limit);
    } else {
      videos = await searchChannelVideos(targetChannel!, query, limit);
    }

    spinner.succeed(`Found ${videos.length} video(s)`);
    console.log('');

    if (videos.length === 0) {
      console.log(chalk.yellow('No videos found matching your query.'));
      return;
    }

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(videos));
        break;

      case 'table':
        const tableData = videos.map(video => ({
          id: video.id,
          title: video.title,
          channel: video.channelTitle || '-',
          published: formatDate(video.publishedAt),
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        videos.forEach(video => {
          console.log([
            video.id,
            video.title,
            video.channelTitle || '-',
            video.publishedAt
          ].join('\t'));
        });
        break;

      case 'csv':
        const csvData = videos.map(video => ({
          id: video.id,
          title: video.title,
          channel: video.channelTitle || '',
          published: video.publishedAt,
        }));
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        videos.forEach((video, index) => {
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(video.title));
          console.log('  ID: ' + chalk.yellow(video.id));

          // Show channel for global search
          if (searchMode === 'global' && video.channelTitle) {
            console.log('  Channel: ' + chalk.blue(video.channelTitle));
          }

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

export = searchVideosCommand;
