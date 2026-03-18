import chalk from 'chalk';
import { getChannelVideos } from '../lib/youtube';
import { formatDate, debug, initCommand, withSpinner, validatePrivacyFilter } from '../lib/utils';
import { getOutputFormat, requireChannel } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ChannelOption, OutputOption, LimitOption, VerboseOption, TypeFilterOption, PrivacyFilterOption } from '../types';

async function channelVideosCommand(options: ChannelOption & OutputOption & LimitOption & VerboseOption & TypeFilterOption & PrivacyFilterOption): Promise<void> {
  initCommand(options);
  validatePrivacyFilter(options.privacy);

  await withSpinner('Fetching channel videos...', 'Failed to fetch videos', async (spinner) => {
    const channel = await requireChannel(options.channel);
    debug(`Using channel: ${channel}`);

    const limit = parseInt(options.limit || '50');
    debug(`Channel handle: ${channel}, limit: ${limit}`);

    let videos = await getChannelVideos(channel, limit);

    // Filter by video type if specified
    if (options.type) {
      const typeFilter = options.type;
      debug(`Filtering by video type: ${typeFilter}`);
      videos = videos.filter(v => v.videoType === typeFilter);
    }

    // Filter by privacy status if specified
    if (options.privacy && options.privacy.length > 0) {
      const privacyFilter = options.privacy;
      debug(`Filtering by privacy: ${privacyFilter.join(', ')}`);
      videos = videos.filter(v => v.privacyStatus && privacyFilter.includes(v.privacyStatus));
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
          privacy: video.privacyStatus || '-',
          type: video.videoType,
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        videos.forEach(video => {
          console.log([video.id, video.title, formatDate(video.publishedAt), video.privacyStatus || '-', video.videoType].join('\t'));
        });
        break;

      case 'csv':
        const csvData = videos.map(video => ({
          id: video.id,
          title: video.title,
          published: video.publishedAt,
          privacy: video.privacyStatus || '',
          type: video.videoType,
        }));
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        videos.forEach((video, index) => {
          const typeIndicator = video.videoType === 'short' ? chalk.magenta(' [Short]') : '';
          const privacyColor = video.privacyStatus === 'public' ? chalk.green : video.privacyStatus === 'private' ? chalk.red : chalk.yellow;
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(video.title) + typeIndicator);
          console.log('  ID: ' + chalk.yellow(video.id));
          console.log('  Published: ' + formatDate(video.publishedAt));
          if (video.privacyStatus) {
            console.log('  Privacy: ' + privacyColor(video.privacyStatus));
          }
          console.log('  URL: ' + chalk.blue(`https://youtube.com/watch?v=${video.id}`));
          console.log('');
        });
        break;
    }
  });
}

export = channelVideosCommand;
