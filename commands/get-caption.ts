import chalk from 'chalk';
import { downloadCaption } from '../lib/youtube';
import { error, debug, initCommand, createSpinner } from '../lib/utils';
import { GetCaptionOptions, CAPTION_FORMATS } from '../types';

async function getCaptionCommand(options: GetCaptionOptions): Promise<void> {
  initCommand(options);

  // Extract caption ID from options
  const captionId = options.captionId;
  if (!captionId) {
    error('Required: --caption-id');
    process.exit(1);
  }

  if (options.format && !(CAPTION_FORMATS as readonly string[]).includes(options.format)) {
    error(`Invalid format '${options.format}'. Valid: ${CAPTION_FORMATS.join(', ')}`);
    process.exit(1);
  }

  // Note: For caption metadata, use list-captions --video-id <videoId>
  // This command focuses on downloading caption content
  const format = options.format || 'json';
  const spinner = createSpinner(`Downloading caption (${format})...`).start();

  try {
    debug(`Downloading caption: ${captionId}, format: ${format}`);
    const content = await downloadCaption(captionId, format);

    spinner.succeed('Caption downloaded');

    // Output caption content to stdout (allows redirection)
    console.log(content);
  } catch (err) {
    spinner.fail('Failed to download caption');
    console.log('');
    const errMessage = (err as Error).message;

    // Provide helpful context for common API limitations
    if (errMessage.includes('permissions') || errMessage.includes('not sufficient')) {
      error('Caption download not available — you can only download captions from your own videos');
      console.log('');
      console.log(chalk.yellow('YouTube API Limitation:'));
      console.log(chalk.gray('The captions.download API only works for videos on your authenticated channel.'));
      console.log(chalk.gray('Downloading captions from other channels\' videos is not permitted.'));
      console.log('');
      console.log(chalk.gray('To get the transcript of a video you don\'t own, use a third-party tool or'));
      console.log(chalk.gray('the YouTube website\'s subtitle/transcript feature instead.'));
    } else {
      error(errMessage);
    }

    console.log('');
    console.log(chalk.gray('Tip: Use ') + chalk.cyan('list-captions <videoId>') + chalk.gray(' to see available captions'));
    console.log(chalk.gray('      Use ') + chalk.cyan('get-video <videoId>') + chalk.gray(' to check video details'));
    process.exit(1);
  }
}

export = getCaptionCommand;
