const ora = require('ora');
const chalk = require('chalk');
const { putVideoLocalization } = require('../lib/youtube');
const { parseVideoId, error } = require('../lib/utils');
const { normalizeLanguage, getLanguageName } = require('../lib/language');

async function putVideoLocalizationCommand(videoId, options) {
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
  const langName = getLanguageName(langCode) || language;
  const spinner = ora(`Creating ${langName} localization...`).start();

  try {
    const parsedId = parseVideoId(videoId);
    await putVideoLocalization(parsedId, language, title, description);

    spinner.succeed(chalk.green(`Successfully created ${langName} (${langCode}) localization`));
    console.log('');
    console.log(chalk.gray(`Video ID: ${parsedId}`));
    const titlePreview = title.length > 60 ? title.substring(0, 60) + '...' : title;
    console.log(chalk.gray(`Title: ${titlePreview}`));
  } catch (err) {
    spinner.fail('Failed to create localization');
    console.log('');
    error(err.message);
    process.exit(1);
  }
}

module.exports = putVideoLocalizationCommand;
