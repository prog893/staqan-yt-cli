import chalk from 'chalk';
import { listChannelPlaylists } from '../lib/youtube';
import { formatDate, formatNumber, debug, initCommand, withSpinner, validatePrivacyFilter } from '../lib/utils';
import { getOutputFormat, requireChannel } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ChannelOption, OutputOption, LimitOption, VerboseOption, PrivacyFilterOption } from '../types';

async function listPlaylistsCommand(options: ChannelOption & OutputOption & LimitOption & VerboseOption & PrivacyFilterOption): Promise<void> {
  initCommand(options);
  validatePrivacyFilter(options.privacy);

  await withSpinner('Fetching channel playlists...', 'Failed to fetch playlists', async (spinner) => {
    const channel = await requireChannel(options.channel);
    debug(`Using channel: ${channel}`);

    const limit = parseInt(options.limit || '50');
    debug(`Channel handle: ${channel}, limit: ${limit}`);

    let playlists = await listChannelPlaylists(channel, limit);
    const totalFetched = playlists.length;

    // Filter by privacy status if specified
    if (options.privacy && options.privacy.length > 0) {
      const privacyFilter = options.privacy;
      debug(`Filtering by privacy: ${privacyFilter.join(', ')}`);
      playlists = playlists.filter(p => privacyFilter.includes(p.privacyStatus));
    }

    const filterSuffix = totalFetched !== playlists.length
      ? ` (${totalFetched - playlists.length} filtered by privacy)`
      : '';
    spinner.succeed(`Found ${playlists.length} playlist(s)${filterSuffix}`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(playlists));
        break;

      case 'table':
        const tableData = playlists.map(playlist => ({
          id: playlist.id,
          title: playlist.title,
          items: playlist.itemCount,
          privacy: playlist.privacyStatus,
          published: formatDate(playlist.publishedAt),
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        playlists.forEach(playlist => {
          console.log([playlist.id, playlist.title, playlist.itemCount, playlist.privacyStatus, playlist.publishedAt].join('\t'));
        });
        break;

      case 'csv':
        const csvData = playlists.map(playlist => ({
          id: playlist.id,
          title: playlist.title,
          description: playlist.description,
          channelId: playlist.channelId,
          channelTitle: playlist.channelTitle,
          itemCount: playlist.itemCount,
          privacyStatus: playlist.privacyStatus,
          publishedAt: playlist.publishedAt,
        }));
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        playlists.forEach((playlist, index) => {
          const privacyColor = playlist.privacyStatus === 'public' ? chalk.green : playlist.privacyStatus === 'private' ? chalk.red : chalk.yellow;
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(playlist.title));
          console.log('  ID: ' + chalk.yellow(playlist.id));
          console.log('  Videos: ' + formatNumber(playlist.itemCount));
          console.log('  Published: ' + formatDate(playlist.publishedAt));
          console.log('  Privacy: ' + privacyColor(playlist.privacyStatus));
          console.log('  URL: ' + chalk.blue(`https://youtube.com/playlist?list=${playlist.id}`));
          console.log('');
        });
        break;
    }
  });
}

export = listPlaylistsCommand;
