import chalk from 'chalk';
import { getAllVideoLocalizations } from '../lib/youtube';
import { parseVideoId, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { LocalizationOptions, VideoLocalization } from '../types';

async function getVideoLocalizations(videoIds: string[], options: LocalizationOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching video localizations...', 'Failed to fetch video localizations', async (spinner) => {
    debug(`Parsing ${videoIds.length} video ID(s)`, videoIds);
    const parsedIds = videoIds.map(parseVideoId);
    debug('Parsed video IDs', parsedIds);

    // Parse language filter if provided
    let languageFilter: string[] | null = null;
    if (options.languages) {
      languageFilter = options.languages.split(',').map(lang => lang.trim());
      debug('Language filter', languageFilter);
    }

    // Fetch localizations for all videos
    const results: { videoId: string; localizations: VideoLocalization[] }[] = [];

    for (const videoId of parsedIds) {
      debug(`Fetching localizations for video: ${videoId}`);
      const localizations = await getAllVideoLocalizations(videoId, languageFilter);
      debug(`Retrieved ${localizations.length} localization(s) for ${videoId}`);
      results.push({ videoId, localizations });
    }

    const totalLocalizations = results.reduce((sum, result) => sum + result.localizations.length, 0);
    spinner.succeed(`Retrieved ${totalLocalizations} localization(s) from ${results.length} video(s)`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        // For JSON output, format as object with videoId as key
        const jsonOutput: { [videoId: string]: VideoLocalization[] } = {};
        results.forEach(result => {
          jsonOutput[result.videoId] = result.localizations;
        });
        console.log(formatJson(jsonOutput));
        break;

      case 'table':
        // Flatten for table view
        const tableData: Array<{videoId: string; language: string; languageName: string; title: string; isMain: string}> = [];
        results.forEach(result => {
          result.localizations.forEach(loc => {
            tableData.push({
              videoId: result.videoId,
              language: loc.language,
              languageName: loc.languageName,
              title: loc.title,
              isMain: loc.isMainLanguage ? 'YES' : 'NO',
            });
          });
        });
        console.log(formatTable(tableData));
        break;

      case 'text':
        // Tab-delimited output
        results.forEach(result => {
          result.localizations.forEach(loc => {
            console.log([result.videoId, loc.language, loc.languageName, loc.title, loc.isMainLanguage ? 'MAIN' : 'LOC'].join('\t'));
          });
        });
        break;

      case 'csv':
        // Flatten for CSV output
        const csvData: Array<{videoId: string; language: string; languageName: string; title: string; isMain: string}> = [];
        results.forEach(result => {
          result.localizations.forEach(loc => {
            csvData.push({
              videoId: result.videoId,
              language: loc.language,
              languageName: loc.languageName,
              title: loc.title,
              isMain: loc.isMainLanguage ? 'YES' : 'NO',
            });
          });
        });
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        // For human-readable output, show each video separately
        results.forEach((result, index) => {
          if (index > 0) console.log(chalk.gray('─'.repeat(80)) + '\n');

          console.log(chalk.bold.cyan(`Localizations for video: ${result.videoId}\n`));

          result.localizations.forEach(loc => {
            const badge = loc.isMainLanguage ? chalk.yellow('[MAIN]') : chalk.gray('[LOCALIZATION]');
            console.log(chalk.bold(`${badge} ${loc.languageName} (${loc.language})`));
            console.log(chalk.gray('  Title:      ') + loc.title);
            const descPreview = loc.description.length > 100
              ? loc.description.substring(0, 100) + '...'
              : loc.description;
            console.log(chalk.gray('  Description:') + ' ' + descPreview);
            console.log('');
          });
        });
        break;
    }
  });
}

export = getVideoLocalizations;
