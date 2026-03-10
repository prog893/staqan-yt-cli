import chalk from 'chalk';
import { updateVideoLocalization } from '../lib/youtube';
import { parseVideoId, error, debug, initCommand, withSpinner } from '../lib/utils';
import { normalizeLanguage, getLanguageName } from '../lib/language';
import { UpdateLocalizationOptions } from '../types';

async function updateVideoLocalizationCommand(options: UpdateLocalizationOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options['video-id'];
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  const { language, title, description } = options;

  // Validation: Required language
  if (!language) {
    error('Error: --language is required');
    process.exit(1);
  }

  // Validation: At least one of title or description must be provided
  if (!title && !description) {
    error('Error: At least one of --title or --description must be provided');
    process.exit(1);
  }

  const langCode = normalizeLanguage(language);
  const langName = getLanguageName(langCode || '') || language;
  debug(`Language: ${language} -> normalized: ${langCode} (${langName})`);
  if (title) debug(`New title length: ${title.length} chars`);
  if (description) debug(`New description length: ${description.length} chars`);

  await withSpinner(`Updating ${langName} localization...`, 'Failed to update localization', async (spinner) => {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    await updateVideoLocalization(parsedId, language, title || null, description || null);

    spinner.succeed(chalk.green(`Successfully updated ${langName} (${langCode}) localization`));
    console.log('');
    console.log(chalk.gray(`Video ID: ${parsedId}`));
    if (title) {
      const titlePreview = title.length > 60 ? title.substring(0, 60) + '...' : title;
      console.log(chalk.gray(`New title: ${titlePreview}`));
    }
    if (description) {
      console.log(chalk.gray(`Description updated`));
    }
  });
}

export = updateVideoLocalizationCommand;
