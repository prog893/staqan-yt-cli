import ora from 'ora';
import chalk from 'chalk';
import { getChannelInfo } from '../lib/youtube';
import { formatDate, formatNumber, error, setVerbose, debug } from '../lib/utils';
import { getConfigValue, getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { OutputOption, VerboseOption } from '../types';

async function getChannelCommand(channelHandle: string | undefined, options: OutputOption & VerboseOption): Promise<void> {
  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    debug('Verbose mode enabled');
  }

  // Use default channel from config if not provided
  let handleOrId = channelHandle;
  if (!handleOrId) {
    handleOrId = await getConfigValue('default.channel');
    if (!handleOrId) {
      error('No channel handle provided and no default.channel configured');
      console.log('');
      console.log(chalk.gray('Usage:') + ' staqan-yt get-channel [channelHandle]');
      console.log(chalk.gray('Or set default:') + ' staqan-yt config set default.channel @yourchannel');
      process.exit(1);
    }
    debug(`Using default channel from config: ${handleOrId}`);
  }

  const spinner = ora('Fetching channel information...').start();

  try {
    debug(`Fetching channel: ${handleOrId}`);
    const channel = await getChannelInfo(handleOrId);

    spinner.succeed(`Retrieved channel: ${channel.title}`);
    console.log('');

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        console.log(formatJson(channel));
        break;

      case 'table':
        const subscriberDisplay = channel.statistics.hiddenSubscriberCount
          ? 'Hidden'
          : formatNumber(channel.statistics.subscriberCount);

        const tableData = [{
          id: channel.id,
          title: channel.title,
          handle: channel.handle || 'N/A',
          customUrl: channel.customUrl || 'N/A',
          videos: channel.statistics.videoCount,
          subscribers: subscriberDisplay,
          views: formatNumber(channel.statistics.viewCount),
          country: channel.country || 'N/A',
          published: formatDate(channel.publishedAt),
        }];
        console.log(formatTable(tableData));
        break;

      case 'text':
        console.log([
          channel.id,
          channel.title,
          channel.handle || '',
          channel.customUrl || '',
          channel.statistics.videoCount,
          channel.statistics.subscriberCount,
          channel.statistics.viewCount,
          channel.country || '',
          channel.publishedAt,
        ].join('\t'));
        break;

      case 'csv':
        const subscriberCsv = channel.statistics.hiddenSubscriberCount
          ? 'Hidden'
          : channel.statistics.subscriberCount.toString();

        const csvData = [{
          id: channel.id,
          title: channel.title,
          description: channel.description,
          handle: channel.handle || '',
          customUrl: channel.customUrl || '',
          videoCount: channel.statistics.videoCount,
          subscriberCount: subscriberCsv,
          viewCount: channel.statistics.viewCount,
          hiddenSubscriberCount: channel.statistics.hiddenSubscriberCount,
          country: channel.country || '',
          publishedAt: channel.publishedAt,
        }];
        console.log(formatCsv(csvData));
        break;

      case 'pretty':
      default:
        console.log(chalk.bold.cyan(channel.title));
        console.log('');
        console.log(chalk.gray('Channel ID:   ') + chalk.yellow(channel.id));
        console.log(chalk.gray('Handle:       ') + (channel.handle || 'N/A'));
        console.log(chalk.gray('Custom URL:   ') + (channel.customUrl || 'N/A'));
        console.log(chalk.gray('Country:      ') + (channel.country || 'N/A'));
        console.log(chalk.gray('Videos:       ') + formatNumber(channel.statistics.videoCount));

        const subscriberPretty = channel.statistics.hiddenSubscriberCount
          ? 'Hidden'
          : formatNumber(channel.statistics.subscriberCount);
        console.log(chalk.gray('Subscribers:  ') + subscriberPretty);
        console.log(chalk.gray('Total Views:  ') + formatNumber(channel.statistics.viewCount));
        console.log(chalk.gray('Published:    ') + formatDate(channel.publishedAt));
        console.log('');

        if (channel.description) {
          console.log(chalk.bold('Description:'));
          const description = channel.description;
          const preview = description.length > 200
            ? description.substring(0, 200) + '...'
            : description;
          console.log('  ' + preview.replace(/\n/g, '\n  '));
          console.log('');
        }

        // Show topic categories if available
        if (channel.topicDetails && channel.topicDetails.topicCategories.length > 0) {
          console.log(chalk.bold('Topic Categories:'));
          channel.topicDetails.topicCategories.forEach((category: string) => {
            const categoryName = category.split('/').pop() || category;
            console.log('  • ' + categoryName);
          });
          console.log('');
        }

        // Show keywords if available
        if (channel.brandingSettings?.channel?.keywords) {
          const keywords = channel.brandingSettings.channel.keywords;
          if (keywords) {
            console.log(chalk.bold('Keywords:'));
            // Parse space-delimited keywords, handling quoted multi-word phrases
            const keywordList = keywords.match(/"([^"]+)"|(\S+)/g)?.map((k: string) => k.replace(/"/g, '')) || [];
            keywordList.forEach((keyword: string) => {
              console.log('  • ' + keyword);
            });
            console.log('');
          }
        }

        console.log(chalk.gray('URL:          ') + chalk.blue(`https://youtube.com/channel/${channel.id}`));
        if (channel.handle) {
          console.log(chalk.gray('              ') + chalk.blue(`https://youtube.com/${channel.handle}`));
        }
        console.log('');
        break;
    }
  } catch (err) {
    spinner.fail('Failed to fetch channel information');
    console.log('');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getChannelCommand;
