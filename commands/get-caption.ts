import ora from 'ora';
import chalk from 'chalk';
import { downloadCaption } from '../lib/youtube';
import { error, setVerbose, debug } from '../lib/utils';
import { CaptionFormat, VerboseOption } from '../types';

interface GetCaptionOptions extends VerboseOption {
  format?: CaptionFormat;
}

async function getCaptionCommand(captionId: string, options: GetCaptionOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  // Note: For caption metadata, use list-captions <videoId>
  // This command focuses on downloading caption content
  const format = options.format || 'json';
  const spinner = ora(`Downloading caption (${format})...`).start();

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
      error('Caption download not available');
      console.log('');
      console.log(chalk.yellow('YouTube API Limitation:'));
      console.log(chalk.gray('Caption downloads are restricted by YouTube and may not be available for all videos.'));
      console.log('');
      console.log(chalk.gray('Downloads typically work for:'));
      console.log('  • Captions manually uploaded by the content owner');
      console.log('  • Captions with third-party contributions enabled');
      console.log('');
      console.log(chalk.gray('Auto-generated captions usually cannot be downloaded via the API.'));
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
