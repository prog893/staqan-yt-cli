import chalk from 'chalk';
import https from 'https';
import http from 'http';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { parseVideoId, error, debug, initCommand, withSpinner } from '../lib/utils';
import { DownloadThumbnailOptions } from '../types';

const QUALITY_ORDER = ['maxres', 'standard', 'high', 'medium', 'default'] as const;
type Quality = typeof QUALITY_ORDER[number];

const VALID_QUALITIES = new Set<string>(QUALITY_ORDER);

async function downloadFile(url: string, destPath: string): Promise<void> {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;

  await new Promise<void>((resolve, reject) => {
    transport.get(url, (response) => {
      if (response.statusCode !== 200) {
        unlink(destPath).catch(() => {});
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const file = createWriteStream(destPath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        unlink(destPath).catch(() => {});
        reject(err);
      });
    }).on('error', (err) => {
      unlink(destPath).catch(() => {});
      reject(err);
    });
  });
}

async function downloadThumbnailCommand(options: DownloadThumbnailOptions): Promise<void> {
  initCommand(options);

  if (!options.videoId) {
    error('Required: --video-id');
    process.exit(1);
  }

  const quality: Quality = (options.quality as Quality) || 'maxres';
  if (!VALID_QUALITIES.has(quality)) {
    error(`Invalid --quality "${quality}". Valid values: ${QUALITY_ORDER.join(', ')}`);
    process.exit(1);
  }

  const outputDir = options.path ? path.resolve(options.path) : process.cwd();

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
      spinner.fail('Video not found');
      error(`No video found with ID: ${parsedId}`);
      process.exit(1);
    }

    const thumbnails = response.data.items[0].snippet?.thumbnails;
    if (!thumbnails) {
      spinner.fail('No thumbnails available');
      error('No thumbnail data returned for this video');
      process.exit(1);
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
      spinner.fail('No thumbnail available');
      error(`No thumbnail found for video: ${parsedId}`);
      process.exit(1);
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
    console.log('');

    if (resolvedQuality !== quality) {
      console.log(chalk.yellow(`Note: "${quality}" quality not available; used "${resolvedQuality}" instead.`));
    }
    console.log(chalk.gray('Saved: ') + chalk.green(destPath));
    console.log('');
  });
}

export = downloadThumbnailCommand;
