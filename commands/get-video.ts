import chalk from 'chalk';
import { getVideoInfo } from '../lib/youtube';
import { parseVideoId, formatDate, formatNumber, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, VerboseOption } from '../types';

async function videoInfoCommand(videoIds: string[], options: OutputOption & VerboseOption): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching video information...', 'Failed to fetch video information', async (spinner) => {
    debug(`Parsing ${videoIds.length} video ID(s)`, videoIds);
    const parsedIds = videoIds.map(parseVideoId);
    debug('Parsed video IDs', parsedIds);

    const videos = await getVideoInfo(parsedIds);

    spinner.succeed(`Retrieved information for ${videos.length} video(s)`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(videos));
        break;

      case 'table':
        // Flatten video data for table format
        const tableData = videos.map(video => ({
          id: video.id,
          title: video.title,
          channel: video.channelTitle,
          published: formatDate(video.publishedAt),
          duration: video.duration,
          views: formatNumber(video.statistics.viewCount),
          likes: formatNumber(video.statistics.likeCount),
          type: video.videoType,
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        // Tab-delimited output for scripting
        videos.forEach(video => {
          console.log([
            video.id,
            video.title,
            video.channelTitle,
            formatDate(video.publishedAt),
            video.duration,
            video.statistics.viewCount,
            video.statistics.likeCount,
            video.statistics.commentCount,
            video.videoType,
          ].join('\t'));
        });
        break;

      case 'csv':
        const csvData = videos.map(video => ({
          id: video.id,
          title: video.title,
          channel: video.channelTitle,
          published: video.publishedAt,
          duration: video.duration,
          views: video.statistics.viewCount,
          likes: video.statistics.likeCount,
          comments: video.statistics.commentCount,
          type: video.videoType,
        }));
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        // Original colorful output
        videos.forEach((video, index) => {
          if (index > 0) console.log(chalk.gray('─'.repeat(80)));
          console.log('');

          console.log(chalk.bold.cyan(video.title));
          console.log('');
          console.log(chalk.gray('Video ID:     ') + chalk.yellow(video.id));
          console.log(chalk.gray('Channel:      ') + video.channelTitle);
          console.log(chalk.gray('Published:    ') + formatDate(video.publishedAt));
          console.log(chalk.gray('Duration:     ') + video.duration);
          console.log(chalk.gray('Privacy:      ') + video.privacyStatus);
          console.log(chalk.gray('Type:         ') + (video.videoType === 'short' ? chalk.magenta('Short') : 'Regular'));
          console.log('');

          console.log(chalk.bold('Statistics:'));
          console.log(chalk.gray('  Views:      ') + formatNumber(video.statistics.viewCount));
          console.log(chalk.gray('  Likes:      ') + formatNumber(video.statistics.likeCount));
          console.log(chalk.gray('  Comments:   ') + formatNumber(video.statistics.commentCount));
          console.log('');

          if (video.tags && video.tags.length > 0) {
            console.log(chalk.bold('Tags:'));
            console.log('  ' + video.tags.join(', '));
            console.log('');
          }

          console.log(chalk.bold('Description:'));
          const description = video.description || '(No description)';
          const preview = description.length > 200
            ? description.substring(0, 200) + '...'
            : description;
          console.log('  ' + preview.replace(/\n/g, '\n  '));
          console.log('');

          console.log(chalk.gray('URL:          ') + chalk.blue(`https://youtube.com/watch?v=${video.id}`));
          console.log('');
        });
        break;
    }
  });
}

export = videoInfoCommand;
