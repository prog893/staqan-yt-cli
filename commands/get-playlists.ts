import ora from 'ora';
import chalk from 'chalk';
import { getPlaylistsById } from '../lib/youtube';
import { formatDate, formatNumber, error, setVerbose, debug, parsePlaylistId } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, VerboseOption } from '../types';

async function getPlaylistsCommand(playlistIds: string[], options: OutputOption & VerboseOption): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching playlist information...').start();

  try {
    const parsedIds = playlistIds.map(parsePlaylistId);
    debug(`Parsing ${playlistIds.length} playlist ID(s)`, playlistIds);
    debug(`Parsed IDs:`, parsedIds);
    const playlists = await getPlaylistsById(parsedIds);

    spinner.succeed(`Retrieved information for ${playlists.length} playlist(s)`);
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

          console.log(chalk.bold.cyan(`[${index + 1}] ${playlist.title}`));
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
            const preview = description.length > 150
              ? description.substring(0, 150) + '...'
              : description;
            console.log('  ' + preview.replace(/\n/g, '\n  '));
            console.log('');
          }

          console.log(chalk.gray('URL:          ') + chalk.blue(`https://youtube.com/playlist?list=${playlist.id}`));
          console.log('');
        });
        break;
    }
  } catch (err) {
    spinner.fail('Failed to fetch playlist information');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getPlaylistsCommand;
