import ora from 'ora';
import chalk from 'chalk';
import { getAllVideoLocalizations } from '../lib/youtube';
import { parseVideoId, error, setVerbose, debug } from '../lib/utils';
import { shouldUseJson } from '../lib/config';
import { LocalizationOptions, VideoLocalization } from '../types';

async function getVideoLocalizations(videoIds: string[], options: LocalizationOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching video localizations...').start();

  try {
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

    const useJson = await shouldUseJson(options.json);
    if (useJson) {
      // For JSON output, format as object with videoId as key
      const jsonOutput: { [videoId: string]: VideoLocalization[] } = {};
      results.forEach(result => {
        jsonOutput[result.videoId] = result.localizations;
      });
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
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
    }
  } catch (err) {
    spinner.fail('Failed to fetch video localizations');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getVideoLocalizations;
