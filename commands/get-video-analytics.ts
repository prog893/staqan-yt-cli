import chalk from 'chalk';
import { parseVideoId, debug, formatNumber, convertToCSV, initCommand, withSpinner, validateDateOption, validateDateRange, runOrExit, writeStdout } from '../lib/utils';
import { fetchVideoAnalytics, emitViewCountingNotice } from '../lib/analytics';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

async function getVideoAnalyticsCommand(options: AnalyticsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  runOrExit(() => { if (options.startDate) validateDateOption('--start-date', options.startDate); });
  runOrExit(() => { if (options.endDate) validateDateOption('--end-date', options.endDate); });
  runOrExit(() => { if (options.startDate && options.endDate) validateDateRange(options.startDate, options.endDate); });

  const outputFormat = await getOutputFormat(options.output);

  await withSpinner('Fetching video information...', 'Failed to fetch analytics', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    // Data layer (lib/analytics.ts, shared with the MCP server — #102):
    // resolves the date range from the upload date, validates dimensions,
    // chunks into 90-day windows, aggregates rows.
    const result = await fetchVideoAnalytics({
      videoId: parsedId,
      startDate: options.startDate,
      endDate: options.endDate,
      metrics: options.metrics,
      dimensions: options.dimensions,
      onProgress: (message) => { spinner.text = message; },
    });

    const { title, dateRange, columnHeaders, rows: allRows } = result;
    const { startDate, endDate } = dateRange;

    spinner.succeed(`Retrieved ${allRows.length} row(s) of analytics data`);

    // #178: human-facing formats only, on stderr. See get-channel-analytics
    // for the reasoning. This command is the more exposed of the two, since
    // the default start date is the upload date, so every all-time query on a
    // video published before the change reaches back past it.
    emitViewCountingNotice(result.viewCountingNotice, outputFormat);

    // Prepare aggregated data for structured formats
    const aggregated: { [key: string]: number } = {};
    columnHeaders.forEach((header, index) => {
      const name = header.name || '';
      if (name === 'video') return;

      let total = 0;
      allRows.forEach(row => {
        const value = row[index];
        if (typeof value === 'number') {
          total += value;
        }
      });

      // For average metrics, divide by number of rows
      if (name.includes('average') || name.includes('Percentage')) {
        aggregated[name] = allRows.length > 0 ? total / allRows.length : 0;
      } else {
        aggregated[name] = total;
      }
    });

    switch (outputFormat) {
      case 'csv':
        if (allRows.length === 0) {
          process.stderr.write(chalk.yellow('⚠ No analytics data available for this time period.\n'));
          return;
        }
        await writeStdout(convertToCSV(columnHeaders, allRows) + '\n');
        break;

      case 'json':
        await writeStdout(formatJson({
          videoId: parsedId,
          title,
          dateRange: { startDate, endDate },
          columnHeaders,
          rows: allRows,
        }) + '\n');
        break;

      case 'table': {
        // Convert aggregated metrics to table format
        const tableData = Object.entries(aggregated).map(([name, value]) => ({
          metric: name,
          value: value.toString(),
        }));
        await writeStdout(formatTable(tableData) + '\n');
        break;
      }

      case 'text':
        // Tab-delimited output of aggregated metrics
        await writeStdout(
          Object.entries(aggregated).map(([name, value]) => [name, value].join('\t')).join('\n') + '\n'
        );
        break;

      case 'pretty':
      default:
        console.log('');
        console.log(chalk.bold.cyan(title));
        console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
        console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
        console.log('');

        if (allRows.length === 0) {
          console.log(chalk.yellow('No analytics data available for this time period.'));
          console.log('');
          return;
        }

        console.log(chalk.bold('Analytics Metrics (Aggregated):'));
        console.log('');

        Object.entries(aggregated).forEach(([name, value]) => {
          // Format metric name
          const formattedName = name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();

          // Format value
          let formattedValue: string;
          if (name.includes('Percentage')) {
            formattedValue = `${value.toFixed(2)}%`;
          } else if (name.includes('Duration') || name.includes('Minutes')) {
            formattedValue = formatNumber(Math.round(value));
          } else if (name.includes('average')) {
            formattedValue = value.toFixed(2);
          } else {
            formattedValue = formatNumber(Math.round(value));
          }

          console.log(chalk.gray(`  ${formattedName}: `) + chalk.white(formattedValue));
        });

        console.log('');
        console.log(chalk.dim(`Note: Aggregated from ${allRows.length} data point(s)`));
        console.log('');
        break;
    }
  });
}

export = getVideoAnalyticsCommand;
