import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, chunkDateRange, retryWithBackoff, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

interface BreakdownRow {
  dimensionValue: string;
  metrics: { [key: string]: number };
}

function aggregateByDimension(
  allRows: unknown[][],
  columnHeaders: { name?: string | null }[],
  dimension: string
): BreakdownRow[] {
  const dimensionColIndex = columnHeaders.findIndex(h => h.name === dimension);
  if (dimensionColIndex === -1) return [];

  // Group rows by dimension value
  const rowsByDimension = new Map<string, unknown[][]>();
  for (const row of allRows) {
    const dimValue = String(row[dimensionColIndex]);
    if (!rowsByDimension.has(dimValue)) {
      rowsByDimension.set(dimValue, []);
    }
    rowsByDimension.get(dimValue)!.push(row);
  }

  // Aggregate metrics within each group
  const breakdownRows: BreakdownRow[] = [];
  for (const [dimValue, rows] of rowsByDimension) {
    const metrics: { [key: string]: number } = {};
    columnHeaders.forEach((header, index) => {
      const name = header.name || '';
      if (name === dimension || name === 'video') return;

      let total = 0;
      rows.forEach(row => {
        const value = row[index];
        if (typeof value === 'number') total += value;
      });

      if (name.includes('average') || name.includes('Percentage')) {
        metrics[name] = rows.length > 0 ? total / rows.length : 0;
      } else {
        metrics[name] = total;
      }
    });
    breakdownRows.push({ dimensionValue: dimValue, metrics });
  }

  // Sort by views descending (or first numeric metric)
  const sortKey = 'views';
  breakdownRows.sort((a, b) => (b.metrics[sortKey] || 0) - (a.metrics[sortKey] || 0));

  return breakdownRows;
}

function formatMetricValue(name: string, value: number): string {
  if (name.includes('Percentage')) {
    return `${value.toFixed(2)}%`;
  } else if (name.includes('Duration') || name.includes('Minutes')) {
    return formatNumber(Math.round(value));
  } else if (name.includes('average')) {
    return value.toFixed(2);
  } else {
    return formatNumber(Math.round(value));
  }
}

function formatMetricName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

async function getVideoAnalyticsCommand(options: AnalyticsOptions): Promise<void> {
  initCommand(options);

  const videoId = options.videoId;
  if (!videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  await withSpinner('Fetching video information...', 'Failed to fetch analytics', async (spinner) => {
    const parsedId = parseVideoId(videoId);
    debug('Parsed video ID', parsedId);

    const dimension = options.dimension;

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });
    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });

    // Get video info for title and publish date
    const videoResponse = await youtube.videos.list({
      part: ['snippet'],
      id: [parsedId],
    });

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      spinner.fail('Video not found');
      error(`No video found with ID: ${parsedId}`);
      process.exit(1);
    }

    const video = videoResponse.data.items[0];
    const title = video.snippet?.title || 'Untitled';
    const publishedAt = video.snippet?.publishedAt;

    if (!publishedAt) {
      spinner.fail('Could not determine video publish date');
      error('Video publish date is missing');
      process.exit(1);
    }

    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate || publishedAt.split('T')[0];

    debug(`Date range: ${startDate} to ${endDate}`);

    const metrics = options.metrics || 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';

    // Use specified dimension, or default to 'video' for aggregate mode
    const apiDimensions = dimension || 'video';

    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);

    const allRows: unknown[][] = [];
    let columnHeaders: { name?: string | null }[] = [];

    for (let i = 0; i < dateChunks.length; i++) {
      const chunk = dateChunks[i];
      spinner.text = `Fetching chunk ${i + 1}/${dateChunks.length} (${chunk.start} to ${chunk.end})...`;

      const analyticsResponse = await retryWithBackoff(async () => {
        return await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate: chunk.start,
          endDate: chunk.end,
          metrics,
          dimensions: apiDimensions,
          filters: `video==${parsedId}`,
        });
      });

      if (i === 0 && analyticsResponse.data.columnHeaders) {
        columnHeaders = analyticsResponse.data.columnHeaders;
      }

      if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
        allRows.push(...analyticsResponse.data.rows);
      }
    }

    const outputFormat = await getOutputFormat(options.output);

    if (dimension) {
      // --- Breakdown mode ---
      spinner.succeed(`Retrieved ${allRows.length} row(s) of analytics data`);

      const breakdownRows = aggregateByDimension(allRows, columnHeaders, dimension);
      const metricNames = columnHeaders
        .map(h => h.name || '')
        .filter(name => name !== dimension && name !== 'video' && name !== '');

      switch (outputFormat) {
        case 'csv': {
          if (breakdownRows.length === 0) {
            process.stderr.write(chalk.yellow('⚠ No analytics data available for this time period.\n'));
            return;
          }
          // Build CSV with dimension + metric columns
          const csvHeaders = [{ name: dimension }, ...metricNames.map(n => ({ name: n }))];
          const csvRows = breakdownRows.map(br => [
            br.dimensionValue,
            ...metricNames.map(m => br.metrics[m] ?? 0),
          ]);
          console.log(convertToCSV(csvHeaders, csvRows));
          break;
        }

        case 'json':
          console.log(formatJson({
            videoId: parsedId,
            title,
            dateRange: { startDate, endDate },
            dimension,
            breakdown: breakdownRows.map(br => ({
              [dimension]: br.dimensionValue,
              ...br.metrics,
            })),
          }));
          break;

        case 'table': {
          const tableData = breakdownRows.map(br => {
            const row: Record<string, string> = { [dimension]: br.dimensionValue };
            metricNames.forEach(m => {
              row[m] = formatMetricValue(m, br.metrics[m] ?? 0);
            });
            return row;
          });
          console.log(formatTable(tableData));
          break;
        }

        case 'text':
          breakdownRows.forEach(br => {
            const values = [br.dimensionValue, ...metricNames.map(m => String(br.metrics[m] ?? 0))];
            console.log(values.join('\t'));
          });
          break;

        case 'pretty':
        default: {
          console.log('');
          console.log(chalk.bold.cyan(title));
          console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
          console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
          console.log(chalk.gray('Dimension: ') + chalk.magenta(dimension));
          console.log('');

          if (breakdownRows.length === 0) {
            console.log(chalk.yellow('No analytics data available for this time period.'));
            console.log('');
            return;
          }

          console.log(chalk.bold(`Analytics Breakdown by ${formatMetricName(dimension)}:`));
          console.log('');

          breakdownRows.forEach((br, i) => {
            const rank = chalk.dim(`${i + 1}.`);
            console.log(`${rank} ${chalk.bold(br.dimensionValue)}`);
            metricNames.forEach(name => {
              const formattedName = formatMetricName(name);
              const formattedValue = formatMetricValue(name, br.metrics[name] ?? 0);
              console.log(chalk.gray(`     ${formattedName}: `) + chalk.white(formattedValue));
            });
            console.log('');
          });

          console.log(chalk.dim(`Note: ${breakdownRows.length} ${dimension} value(s) from ${allRows.length} data point(s)`));
          console.log('');
          break;
        }
      }

    } else {
      // --- Aggregate mode (original behavior) ---
      spinner.succeed(`Retrieved ${allRows.length} row(s) of analytics data`);

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
          console.log(convertToCSV(columnHeaders, allRows));
          break;

        case 'json':
          console.log(formatJson({
            videoId: parsedId,
            title,
            dateRange: { startDate, endDate },
            columnHeaders,
            rows: allRows,
          }));
          break;

        case 'table': {
          const tableData = Object.entries(aggregated).map(([name, value]) => ({
            metric: name,
            value: value.toString(),
          }));
          console.log(formatTable(tableData));
          break;
        }

        case 'text':
          Object.entries(aggregated).forEach(([name, value]) => {
            console.log([name, value].join('\t'));
          });
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
            const formattedName = formatMetricName(name);
            const formattedValue = formatMetricValue(name, value);
            console.log(chalk.gray(`  ${formattedName}: `) + chalk.white(formattedValue));
          });

          console.log('');
          console.log(chalk.dim(`Note: Aggregated from ${allRows.length} data point(s)`));
          console.log('');
          break;
      }
    }
  });
}

export = getVideoAnalyticsCommand;
