const ora = require('ora');
const chalk = require('chalk');
const { updateVideoLocalization } = require('../lib/youtube');
const { parseVideoId, error } = require('../lib/utils');
const { normalizeLanguage, getLanguageName } = require('../lib/language');

async function updateVideoLocalizationCommand(videoId, options) {
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
  const langName = getLanguageName(langCode) || language;
  const spinner = ora(`Updating ${langName} localization...`).start();

  try {
    const parsedId = parseVideoId(videoId);
    await updateVideoLocalization(parsedId, language, title, description);

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
  } catch (err) {
    spinner.fail('Failed to update localization');
    console.log('');
    error(err.message);
    process.exit(1);
  }
}

module.exports = updateVideoLocalizationCommand;
