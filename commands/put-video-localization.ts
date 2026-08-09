import chalk from 'chalk';
import { putVideoLocalization } from '../lib/youtube';
import { parseVideoId, debug, initCommand, withSpinner, writeStdout } from '../lib/utils';
import { normalizeLanguage, getLanguageName } from '../lib/language';
import { getOutputFormat } from '../lib/config';
import { formatData } from '../lib/formatters';
import { PutLocalizationOptions } from '../types';

async function putVideoLocalizationCommand(options: PutLocalizationOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  const { language, title, description } = options;

  // Validation: Required options
  if (!language) {
    throw new Error('Required: --language');
  }

  if (!title) {
    throw new Error('Required: --title');
  }

  if (!description) {
    throw new Error('Required: --description');
  }

  const langCode = normalizeLanguage(language);
  const langName = getLanguageName(langCode || '') || language;
  debug(`Language: ${language} -> normalized: ${langCode} (${langName})`);
  debug(`Title length: ${title.length} chars`);
  debug(`Description length: ${description.length} chars`);

  const outputFormat = await getOutputFormat(options.output);

  await withSpinner(`Creating ${langName} localization...`, 'Failed to create localization', async (spinner) => {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    await putVideoLocalization(parsedId, language, title, description);

    // Spinner output goes to stderr, so machine formats stay pipeable.
    spinner.succeed(chalk.green(`Successfully created ${langName} (${langCode}) localization`));

    if (outputFormat !== 'pretty') {
      await writeStdout(formatData([{
        videoId: parsedId,
        language: langCode,
        languageName: langName,
        title,
        description,
        action: 'created',
      }], outputFormat) + '\n');
      return;
    }

    console.log('');
    console.log(chalk.gray(`Video ID: ${parsedId}`));
    const titlePreview = title.length > 60 ? title.substring(0, 60) + '...' : title;
    console.log(chalk.gray(`Title: ${titlePreview}`));
  });
}

export = putVideoLocalizationCommand;
