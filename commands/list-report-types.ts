import { google } from 'googleapis';
import { getAuthenticatedClient } from '../lib/auth';
import { error, info, success, setVerbose, debug } from '../lib/utils';

interface ReportTypesOptions {
  output?: 'json' | 'table' | 'text';
  verbose?: boolean;
}

/**
 * List available YouTube Reporting API report types
 */
async function listReportTypesCommand(options: ReportTypesOptions): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

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

    // Output by category
    const output = options.output || 'table';

    switch (output) {
      case 'json':
        console.log(JSON.stringify({ reportTypes }, null, 2));
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

      default:
        // Table format
        console.log('Available Report Types:\n');
        reportTypes.forEach(rt => {
          console.log(`ID:     ${rt.id}`);
          console.log(`Name:   ${rt.name}`);
          console.log('');
        });
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
