import chalk from 'chalk';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { rename, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, debug, initCommand, withSpinner, writeStdout } from '../lib/utils';
import { getOutputFormat } from '../lib/config';
import { formatJson } from '../lib/formatters';
import { DownloadThumbnailOptions } from '../types';

const QUALITY_ORDER = ['maxres', 'standard', 'high', 'medium', 'default'] as const;
type Quality = typeof QUALITY_ORDER[number];

const VALID_QUALITIES = new Set<string>(QUALITY_ORDER);

async function downloadFile(url: string, destPath: string): Promise<void> {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;
  const tempPath = `${destPath}.${randomUUID()}.tmp`;

  try {
    await new Promise<void>((resolve, reject) => {
      const req = transport.get(url, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const file = createWriteStream(tempPath);
        const fail = (err: Error) => {
          reject(err);
          response.destroy();
          file.destroy();
        };

        response.once('error', fail);
        response.pipe(file);

        file.on('finish', () => file.close());
        file.on('close', resolve);
        file.once('error', fail);
      });

      req.setTimeout(30_000, () => {
        req.destroy(new Error('Thumbnail download timed out'));
      });
      req.on('error', reject);
    });

    await rename(tempPath, destPath);
  } catch (err) {
    // Roll back the partial file, then rethrow the original error. The cleanup
    // must not mask what actually went wrong, so its own failure is recorded
    // at debug level rather than thrown (issue #196).
    await unlink(tempPath).catch((unlinkErr: NodeJS.ErrnoException) => {
      if (unlinkErr.code === 'ENOENT') return;
      debug(`Could not remove partial thumbnail ${tempPath}: ${unlinkErr.message}`);
    });
    throw err;
  }
}

async function downloadThumbnailCommand(options: DownloadThumbnailOptions): Promise<void> {
  initCommand(options);

  if (!options.videoId) {
    throw new Error('Required: --video-id');
  }

  const quality: Quality = (options.quality as Quality) || 'maxres';
  if (!VALID_QUALITIES.has(quality)) {
    throw new Error(`Invalid --quality "${quality}". Valid values: ${QUALITY_ORDER.join(', ')}`);
  }

  const outputDir = options.path ? path.resolve(options.path) : process.cwd();
  const outputFormat = await getOutputFormat(options.output);

  await withSpinner('Fetching thumbnail URL...', 'Failed to download thumbnail', async (spinner) => {
    const parsedId = parseVideoId(options.videoId!);
    debug('Parsed video ID', parsedId);

    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: ['snippet'],
      id: [parsedId],
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error(`No video found with ID: ${parsedId}`);
    }

    const thumbnails = response.data.items[0].snippet?.thumbnails;
    if (!thumbnails) {
      throw new Error('No thumbnail data returned for this video');
    }

    // Find the best available quality, falling back down the order if not present
    let resolvedQuality: Quality | null = null;
    let thumbnailUrl: string | null = null;

    if (thumbnails[quality]?.url) {
      resolvedQuality = quality;
      thumbnailUrl = thumbnails[quality]!.url!;
    } else {
      const startIdx = QUALITY_ORDER.indexOf(quality);
      for (let i = startIdx + 1; i < QUALITY_ORDER.length; i++) {
        const q = QUALITY_ORDER[i];
        if (thumbnails[q]?.url) {
          resolvedQuality = q;
          thumbnailUrl = thumbnails[q]!.url!;
          break;
        }
      }
    }

    if (!resolvedQuality || !thumbnailUrl) {
      throw new Error(`No thumbnail found for video: ${parsedId}`);
    }

    if (resolvedQuality !== quality) {
      spinner.text = `Quality "${quality}" not available, falling back to "${resolvedQuality}"...`;
    }

    const filename = `${parsedId}_${resolvedQuality}.jpg`;
    const destPath = path.join(outputDir, filename);

    debug('Downloading from', thumbnailUrl);
    debug('Saving to', destPath);

    spinner.text = `Downloading ${resolvedQuality} thumbnail...`;
    await downloadFile(thumbnailUrl, destPath);

    spinner.succeed('Thumbnail downloaded');

    const result = { videoId: parsedId, quality: resolvedQuality, path: destPath };

    switch (outputFormat) {
      case 'json':
        await writeStdout(formatJson(result) + '\n');
        break;

      case 'text':
        await writeStdout(destPath + '\n');
        break;

      case 'pretty':
      default:
        console.log('');
        if (resolvedQuality !== quality) {
          console.log(chalk.yellow(`Note: "${quality}" quality not available; used "${resolvedQuality}" instead.`));
        }
        console.log(chalk.gray('Saved: ') + chalk.green(destPath));
        console.log('');
        break;
    }
  });
}

export = downloadThumbnailCommand;
