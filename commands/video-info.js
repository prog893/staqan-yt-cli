const ora = require('ora');
const chalk = require('chalk');
const { getVideoInfo } = require('../lib/youtube');
const { parseVideoId, formatDate, formatNumber, error } = require('../lib/utils');

async function videoInfoCommand(videoIds, options) {
  const spinner = ora('Fetching video information...').start();

  try {
    const parsedIds = videoIds.map(parseVideoId);
    const videos = await getVideoInfo(parsedIds);

    spinner.succeed(`Retrieved information for ${videos.length} video(s)`);
    console.log('');

    if (options.json) {
      console.log(JSON.stringify(videos, null, 2));
    } else {
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
    }
  } catch (err) {
    spinner.fail('Failed to fetch video information');
    console.log('');
    error(err.message);
    process.exit(1);
  }
}

module.exports = videoInfoCommand;
