import chalk from 'chalk';
import { listChannelPlaylists } from '../lib/youtube';
import { formatDate, formatNumber, debug, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat, requireChannel } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, LimitOption, VerboseOption } from '../types';

async function listPlaylistsCommand(channelHandle: string | undefined, options: OutputOption & LimitOption & VerboseOption): Promise<void> {
  initCommand(options);

  await withSpinner('Fetching channel playlists...', 'Failed to fetch playlists', async (spinner) => {
    const channel = await requireChannel(channelHandle);
    debug(`Using channel: ${channel}`);

    const limit = parseInt(options.limit || '50');
    debug(`Channel handle: ${channel}, limit: ${limit}`);

    const playlists = await listChannelPlaylists(channel, limit);

    spinner.succeed(`Found ${playlists.length} playlist(s)`);
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
          const privacyIndicator = playlist.privacyStatus === 'private'
            ? chalk.red(' [Private]')
            : playlist.privacyStatus === 'unlisted'
              ? chalk.yellow(' [Unlisted]')
              : '';
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(playlist.title) + privacyIndicator);
          console.log('  ID: ' + chalk.yellow(playlist.id));
          console.log('  Videos: ' + formatNumber(playlist.itemCount));
          console.log('  Published: ' + formatDate(playlist.publishedAt));
          console.log('  URL: ' + chalk.blue(`https://youtube.com/playlist?list=${playlist.id}`));
          console.log('');
        });
        break;
    }
  });
}

export = listPlaylistsCommand;
