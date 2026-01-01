const ora = require('ora');
const chalk = require('chalk');
const { getChannelVideos } = require('../lib/youtube');
const { formatDate, error } = require('../lib/utils');

async function channelVideosCommand(channelHandle, options) {
  const spinner = ora('Fetching channel videos...').start();

  try {
    const limit = parseInt(options.limit) || 50;
    const videos = await getChannelVideos(channelHandle, limit);

    spinner.succeed(`Found ${videos.length} video(s)`);
    console.log('');

    if (options.json) {
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
    error(err.message);
    process.exit(1);
  }
}

module.exports = channelVideosCommand;
