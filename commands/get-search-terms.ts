import chalk from 'chalk';
import { parseVideoId, parsePositiveInt, debug, formatNumber, convertToCSV, initCommand, withSpinner, toLocalYmd, daysAgoYmd, runOrExit, writeStdout } from '../lib/utils';
import { fetchSearchTerms } from '../lib/analytics';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { SearchTermsOptions } from '../types';

async function getSearchTermsCommand(options: SearchTermsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  const limit = runOrExit(() => parsePositiveInt('--limit', options.limit, 50));

  await withSpinner('Fetching search terms...', 'Failed to fetch search terms', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    // CLI default: last 30 days (MCP defaults to all-time; the shared lib
    // takes an explicit range — see lib/analytics.ts #102).
    const endDate = toLocalYmd(new Date());
    const startDate = daysAgoYmd(30);
    debug(`Date range: ${startDate} to ${endDate}`);

    const result = await fetchSearchTerms({ videoId: parsedId, startDate, endDate, limit });
    const { title, rows } = result;

    spinner.succeed('Search terms data retrieved');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);
    const searchTermsData = rows.map((row, index) => ({
      rank: index + 1,
      searchTerm: row[0] as string,
      views: row[1] as number,
    }));

    switch (outputFormat) {
      case 'json':
        await writeStdout(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders: result.columnHeaders,
          rows,
        }) + '\n');
        break;

      case 'table':
        await writeStdout(formatTable(searchTermsData) + '\n');
        break;

      case 'text':
        await writeStdout(searchTermsData.map(item => [item.rank, item.searchTerm, item.views].join('\t')).join('\n') + '\n');
        break;

      case 'csv':
        // Use convertToCSV for consistency with analytics commands
        if (result.columnHeaders.length > 0 && rows.length > 0) {
          await writeStdout(convertToCSV(result.columnHeaders, rows) + '\n');
        } else {
          await writeStdout(formatCsv(searchTermsData) + '\n');
        }
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No search terms data available for this time period.'));
          console.log(chalk.gray('This could mean:'));
          console.log(chalk.gray('  - Video hasn\'t received traffic from YouTube search'));
          console.log(chalk.gray('  - Analytics data not yet available (48-hour delay)'));
          console.log('');
          return;
        }

        console.log(chalk.bold(`Top Search Terms (${rows.length}):`));
        console.log('');

        let totalViews = 0;

        rows.forEach((row, index) => {
          const searchTerm = row[0] as string;
          const views = row[1] as number;
          totalViews += views;

          console.log(chalk.gray(`  ${index + 1}.`) + ` ${searchTerm}`);
          console.log(chalk.gray('      ') + chalk.cyan(`${formatNumber(views)} views`));
        });

        console.log('');
        console.log(chalk.bold('Total views from search: ') + chalk.cyan(formatNumber(totalViews)));
        console.log('');
        break;
    }
  });
}

export = getSearchTermsCommand;
