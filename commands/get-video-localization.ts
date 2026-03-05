import chalk from 'chalk';
import { getVideoLocalization } from '../lib/youtube';
import { parseVideoId, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { LocalizationOptions } from '../types';

async function getVideoLocalizationCommand(videoId: string, options: LocalizationOptions): Promise<void> {
  initCommand(options);

  const language = options.language; // Can be undefined, will default to main metadata language
  const langDisplay = language || 'main metadata language';
  debug(`Requested language: ${langDisplay}`);

  await withSpinner(`Fetching ${langDisplay} localization...`, 'Failed to fetch localization', async (spinner) => {
    debug(`Video ID input: ${videoId}`);
    const parsedId = parseVideoId(videoId);
    debug(`Parsed video ID: ${parsedId}`);

    const localization = await getVideoLocalization(parsedId, language);

    spinner.succeed('Localization retrieved successfully');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(localization));
        break;

      case 'table':
        const tableData = [{
          language: localization.language,
          languageName: localization.languageName,
          title: localization.title,
          isMain: localization.isMainLanguage ? 'YES' : 'NO',
        }];
        console.log(formatTable(tableData));
        break;

      case 'text':
        console.log([
          localization.language,
          localization.languageName,
          localization.title,
          localization.isMainLanguage ? 'MAIN' : 'LOC'
        ].join('\t'));
        break;

      case 'csv':
        const csvData = [{
          language: localization.language,
          languageName: localization.languageName,
          title: localization.title,
          description: localization.description,
          isMain: localization.isMainLanguage ? 'YES' : 'NO',
        }];
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        const badge = localization.isMainLanguage ? chalk.yellow('[MAIN METADATA]') : chalk.gray('[LOCALIZATION]');
        console.log(chalk.bold.cyan(`${badge} ${localization.languageName} (${localization.language})\n`));

        console.log(chalk.bold('Title:'));
        console.log(localization.title);
        console.log('');

        console.log(chalk.bold('Description:'));
        console.log(localization.description);
        console.log('');
        break;
    }
  });
}

export = getVideoLocalizationCommand;
