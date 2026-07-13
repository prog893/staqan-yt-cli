import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as path from 'path';
import { uploadCaption } from '../lib/youtube';
import { parseVideoId, debug, initCommand, withSpinner } from '../lib/utils';
import { normalizeLanguage, getLanguageName } from '../lib/language';
import { getOutputFormat } from '../lib/config';
import { formatData } from '../lib/formatters';
import { PutCaptionOptions } from '../types';

async function putCaptionCommand(options: PutCaptionOptions): Promise<void> {
  initCommand(options);

  const videoId = options.videoId;
  if (!videoId) {
    throw new Error('Required: --video-id');
  }

  const { language, file } = options;
  if (!language) {
    throw new Error('Required: --language');
  }
  if (!file) {
    throw new Error('Required: --file');
  }

  // Fail fast on an unreadable file before spending any API quota.
  const filePath = path.resolve(file);
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('not a regular file');
    }
    if (stats.size === 0) {
      throw new Error('file is empty');
    }
  } catch (err) {
    throw new Error(
      `Cannot read caption file: ${filePath}\n${(err as Error).message}\n` +
      'Supported formats: srt, vtt, sbv, scc, ttml'
    );
  }

  // Normalize known languages for the display name; pass unknown codes
  // through untouched — the API accepts any BCP-47 tag (lib/language.ts only
  // maps en/ja/ru today, see #105).
  const langCode = normalizeLanguage(language) || language;
  const langName = getLanguageName(langCode) || language;
  debug(`Language: ${language} -> ${langCode} (${langName})`);

  const outputFormat = await getOutputFormat(options.output);

  // Parse before the spinner so a malformed ID fails with an accurate
  // message rather than "Failed to upload caption" (CodeRabbit on #148).
  const parsedId = parseVideoId(videoId);
  debug(`Parsed video ID: ${parsedId}`);

  await withSpinner(`Uploading ${langName} caption track...`, 'Failed to upload caption', async (spinner) => {
    const result = await uploadCaption(parsedId, langCode, filePath, {
      name: options.name,
      draft: options.draft,
      force: options.force,
    });

    const verb = result.replaced ? 'Replaced' : 'Uploaded';
    // Spinner output goes to stderr, so machine formats stay pipeable.
    spinner.succeed(chalk.green(
      `${verb} ${langName} (${result.language}) caption track${result.isDraft ? ' as draft' : ''}`
    ));

    if (outputFormat !== 'pretty') {
      console.log(formatData([{ ...result, action: result.replaced ? 'replaced' : 'uploaded' }], outputFormat));
      return;
    }

    console.log('');
    console.log(chalk.gray(`Caption ID: ${result.id}`));
    console.log(chalk.gray(`Video ID:   ${result.videoId}`));
    if (result.name) {
      console.log(chalk.gray(`Track name: ${result.name}`));
    }
    if (result.replaced) {
      console.log(chalk.yellow('Existing track content was overwritten (--force)'));
    }
    if (result.isDraft) {
      console.log(chalk.yellow('Draft: not visible to viewers until published in YouTube Studio'));
    }
  });
}

export = putCaptionCommand;
