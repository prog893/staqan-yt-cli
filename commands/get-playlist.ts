import chalk from 'chalk';
import { getPlaylistInfo } from '../lib/youtube';
import { formatDate, formatNumber, debug, parsePlaylistId, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, VerboseOption, PlaylistIdOption, PlaylistIdsOption } from '../types';

async function getPlaylistCommand(options: OutputOption & VerboseOption & (PlaylistIdOption | PlaylistIdsOption)): Promise<void> {
  initCommand(options);

  // Dispatch: get-playlist passes --playlist-id (string), get-playlists passes --playlist-ids (string[])
  const playlistIds: string[] = 'playlistIds' in options && options['playlistIds']
    ? (options as PlaylistIdsOption).playlistIds!
    : [(options as PlaylistIdOption).playlistId!];

  await withSpinner('Fetching playlist information...', 'Failed to fetch playlist information', async (spinner) => {
    const parsedIds = playlistIds.map(parsePlaylistId);
    debug(`Fetching ${parsedIds.length} playlist(s)`, parsedIds);

    const playlists = await Promise.all(parsedIds.map(id => getPlaylistInfo(id)));

    spinner.succeed(`Retrieved ${playlists.length} playlist(s)`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(playlists.length === 1 ? playlists[0] : playlists));
        break;

      case 'table':
        const tableData = playlists.map(playlist => ({
          id: playlist.id,
          title: playlist.title,
          channel: playlist.channelTitle,
          items: playlist.itemCount,
          privacy: playlist.privacyStatus,
          published: formatDate(playlist.publishedAt),
        }));
        console.log(formatTable(tableData));
        break;

      case 'text':
        playlists.forEach(playlist => {
          console.log([
            playlist.id,
            playlist.title,
            playlist.channelId,
            playlist.channelTitle,
            playlist.itemCount,
            playlist.privacyStatus,
            playlist.publishedAt,
          ].join('\t'));
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
          if (index > 0) console.log(chalk.gray('─'.repeat(80)));
          console.log('');
          console.log(chalk.bold.cyan(playlist.title));
          console.log('');
          console.log(chalk.gray('Playlist ID:  ') + chalk.yellow(playlist.id));
          console.log(chalk.gray('Channel:      ') + playlist.channelTitle + chalk.gray(` (${playlist.channelId})`));
          console.log(chalk.gray('Videos:       ') + formatNumber(playlist.itemCount));
          console.log(chalk.gray('Privacy:      ') + playlist.privacyStatus);
          console.log(chalk.gray('Published:    ') + formatDate(playlist.publishedAt));
          console.log('');

          if (playlist.description) {
            console.log(chalk.bold('Description:'));
            const description = playlist.description;
            const preview = description.length > 200
              ? description.substring(0, 200) + '...'
              : description;
            console.log('  ' + preview.replace(/\n/g, '\n  '));
            console.log('');
          }

          console.log(chalk.gray('URL:          ') + chalk.blue(`https://youtube.com/playlist?list=${playlist.id}`));
          console.log('');
        });
        break;
    }
  });
}

export = getPlaylistCommand;
