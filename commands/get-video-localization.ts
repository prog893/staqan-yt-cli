import ora from 'ora';
import chalk from 'chalk';
import { getVideoLocalization } from '../lib/youtube';
import { parseVideoId, error } from '../lib/utils';
import { LocalizationOptions } from '../types';

async function getVideoLocalizationCommand(videoId: string, options: LocalizationOptions): Promise<void> {
  const language = options.language; // Can be undefined, will default to main metadata language
  const langDisplay = language || 'main metadata language';
  const spinner = ora(`Fetching ${langDisplay} localization...`).start();

  try {
    const parsedId = parseVideoId(videoId);
    const localization = await getVideoLocalization(parsedId, language);

    spinner.succeed('Localization retrieved successfully');
    console.log('');

    if (options.json) {
      console.log(JSON.stringify(localization, null, 2));
    } else {
      const badge = localization.isMainLanguage ? chalk.yellow('[MAIN METADATA]') : chalk.gray('[LOCALIZATION]');
      console.log(chalk.bold.cyan(`${badge} ${localization.languageName} (${localization.language})\n`));

      console.log(chalk.bold('Title:'));
      console.log(localization.title);
      console.log('');

      console.log(chalk.bold('Description:'));
      console.log(localization.description);
      console.log('');
    }
  } catch (err) {
    spinner.fail('Failed to fetch localization');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getVideoLocalizationCommand;
