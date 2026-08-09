import chalk from 'chalk';
import { listVideoComments } from '../lib/youtube';
import { formatDate, parsePositiveInt, debug, parseVideoId, initCommand, withSpinner, runOrExit, writeStdout } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ListCommentsOptions } from '../types';

async function listCommentsCommand(options: ListCommentsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoIdInput = options.videoId;
  if (!videoIdInput) {
    throw new Error('Required: --video-id');
  }

  // Parse video ID from URL or raw ID
  const videoId = parseVideoId(videoIdInput);

  // Validate video ID format (basic check)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error('Invalid video ID format. Video IDs should be 11 characters.');
  }

  // Determine sort order
  const validSorts = ['new', 'top'];
  if (options.sort !== undefined && !validSorts.includes(options.sort)) {
    throw new Error(`Invalid --sort "${options.sort}". Valid values: new, top`);
  }
  const sortOrder = options.sort === 'new' ? 'time' : 'relevance';
  const limit = runOrExit(() => parsePositiveInt('--limit', options.limit, 20));

  debug(`Fetching comments for video: ${videoId}, limit: ${limit}, sort: ${sortOrder}`);

  await withSpinner(`Fetching comments for video ${videoId}...`, 'Failed to fetch comments', async (spinner) => {
    const comments = await listVideoComments(videoId, limit, sortOrder);

    spinner.succeed(`Found ${comments.length} comment(s)`);
    console.log('');

    if (comments.length === 0) {
      console.log(chalk.yellow('No comments found for this video.'));
      return;
    }

    const outputFormat = await getOutputFormat(options.output);

    switch (outputFormat) {
      case 'json':
        await writeStdout(formatJson(comments) + '\n');
        break;

      case 'table':
        const tableData = comments.map(comment => ({
          id: comment.id,
          author: comment.authorName,
          text: comment.textDisplay.substring(0, 50) + (comment.textDisplay.length > 50 ? '...' : ''),
          likes: comment.likeCount,
          replies: comment.replyCount,
          date: formatDate(comment.publishedAt),
        }));
        await writeStdout(formatTable(tableData) + '\n');
        break;

      case 'text':
        await writeStdout(comments.map(comment => [
            comment.id,
            comment.authorName,
            comment.likeCount,
            comment.replyCount,
            comment.publishedAt,
            comment.textOriginal.replace(/\n/g, ' '),
          ].join('\t')).join('\n') + '\n');
        break;

      case 'csv':
        const csvData = comments.map(comment => ({
          id: comment.id,
          videoId: comment.videoId,
          authorName: comment.authorName,
          authorChannelId: comment.authorChannelId,
          textDisplay: comment.textDisplay,
          textOriginal: comment.textOriginal,
          likeCount: comment.likeCount,
          replyCount: comment.replyCount,
          isReply: comment.isReply,
          parentId: comment.parentId,
          publishedAt: comment.publishedAt,
          updatedAt: comment.updatedAt,
        }));
        await writeStdout(formatCsv(csvData) + '\n');
        break;

      case 'pretty':
      default:
        comments.forEach((comment, index) => {
          console.log(chalk.cyan(`[${index + 1}]`) + ' ' + chalk.bold(comment.authorName));
          console.log('  ID: ' + chalk.yellow(comment.id));
          console.log('  ' + chalk.gray(comment.textDisplay));
          console.log('  ' + chalk.green('♥') + ' Likes: ' + chalk.yellow(comment.likeCount) + ' | ' + chalk.blue('Replies: ') + chalk.yellow(comment.replyCount));
          console.log('  Posted: ' + formatDate(comment.publishedAt));
          console.log('');
        });
        break;
    }
  });
}

export = listCommentsCommand;
