import chalk from 'chalk';
import { parseVideoId, debug, formatNumber, convertToCSV, initCommand, withSpinner, toLocalYmd, daysAgoYmd, writeStdout } from '../lib/utils';
import { fetchTrafficSources, emitViewCountingNotice } from '../lib/analytics';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { TrafficSourcesOptions } from '../types';

async function getTrafficSourcesCommand(options: TrafficSourcesOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  await withSpinner('Fetching traffic sources...', 'Failed to fetch traffic sources', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    // CLI default: last 30 days (the MCP tool defaults to all-time — the
    // shared lib takes an explicit range so neither surface's documented
    // behavior changes; see lib/analytics.ts #102).
    const endDate = toLocalYmd(new Date());
    const startDate = daysAgoYmd(30);
    debug(`Date range: ${startDate} to ${endDate}`);

    const result = await fetchTrafficSources({ videoId: parsedId, startDate, endDate });
    const { title, columnHeaders, rows } = result;

    spinner.succeed('Traffic sources data retrieved');
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

    // Traffic source labels
    const sourceLabels: { [key: string]: string } = {
      'YT_SEARCH': 'YouTube Search',
      'RELATED_VIDEO': 'Suggested Videos',
      'EXTERNAL': 'External Sources',
      'BROWSE': 'Browse Features',
      'CHANNEL': 'Channel Page',
      'NOTIFICATION': 'Notifications',
      'PLAYLIST': 'Playlists',
      'SUBSCRIBER': 'Subscriber Feed',
      'CAMPAIGN_CARD': 'Campaign Card',
      'END_SCREEN': 'End Screen',
      'HASHTAGS': 'Hashtags',
      'LIVE_REDIRECT': 'Live Redirect',
      'NO_LINK_EMBEDDED': 'Embedded (No Link)',
      'NO_LINK_OTHER': 'Other (No Link)',
      'PRODUCT_PAGE': 'Product Page',
      'SHORTS': 'Shorts',
      'SOUND_PAGE': 'Sound Page',
      'STORIES': 'Stories',
    };

    // Resolve columns by name rather than position (#185 added engagedViews).
    // json and csv pass `rows` straight through, so they pick the new column
    // up on their own; only the derived shape below needs to know about it.
    const col = (name: string) => columnHeaders.findIndex(h => h.name === name);
    const idxSource = Math.max(0, col('insightTrafficSourceType'));
    const idxViews = col('views');
    const idxEngaged = col('engagedViews');

    let totalViews = 0;
    let totalEngagedViews = 0;
    rows.forEach(row => {
      totalViews += (row[idxViews] as number) || 0;
      if (idxEngaged >= 0) totalEngagedViews += (row[idxEngaged] as number) || 0;
    });

    const trafficData = rows.map(row => ({
      source: sourceLabels[row[idxSource] as string] || row[idxSource] as string,
      views: (row[idxViews] as number) || 0,
      engagedViews: idxEngaged >= 0 ? (row[idxEngaged] as number) || 0 : 0,
      percentage: totalViews > 0 ? (((row[idxViews] as number) || 0) / totalViews * 100).toFixed(2) : '0',
    }));

    switch (outputFormat) {
      case 'csv':
        if (columnHeaders.length > 0 && rows.length > 0) {
          await writeStdout(convertToCSV(columnHeaders, rows) + '\n');
        } else {
          await writeStdout(formatCsv(trafficData) + '\n');
        }
        break;

      case 'json':
        await writeStdout(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows,
        }) + '\n');
        break;

      case 'table':
        await writeStdout(formatTable(trafficData) + '\n');
        break;

      case 'text':
        await writeStdout(trafficData.map(item => [item.source, item.views, item.engagedViews, item.percentage].join('\t')).join('\n') + '\n');
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (rows.length === 0) {
          console.log(chalk.yellow('No traffic source data available for this time period.'));
          console.log('');
          return;
        }

        console.log(chalk.bold('Traffic Sources:'));
        console.log('');

        trafficData.forEach(item => {
          console.log(chalk.bold(`  ${item.source}:`));
          console.log(chalk.gray('    Views:      ') + chalk.cyan(formatNumber(item.views)));
          console.log(chalk.gray('    Engaged:    ') + chalk.cyan(formatNumber(item.engagedViews)));
          console.log(chalk.gray('    Percentage: ') + chalk.yellow(`${item.percentage}%`));
          console.log('');
        });

        console.log(chalk.bold('Total Views: ') + chalk.cyan(formatNumber(totalViews)));
        console.log(chalk.bold('Total Engaged Views: ') + chalk.cyan(formatNumber(totalEngagedViews)));
        console.log('');
        break;
    }
  });
}

export = getTrafficSourcesCommand;
