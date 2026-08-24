import chalk from 'chalk';
import { parsePositiveInt, debug, formatNumber, convertToCSV, initCommand, withSpinner, validateDateOption, validateDateRange, runOrExit, writeStdout } from '../lib/utils';
import { getOutputFormat, requireChannel } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import {
  fetchChannelSearchTerms,
  validateContentType,
  ALL_TIME_START_DATE,
  CHANNEL_SEARCH_TERMS_MAX_VIDEOS,
  emitViewCountingNotice,
} from '../lib/analytics';
import { ChannelSearchTermsOptions } from '../types';

async function getChannelSearchTermsCommand(options: ChannelSearchTermsOptions): Promise<void> {
  initCommand(options);

  const rawLimit = runOrExit(() => parsePositiveInt('--limit', options.limit, 25));
  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  // Validate --content-type against the allowlist before spending any API
  // quota. The type is already narrowed in types/index.ts, but commander.js
  // passes arbitrary strings through at runtime, so an unknown value would
  // otherwise silently fall through to the 'all' branch.
  runOrExit(() => validateContentType(options.contentType));

  await withSpinner('Resolving channel...', 'Failed to fetch channel search terms', async (spinner) => {
    // Resolve channel from arg or config default
    const channel = await requireChannel(options.channel);
    debug(`Using channel: ${channel}`);

    // Shared data layer (lib/analytics.ts, #102) — same code path as the
    // MCP tool; the #88/#90 client-side Shorts duration filter lives there.
    const result = await fetchChannelSearchTerms({
      channel,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: rawLimit,
      contentType: options.contentType,
      onProgress: (message) => { spinner.text = message; },
    });

    spinner.succeed('Search terms data retrieved');
    console.log('');

    const outputFormat = await getOutputFormat(options.output);
    // #178 view-counting caveat. SEARCH_TERMS_METRICS is fixed and the caller
    // cannot widen it, so the notice is the only flag on the ambiguity. Since
    // #185 that set carries `engagedViews`, so the metric the notice points at
    // is present in the output.
    //
    // Human-facing formats only, on stderr, matching get-video-analytics and
    // get-channel-analytics: json/csv/table are what scripts read and a note
    // they cannot parse is noise there. MCP callers read `viewCountingNotice`
    // off the result instead.
    emitViewCountingNotice(result.viewCountingNotice, outputFormat);
    const { channelId, channelTitle, videosAnalyzed, columnHeaders, rows } = result;
    const { startDate, endDate } = result.dateRange;
    const isLifetime = startDate === ALL_TIME_START_DATE;

    debug(`Retrieved ${rows.length} row(s)`);

    // Map column indices by name for structured output
    const colIndex = (name: string) =>
      columnHeaders.findIndex(h => h.name === name);

    const idxTerm    = colIndex('insightTrafficSourceDetail');
    const idxViews   = colIndex('views');
    const idxEngaged = colIndex('engagedViews');
    const idxWatch   = colIndex('estimatedMinutesWatched');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredRows = rows.map((row: any[]) => ({
      rank: 0,           // filled below
      searchTerm:        row[idxTerm]  as string,
      views:             row[idxViews] as number,
      engagedViews:      idxEngaged >= 0 ? row[idxEngaged] as number : 0,
      watchTimeMinutes:  idxWatch >= 0 ? row[idxWatch] as number : 0,
    }));

    structuredRows.forEach((r, i) => { r.rank = i + 1; });

    const contentTypeLabel =
      options.contentType === 'video'  ? 'Regular videos only' :
      options.contentType === 'shorts' ? 'Shorts only' :
      'All content';

    const videoCountNote = videosAnalyzed >= CHANNEL_SEARCH_TERMS_MAX_VIDEOS
      ? ` (first ${CHANNEL_SEARCH_TERMS_MAX_VIDEOS} videos)`
      : ` (${videosAnalyzed} videos)`;

    switch (outputFormat) {
      case 'json':
        await writeStdout(formatJson({
          channelId,
          channelTitle,
          contentType: contentTypeLabel,
          period: isLifetime ? 'lifetime' : 'custom',
          videosAnalyzed,
          dateRange: { startDate, endDate },
          columnHeaders: columnHeaders.map(h => h.name),
          rows,
        }) + '\n');
        break;

      case 'table':
        await writeStdout(formatTable(structuredRows) + '\n');
        break;

      case 'text':
        // Header and rows in one write so the whole payload is flushed together.
        await writeStdout(
          [
            ['rank', 'searchTerm', 'views', 'engagedViews', 'watchTimeMinutes'].join('\t'),
            ...structuredRows.map(r => [r.rank, r.searchTerm, r.views, r.engagedViews, r.watchTimeMinutes].join('\t')),
          ].join('\n') + '\n'
        );
        break;

      case 'csv':
        if (columnHeaders.length > 0 && rows.length > 0) {
          await writeStdout(convertToCSV(columnHeaders, rows) + '\n');
        } else {
          await writeStdout(formatCsv(structuredRows) + '\n');
        }
        break;

      case 'pretty':
      default: {
        if (channelTitle) {
          console.log(chalk.bold.cyan(channelTitle));
          console.log(chalk.gray('Channel ID: ') + chalk.yellow(channelId));
        } else {
          console.log(chalk.bold.cyan(channelId));
        }
        console.log(chalk.gray('Period:         ') + chalk.white(isLifetime ? 'Lifetime' : `${startDate} → ${endDate}`));
        console.log(chalk.gray('Content type:   ') + chalk.white(contentTypeLabel));
        console.log(chalk.gray('Traffic source: ') + chalk.white('YouTube Search'));
        console.log(chalk.gray('Videos covered: ') + chalk.white(`${videosAnalyzed}${videosAnalyzed >= CHANNEL_SEARCH_TERMS_MAX_VIDEOS ? ' (capped at 500)' : ''}`));
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No search terms data available.'));
          console.log(chalk.gray('This could mean:'));
          console.log(chalk.gray('  - Channel hasn\'t received traffic from YouTube search'));
          console.log(chalk.gray('  - Analytics data not yet available'));
          console.log('');
          return;
        }

        console.log(chalk.bold(`Top Search Terms (${rows.length}${videoCountNote}):`));
        console.log('');

        let totalViews = 0;
        let totalEngagedViews = 0;
        structuredRows.forEach(r => { totalViews += r.views; totalEngagedViews += r.engagedViews; });

        structuredRows.forEach(r => {
          const pct = totalViews > 0 ? ((r.views / totalViews) * 100).toFixed(1) : '0.0';

          console.log(chalk.gray(`  ${r.rank}.`) + ' ' + chalk.white.bold(r.searchTerm));
          console.log(
            chalk.gray('      Views:      ') + chalk.cyan(formatNumber(r.views)) +
            chalk.gray(` (${pct}% of search traffic)`)
          );
          console.log(
            chalk.gray('      Engaged:    ') + chalk.cyan(formatNumber(r.engagedViews))
          );
          if (r.watchTimeMinutes > 0) {
            const watchHours = (r.watchTimeMinutes / 60).toFixed(0);
            console.log(chalk.gray('      Watch time:  ') + chalk.cyan(`${formatNumber(parseInt(watchHours, 10))}h`));
          }
          console.log('');
        });

        // Scoped to the returned terms. The API caps this report at
        // CHANNEL_SEARCH_TERMS_MAX_RESULTS, so these are not channel totals.
        console.log(chalk.bold(`Views from these ${structuredRows.length} terms: `) + chalk.cyan(formatNumber(totalViews)));
        console.log(chalk.bold(`Engaged views from these ${structuredRows.length} terms: `) + chalk.cyan(formatNumber(totalEngagedViews)));
        console.log('');
        break;
      }
    }
  });
}

export = getChannelSearchTermsCommand;
