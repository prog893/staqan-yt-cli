import chalk from 'chalk';
import { initCommand, withSpinner, writeStdout } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { fetchReportTypes, ReportTypeInfo } from '../lib/reports';

interface ReportTypesOptions {
  output?: 'json' | 'table' | 'text' | 'csv' | 'pretty';
  verbose?: boolean;
}

/**
 * List available YouTube Reporting API report types
 */
async function listReportTypesCommand(options: ReportTypesOptions): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching available report types...', 'Failed to fetch report types', async (spinner) => {
    // Shared data layer (lib/reports.ts, #102) — same code path as the MCP tool.
    const reportTypes = await fetchReportTypes();

    if (reportTypes.length === 0) {
      spinner.info('No report types found for this channel.');
      return;
    }

    spinner.succeed(`Found ${reportTypes.length} report type(s)`);
    console.log('');

    // Group report types by category
    const grouped = reportTypes.reduce((acc: Record<string, ReportTypeInfo[]>, rt) => {
      const category = rt.id.split('_')[0] || 'other';
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
        await writeStdout(formatJson({ reportTypes }) + '\n');
        break;

      case 'csv':
        await writeStdout(formatCsv(reportTypes) + '\n');
        break;

      case 'text':
        Object.entries(grouped).forEach(([category, types]) => {
          console.log(`\n${category.toUpperCase()}:`);
          types.forEach(rt => {
            console.log(`  ${rt.id}`);
            console.log(`    Name: ${rt.name}`);
            console.log('');
          });
        });
        break;

      case 'table':
        await writeStdout(formatTable(reportTypes) + '\n');
        break;

      case 'pretty':
      default:
        // Pretty format with colors
        reportTypes.forEach(rt => {
          console.log(chalk.cyan(rt.id));
          console.log(chalk.gray('  Name:') + ' ' + rt.name);
          console.log('');
        });
        break;
    }
  });
}

export = listReportTypesCommand;
