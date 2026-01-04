import ora from 'ora';
import chalk from 'chalk';
import { getAllVideoLocalizations } from '../lib/youtube';
import { parseVideoId, error, setVerbose, debug } from '../lib/utils';
import { LocalizationOptions } from '../types';

async function getVideoLocalizations(videoId: string, options: LocalizationOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video localizations...').start();

  try {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    // Parse language filter if provided
    let languageFilter: string[] | null = null;
    if (options.languages) {
      languageFilter = options.languages.split(',').map(lang => lang.trim());
      debug('Language filter', languageFilter);
    }

    const localizations = await getAllVideoLocalizations(parsedId, languageFilter);

    spinner.succeed(`Retrieved ${localizations.length} localization(s)`);
    console.log('');

    if (options.json) {
      console.log(JSON.stringify(localizations, null, 2));
    } else {
      console.log(chalk.bold.cyan(`Localizations for video: ${parsedId}\n`));

      localizations.forEach(loc => {
        const badge = loc.isMainLanguage ? chalk.yellow('[MAIN]') : chalk.gray('[LOCALIZATION]');
        console.log(chalk.bold(`${badge} ${loc.languageName} (${loc.language})`));
        console.log(chalk.gray('  Title:      ') + loc.title);
        const descPreview = loc.description.length > 100
          ? loc.description.substring(0, 100) + '...'
          : loc.description;
        console.log(chalk.gray('  Description:') + ' ' + descPreview);
        console.log('');
      });
    }
  } catch (err) {
    spinner.fail('Failed to fetch video localizations');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getVideoLocalizations;
