import { google } from 'googleapis';
import chalk from 'chalk';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, success, initCommand } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';

interface ReportTypesOptions {
  output?: 'json' | 'table' | 'text' | 'csv' | 'pretty';
  verbose?: boolean;
}

/**
 * List available YouTube Reporting API report types
 */
async function listReportTypesCommand(options: ReportTypesOptions): Promise<void> {
  initCommand(options);

  const auth = await getAuthenticatedClient();
  const youtubeReporting = google.youtubereporting({ version: 'v1', auth });

  try {
    info('Fetching available report types...\n');

    const response = await youtubeReporting.reportTypes.list({
      onBehalfOfContentOwner: undefined,
    });

    const reportTypes = response.data.reportTypes || [];

    if (reportTypes.length === 0) {
      error('No report types found for this channel.');
      return;
    }

    success(`Found ${reportTypes.length} report type(s)\n`);

    // Group report types by category
    const grouped = reportTypes.reduce((acc: Record<string, typeof reportTypes>, rt: typeof reportTypes[0]) => {
      const category = rt.id?.split('_')[0] || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(rt);
      return acc;
    }, {});

    // Determine output format
    const outputFormat = await getOutputFormat(options.output);

    // Output based on format
    switch (outputFormat) {
      case 'json':
        console.log(formatJson({ reportTypes }));
        break;

      case 'csv':
        console.log(formatCsv(reportTypes.map(rt => ({
          id: rt.id || '',
          name: rt.name || '',
        }))));
        break;

      case 'text':
        Object.entries(grouped).forEach(([category, types]) => {
          console.log(`\n${category.toUpperCase()}:`);
          (types as typeof reportTypes).forEach(rt => {
            console.log(`  ${rt.id}`);
            console.log(`    Name: ${rt.name}`);
            console.log('');
          });
        });
        break;

      case 'table':
        console.log(formatTable(reportTypes.map(rt => ({
          id: rt.id || '',
          name: rt.name || '',
        }))));
        break;

      case 'pretty':
      default:
        // Pretty format with colors
        reportTypes.forEach(rt => {
          console.log(chalk.cyan(rt.id || ''));
          console.log(chalk.gray('  Name:') + ' ' + (rt.name || ''));
          console.log('');
        });
        break;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    error(`Failed to fetch report types: ${message}`);

    if (message.includes('API not enabled')) {
      error('\nYouTube Reporting API is not enabled.');
      error('Enable it at: https://console.developers.google.com/apis/api/youtubereporting.googleapis.com');
    }

    process.exit(1);
  }
}

export = listReportTypesCommand;
