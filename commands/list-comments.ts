import chalk from 'chalk';
import { listVideoComments } from '../lib/youtube';
import { formatDate, error, debug, parseVideoId, initCommand, withSpinner } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';
import { ListCommentsOptions } from '../types';

async function listCommentsCommand(options: ListCommentsOptions): Promise<void> {
  initCommand(options);

  // Extract video ID from options
  const videoIdInput = options.videoId;
  if (!videoIdInput) {
    error('Required: --video-id');
    process.exit(1);
  }

  // Parse video ID from URL or raw ID
  const videoId = parseVideoId(videoIdInput);

  // Validate video ID format (basic check)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    error('Invalid video ID format. Video IDs should be 11 characters.');
    process.exit(1);
  }

  // Determine sort order
  const sortOrder = options.sort === 'new' ? 'time' : 'relevance';
  const limit = parseInt(options.limit || '20');

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
        console.log(formatJson(comments));
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
        console.log(formatTable(tableData));
        break;

      case 'text':
        comments.forEach(comment => {
          console.log([
            comment.id,
            comment.authorName,
            comment.likeCount,
            comment.replyCount,
            comment.publishedAt,
            comment.textOriginal.replace(/\n/g, ' '),
          ].join('\t'));
        });
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
        console.log(formatCsv(csvData));
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
