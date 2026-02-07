import ora from 'ora';
import chalk from 'chalk';
import { listChannelPlaylists } from '../lib/youtube';
import { formatDate, formatNumber, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, LimitOption, VerboseOption } from '../types';

async function listPlaylistsCommand(channelHandle: string | undefined, options: OutputOption & LimitOption & VerboseOption): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  const spinner = ora('Fetching channel playlists...').start();

  try {
    // Use provided channelHandle or load from config
    let channel = channelHandle;
    if (!channel) {
      channel = await getConfigValue('default.channel');
      if (!channel) {
        spinner.fail('No channel specified');
        console.log('');
        error('Please provide a channel handle or set a default: staqan-yt config set default.channel @yourChannel');
        process.exit(1);
      }
      debug(`Using default channel from config: ${channel}`);
    }

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
  } catch (err) {
    spinner.fail('Failed to fetch playlists');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = listPlaylistsCommand;
