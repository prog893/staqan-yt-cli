import chalk from 'chalk';
import { putVideoLocalization } from '../lib/youtube';
import { parseVideoId, error, debug, initCommand, withSpinner } from '../lib/utils';
import { normalizeLanguage, getLanguageName } from '../lib/language';
import { PutLocalizationOptions } from '../types';

async function putVideoLocalizationCommand(options: PutLocalizationOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options['video-id'];
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  const { language, title, description } = options;

  // Validation: Required options
  if (!language) {
    error('Error: --language is required');
    process.exit(1);
  }

  if (!title) {
    error('Error: --title is required');
    process.exit(1);
  }

  if (!description) {
    error('Error: --description is required');
    process.exit(1);
  }

  const langCode = normalizeLanguage(language);
  const langName = getLanguageName(langCode || '') || language;
  debug(`Language: ${language} -> normalized: ${langCode} (${langName})`);
  debug(`Title length: ${title.length} chars`);
  debug(`Description length: ${description.length} chars`);

  await withSpinner(`Creating ${langName} localization...`, 'Failed to create localization', async (spinner) => {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    await putVideoLocalization(parsedId, language, title, description);

    spinner.succeed(chalk.green(`Successfully created ${langName} (${langCode}) localization`));
    console.log('');
    console.log(chalk.gray(`Video ID: ${parsedId}`));
    const titlePreview = title.length > 60 ? title.substring(0, 60) + '...' : title;
    console.log(chalk.gray(`Title: ${titlePreview}`));
  });
}

export = putVideoLocalizationCommand;
