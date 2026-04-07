import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, formatNumber, convertToCSV, chunkDateRange, retryWithBackoff, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable } from '../lib/formatters';
import { AnalyticsOptions } from '../types';

// Standard dimensions for --all (live-tested against YouTube Analytics API v2)
// Excluded: ageGroup/gender/sharingService (channel-level only, fail on video queries)
//           province/city (require extra geo filters)
//           month (requires date range spanning full calendar months)
const ALL_DIMENSIONS = [
  'country',
  'day',
  'deviceType',
  'operatingSystem',
  'subscribedStatus',
  'insightTrafficSourceType',
  'insightPlaybackLocationType',
  'liveOrOnDemand',
  'creatorContentType',
  'youtubeProduct',
];

interface BreakdownRow {
  dimensionValue: string;
  metrics: { [key: string]: number };
}

interface DimensionSection {
  dimension: string;
  rows: BreakdownRow[];
  metricNames: string[];
  totalDataPoints: number;
}

function aggregateByDimension(
  allRows: unknown[][],
  columnHeaders: { name?: string | null }[],
  dimension: string
): BreakdownRow[] {
  const dimensionColIndex = columnHeaders.findIndex(h => h.name === dimension);
  if (dimensionColIndex === -1) return [];

  const rowsByDimension = new Map<string, unknown[][]>();
  for (const row of allRows) {
    const dimValue = String(row[dimensionColIndex]);
    if (!rowsByDimension.has(dimValue)) {
      rowsByDimension.set(dimValue, []);
    }
    rowsByDimension.get(dimValue)!.push(row);
  }

  const viewsColIndex = columnHeaders.findIndex(h => h.name === 'views');

  const breakdownRows: BreakdownRow[] = [];
  for (const [dimValue, rows] of rowsByDimension) {
    const metrics: { [key: string]: number } = {};
    columnHeaders.forEach((header, index) => {
      const name = header.name || '';
      if (name === dimension || name === 'video') return;

      if (name.includes('average') || name.includes('Percentage')) {
        // Views-weighted average: sum(value * views) / sum(views)
        // Requires views column for accurate weighting
        if (viewsColIndex === -1) {
          throw new Error(`Metric "${name}" requires "views" to be included in the request`);
        }
        let weightedSum = 0;
        let totalViews = 0;
        rows.forEach(row => {
          const value = row[index];
          if (typeof value !== 'number') return;
          const rawViews = row[viewsColIndex];
          const viewCount = typeof rawViews === 'number' ? rawViews : 1;
          weightedSum += value * viewCount;
          totalViews += viewCount;
        });
        metrics[name] = totalViews > 0 ? weightedSum / totalViews : 0;
      } else {
        let total = 0;
        rows.forEach(row => {
          const value = row[index];
          if (typeof value === 'number') total += value;
        });
        metrics[name] = total;
      }
    });
    breakdownRows.push({ dimensionValue: dimValue, metrics });
  }

  breakdownRows.sort((a, b) => (b.metrics['views'] || 0) - (a.metrics['views'] || 0));
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

async function fetchDimensionSection(
  youtubeAnalytics: ReturnType<typeof google.youtubeAnalytics>,
  parsedId: string,
  dimension: string,
  metrics: string,
  dateChunks: { start: string; end: string }[],
  onProgress: () => void
): Promise<DimensionSection> {
  const allRows: unknown[][] = [];
  let columnHeaders: { name?: string | null }[] = [];

  for (let i = 0; i < dateChunks.length; i++) {
    const chunk = dateChunks[i];
    onProgress();

    const analyticsResponse = await retryWithBackoff(async () => {
      return await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate: chunk.start,
        endDate: chunk.end,
        metrics,
        dimensions: dimension,
        filters: `video==${parsedId}`,
      });
    });

    if (columnHeaders.length === 0 && analyticsResponse.data.columnHeaders) {
      columnHeaders = analyticsResponse.data.columnHeaders;
    }

    if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
      allRows.push(...analyticsResponse.data.rows);
    }
  }

  const breakdownRows = aggregateByDimension(allRows, columnHeaders, dimension);
  const metricNames = columnHeaders
    .map(h => h.name || '')
    .filter(name => name !== dimension && name !== 'video' && name !== '');

  return { dimension, rows: breakdownRows, metricNames, totalDataPoints: allRows.length };
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

    // Resolve effective dimensions (normalized and deduped)
    let effectiveDimensions: string[] = [];
    if (options.all && options.dimensions) {
      // Merge ALL_DIMENSIONS with explicit dimensions
      effectiveDimensions = [...ALL_DIMENSIONS, ...options.dimensions];
    } else if (options.all) {
      effectiveDimensions = ALL_DIMENSIONS;
    } else {
      effectiveDimensions = options.dimensions ?? [];
    }
    effectiveDimensions = [...new Set(effectiveDimensions.map(d => d.trim()))];

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

    // Validate dimensions before making any API requests
    const allowedVideoDimensions = new Set([
      'country', 'day', 'month', 'deviceType', 'operatingSystem',
      'subscribedStatus', 'insightTrafficSourceType', 'insightPlaybackLocationType',
      'liveOrOnDemand', 'creatorContentType', 'youtubeProduct'
    ]);

    const geoDimensionsRequiringFilters = new Set(['province', 'dma', 'city']);

    for (const dim of effectiveDimensions) {
      // Reject channel-only dimensions
      if (['ageGroup', 'gender', 'sharingService'].includes(dim)) {
        spinner.fail(`Invalid dimension: "${dim}"`);
        error(`Dimension "${dim}" is only available at channel level, not for video queries.`);
        error(`Use get-channel-analytics for channel-level demographic breakdowns.`);
        process.exit(1);
      }

      // Reject geo dimensions that require additional filters
      if (geoDimensionsRequiringFilters.has(dim)) {
        spinner.fail(`Invalid dimension: "${dim}"`);
        error(`Dimension "${dim}" requires additional geo filters not supported via CLI.`);
        error(`Use the YouTube Analytics API directly for this dimension.`);
        process.exit(1);
      }

      // Validate against allowed video dimensions
      if (!allowedVideoDimensions.has(dim)) {
        spinner.fail(`Unknown dimension: "${dim}"`);
        error(`Dimension "${dim}" is not supported for video-level queries.`);
        error(`Supported dimensions: ${[...allowedVideoDimensions].join(', ')}`);
        process.exit(1);
      }

      // Validate month dimension requires full calendar month date range
      if (dim === 'month') {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const isFullCalendarMonth =
          start.getUTCDate() === 1 &&
          (new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate() === end.getUTCDate() ||
           end >= new Date());

        if (!isFullCalendarMonth) {
          spinner.fail(`Invalid date range for "month" dimension`);
          error(`The "month" dimension requires the date range to span full calendar months.`);
          error(`Start date must be the 1st of a month and end date must be the last day of a month.`);
          process.exit(1);
        }
      }
    }

    // Breakdown dimensions only support a subset of metrics (engagement metrics
    // like likes/comments/shares are rejected by the API for most dimensions).
    // Use the safe intersection for breakdown mode; full set for aggregate.
    const DEFAULT_AGGREGATE_METRICS = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,dislikes,comments,shares';
    const DEFAULT_BREAKDOWN_METRICS = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage';
    const metrics = options.metrics || (effectiveDimensions.length > 0 ? DEFAULT_BREAKDOWN_METRICS : DEFAULT_AGGREGATE_METRICS);
    const dateChunks = chunkDateRange(startDate, endDate);
    debug(`Split into ${dateChunks.length} chunk(s) of 90 days`);

    const outputFormat = await getOutputFormat(options.output);

    // ── Breakdown mode ────────────────────────────────────────────────────────
    if (effectiveDimensions.length > 0) {
      const totalChunks = effectiveDimensions.length * dateChunks.length;
      let completedChunks = 0;
      spinner.text = `Fetching dimensions... (0/${totalChunks} chunks)`;

      const sections = await Promise.all(
        effectiveDimensions.map(dim =>
          fetchDimensionSection(
            youtubeAnalytics, parsedId, dim, metrics, dateChunks,
            () => {
              completedChunks++;
              spinner.text = `Fetching dimensions... (${completedChunks}/${totalChunks} chunks)`;
            }
          )
        )
      );

      spinner.succeed(`Retrieved breakdown for ${effectiveDimensions.length} dimension(s)`);

      const hasAnyData = sections.some(s => s.rows.length > 0);
      if (!hasAnyData) {
        process.stderr.write(chalk.yellow('⚠ No analytics data available for this time period.\n'));
        return;
      }

      switch (outputFormat) {
        case 'csv':
          for (const section of sections) {
            if (section.rows.length === 0) continue;
            // Section header as a comment row
            console.log(`# ${section.dimension}`);
            const csvHeaders = [{ name: section.dimension }, ...section.metricNames.map(n => ({ name: n }))];
            const csvRows = section.rows.map(br => [
              br.dimensionValue,
              ...section.metricNames.map(m => br.metrics[m] ?? 0),
            ]);
            console.log(convertToCSV(csvHeaders, csvRows));
            console.log('');
          }
          break;

        case 'json':
          console.log(formatJson({
            videoId: parsedId,
            title,
            dateRange: { startDate, endDate },
            breakdowns: sections.map(s => ({
              dimension: s.dimension,
              rows: s.rows.map(br => ({
                [s.dimension]: br.dimensionValue,
                ...br.metrics,
              })),
            })),
          }));
          break;

        case 'table':
          for (const section of sections) {
            console.log(chalk.bold(`\n── ${formatMetricName(section.dimension)} ──`));
            if (section.rows.length === 0) {
              console.log(chalk.yellow('  No data available.'));
              continue;
            }
            const tableData = section.rows.map(br => {
              const row: Record<string, string> = { [section.dimension]: br.dimensionValue };
              section.metricNames.forEach(m => {
                row[m] = formatMetricValue(m, br.metrics[m] ?? 0);
              });
              return row;
            });
            console.log(formatTable(tableData));
          }
          break;

        case 'text':
          for (const section of sections) {
            if (section.rows.length === 0) continue;
            console.log('# ' + [section.dimension, ...section.metricNames].join('\t'));
            section.rows.forEach(br => {
              const values = [br.dimensionValue, ...section.metricNames.map(m => String(br.metrics[m] ?? 0))];
              console.log(values.join('\t'));
            });
          }
          break;

        case 'pretty':
        default: {
          console.log('');
          console.log(chalk.bold.cyan(title));
          console.log(chalk.gray('Video ID: ') + chalk.yellow(parsedId));
          console.log(chalk.gray('Date Range: ') + `${startDate} to ${endDate}`);
          if (options.all) {
            console.log(chalk.gray('Mode: ') + chalk.magenta('--all (standard dimensions)'));
          }
          console.log('');

          for (const section of sections) {
            console.log(chalk.bold.underline(`Breakdown by ${formatMetricName(section.dimension)}`));
            console.log('');

            if (section.rows.length === 0) {
              console.log(chalk.yellow('  No data available for this dimension.'));
              console.log('');
              continue;
            }

            section.rows.forEach((br, i) => {
              const rank = chalk.dim(`${i + 1}.`);
              console.log(`${rank} ${chalk.bold(br.dimensionValue)}`);
              section.metricNames.forEach(name => {
                const formattedName = formatMetricName(name);
                const formattedValue = formatMetricValue(name, br.metrics[name] ?? 0);
                console.log(chalk.gray(`     ${formattedName}: `) + chalk.white(formattedValue));
              });
              console.log('');
            });

            console.log(chalk.dim(`  ${section.rows.length} value(s) from ${section.totalDataPoints} data point(s)`));
            console.log('');
          }
          break;
        }
      }

    // ── Aggregate mode (no dimensions) ───────────────────────────────────────
    } else {
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
            dimensions: 'video',
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

      spinner.succeed(`Retrieved ${allRows.length} row(s) of analytics data`);

      const viewsColIndex = columnHeaders.findIndex(h => h.name === 'views');
      const aggregated: { [key: string]: number } = {};
      columnHeaders.forEach((header, index) => {
        const name = header.name || '';
        if (name === 'video') return;

        if (name.includes('average') || name.includes('Percentage')) {
          // Views-weighted average: sum(value * views) / sum(views)
          // Requires views column for accurate weighting
          if (viewsColIndex === -1) {
            throw new Error(`Metric "${name}" requires "views" to be included in the request`);
          }
          let weightedSum = 0;
          let totalViews = 0;
          allRows.forEach(row => {
            const value = row[index];
            if (typeof value !== 'number') return;
            const rawViews = row[viewsColIndex];
            const viewCount = typeof rawViews === 'number' ? rawViews : 1;
            weightedSum += value * viewCount;
            totalViews += viewCount;
          });
          aggregated[name] = totalViews > 0 ? weightedSum / totalViews : 0;
        } else {
          let total = 0;
          allRows.forEach(row => {
            const value = row[index];
            if (typeof value === 'number') total += value;
          });
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
