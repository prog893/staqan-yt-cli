import { downloadCaption } from '../lib/youtube';
import { debug, initCommand, createSpinner } from '../lib/utils';
import { GetCaptionOptions, CAPTION_FORMATS } from '../types';

async function getCaptionCommand(options: GetCaptionOptions): Promise<void> {
  initCommand(options);

  // Extract caption ID from options
  const captionId = options.captionId;
  if (!captionId) {
    throw new Error('Required: --caption-id');
  }

  if (options.format && !(CAPTION_FORMATS as readonly string[]).includes(options.format)) {
    throw new Error(`Invalid format '${options.format}'. Valid: ${CAPTION_FORMATS.join(', ')}`);
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
    const errMessage = (err as Error).message;
    const tip =
      '\nTip: Use list-captions <videoId> to see available captions\n' +
      '     Use get-video <videoId> to check video details';

    // Provide helpful context for common API limitations; the throw
    // propagates to withHelpWrapper for the exit(1) (issue #110).
    if (errMessage.includes('permissions') || errMessage.includes('not sufficient')) {
      throw new Error(
        'Caption download not available — you can only download captions from your own videos\n' +
        'YouTube API Limitation:\n' +
        'The captions.download API only works for videos on your authenticated channel.\n' +
        "Downloading captions from other channels' videos is not permitted.\n" +
        "To get the transcript of a video you don't own, use a third-party tool or\n" +
        "the YouTube website's subtitle/transcript feature instead." + tip
      );
    }
    throw new Error(errMessage + tip);
  }
}

export = getCaptionCommand;
