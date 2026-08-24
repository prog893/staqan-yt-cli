import chalk from 'chalk';
import { parseVideoId, parsePositiveInt, debug, formatNumber, convertToCSV, initCommand, withSpinner, toLocalYmd, daysAgoYmd, runOrExit, writeStdout } from '../lib/utils';
import { fetchSearchTerms, emitViewCountingNotice } from '../lib/analytics';
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
    // #178 view-counting caveat. This report sends a fixed metric set the
    // caller cannot widen, so the notice is the only way the ambiguity gets
    // flagged. Since #185 the set carries `engagedViews`, so the metric the
    // notice points at is actually present in the output.
    //
    // Human-facing formats only, on stderr, matching get-video-analytics and
    // get-channel-analytics: json/csv/table are what scripts read and a note
    // they cannot parse is noise there. MCP callers read `viewCountingNotice`
    // off the result instead.
    emitViewCountingNotice(result.viewCountingNotice, outputFormat);
    // Columns resolved by name, not position (#185 added engagedViews).
    const col = (name: string) => result.columnHeaders.findIndex(h => h.name === name);
    const idxTerm = Math.max(0, col('insightTrafficSourceDetail'));
    const idxViews = col('views');
    const idxEngaged = col('engagedViews');

    const searchTermsData = rows.map((row, index) => ({
      rank: index + 1,
      searchTerm: row[idxTerm] as string,
      views: (row[idxViews] as number) || 0,
      engagedViews: idxEngaged >= 0 ? (row[idxEngaged] as number) || 0 : 0,
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
        await writeStdout(searchTermsData.map(item => [item.rank, item.searchTerm, item.views, item.engagedViews].join('\t')).join('\n') + '\n');
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
      default: {
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
        let totalEngagedViews = 0;

        searchTermsData.forEach(item => {
          totalViews += item.views;
          totalEngagedViews += item.engagedViews;

          console.log(chalk.gray(`  ${item.rank}.`) + ` ${item.searchTerm}`);
          console.log(chalk.gray('      ') + chalk.cyan(`${formatNumber(item.views)} views`) +
            chalk.gray('  ') + chalk.cyan(`${formatNumber(item.engagedViews)} engaged`));
        });

        console.log('');
        // Scoped to the returned terms, not all search traffic: the query is
        // capped by --limit, so these sums cover only the rows above.
        console.log(chalk.bold(`Views from these ${searchTermsData.length} terms: `) + chalk.cyan(formatNumber(totalViews)));
        console.log(chalk.bold(`Engaged views from these ${searchTermsData.length} terms: `) + chalk.cyan(formatNumber(totalEngagedViews)));
        console.log('');
        break;
      }
    }
  });
}

export = getSearchTermsCommand;
