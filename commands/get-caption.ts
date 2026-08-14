import { downloadCaption } from '../lib/youtube';
import { debug, initCommand, createSpinner, writeStdout } from '../lib/utils';
import { GetCaptionOptions, CAPTION_FORMATS, CAPTION_FORMAT_ALIASES, CaptionFormat } from '../types';

async function getCaptionCommand(options: GetCaptionOptions): Promise<void> {
  initCommand(options);

  // Extract caption ID from options
  const captionId = options.captionId;
  if (!captionId) {
    throw new Error('Required: --caption-id');
  }

  // `scc` used to be advertised but the API rejects it with HTTP 404 on every
  // track tried (manual, ASR, several languages), so name the reason instead
  // of listing it as merely invalid.
  if (options.format === 'scc') {
    throw new Error(
      "Format 'scc' is not supported: the YouTube API rejects scc conversion " +
      'for caption tracks (HTTP 404).\n' +
      `Valid formats: ${CAPTION_FORMATS.join(', ')}`
    );
  }

  const requested = options.format || 'raw';
  const format: CaptionFormat = CAPTION_FORMAT_ALIASES[requested] ?? (requested as CaptionFormat);

  if (!(CAPTION_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`Invalid format '${options.format}'. Valid: ${CAPTION_FORMATS.join(', ')}`);
  }

  // Note: For caption metadata, use list-captions --video-id <videoId>
  const spinner = createSpinner(`Downloading caption (${format})...`).start();

  try {
    debug(`Downloading caption: ${captionId}, format: ${format}`);
    const content = await downloadCaption(captionId, format);

    spinner.succeed('Caption downloaded');

    // The contract here is byte fidelity, not newline normalization: this
    // output is a caption file. srt, vtt and sbv end with two newlines, and
    // that trailing blank line terminates the final cue, so collapsing it to
    // one would corrupt the format. The conditional only guards against
    // leaving a shell prompt mid-line if a format ever returns no trailing
    // newline; every format observed live returns at least one.
    //
    // Must be writeStdout, not console.log: redirecting to a file is this
    // command's primary use, and console.log silently truncates piped output
    // at 65536 bytes with exit 0 (issue #161). ttml on a long video crosses it.
    await writeStdout(content.endsWith('\n') ? content : content + '\n');
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
