# Adding Commands Guide

This guide provides a step-by-step process for adding new commands to the staqan-yt-cli, following AWS API naming conventions and project patterns.

## Step 1: Choose the Correct Name

Follow AWS conventions:
- **Single-item operation?** Use singular noun: `get-playlist`, `update-comment`
- **Batch/list operation?** Use plural noun: `get-playlists`, `list-comments`

### Naming Pattern Examples

**Singular = Single-item operations:**
```bash
get-video --video-id <id>        # Get ONE video
update-video --video-id <id>     # Update ONE video
delete-video --video-id <id>     # Delete ONE video (if added)
```

**Plural = Batch/list operations:**
```bash
get-videos --video-ids <id1> <id2>     # Get MULTIPLE videos (batch)
list-videos --channel <handle>         # List videos in channel
search-videos --query <text>           # Search multiple videos
```

### Required Flags Pattern

- Single ID: Use `--resource-id <id>` (singular flag name, singular ID)
- Multiple IDs: Use `--resource-ids <id...>` (plural flag name, variadic IDs)
- Other required params: Use descriptive flag names (e.g., `--query <text>`)

**🚨 RULE: Everything is a named flag. No positional arguments at all.**

## Step 2: Create Command File

Create `commands/your-command.ts`:

```typescript
import ora from 'ora';
import { success, error, info } from '../lib/utils';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { JsonOption } from '../types';

interface YourCommandOptions extends JsonOption {
  // Add your option types here
  dryRun?: boolean;
  yes?: boolean;
}

async function yourCommand(args: string, options: YourCommandOptions): Promise<void> {
  const spinner = ora('Processing...').start();

  try {
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    // Your logic here

    spinner.succeed('Operation completed!');
    success('Done!');
  } catch (err) {
    spinner.fail('Operation failed');
    error((err as Error).message);
    process.exit(1);
  }
}

export = yourCommand;
```

## Step 3: Register in bin/staqan-yt.ts

```typescript
import yourCommand = require('../commands/your-command');

program
  .command('your-command <arg>')
  .description('Description following AWS style')
  .option('-j, --output json', 'Output in JSON format')
  .action(yourCommand);
```

**Important**: Use `{ hidden: true }` for internal commands that shouldn't appear in help output.

## Step 4: Add Types (if needed)

Update `types/index.ts` if you have new shared types:

```typescript
export interface YourNewType {
  field: string;
  // ...
}
```

## Step 5: Build and Test

```bash
npm run type-check    # Ensure no type errors
npm run lint          # Ensure no linting errors
npm run build         # Compile to dist/
npm link              # Test globally
```

## Step 6: Update Documentation

### Command Documentation (REQUIRED)

Add to the appropriate `docs/commands/<category>.md` file:

```markdown
## command-name

Brief description.

### Usage
\`\`\`bash
staqan-yt command-name <args>
\`\`\`

### Arguments
- `arg` - Description

### Options
- `--flag` - Description
- `-v, --verbose` - Enable verbose output

### Examples
\`\`\`bash
# Basic usage
staqan-yt command-name value
\`\`\`

### Output Fields
- Field descriptions

### Related Commands
- Links to related commands
```

### Help Command Grouping (REQUIRED)

Update `lib/customHelp.ts` to include new command in appropriate group.

### Documentation Verification

- [ ] Command documented in `docs/commands/<category>.md`
- [ ] Help grouping updated in `lib/customHelp.ts`
- [ ] Examples tested and work correctly
- [ ] Related commands cross-referenced

## Command Templates

### Simple Get Command

```typescript
import ora from 'ora';
import { success, error } from '../lib/utils';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';
import { getOutputFormat } from '../lib/config';
import { formatJson, formatPretty } from '../lib/formatters';

interface GetVideoOptions {
  output?: string;
}

async function getVideoCommand(videoId: string, options: GetVideoOptions): Promise<void> {
  const spinner = ora('Fetching video...').start();

  try {
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    const response = await youtube.videos.list({
      part: 'snippet,statistics',
      id: videoId
    });

    if (!response.data.items || response.data.items.length === 0) {
      spinner.fail('Video not found');
      process.exit(1);
    }

    const video = response.data.items[0];
    spinner.succeed('Video retrieved!');

    const outputFormat = await getOutputFormat(options.output);

    if (outputFormat === 'json') {
      console.log(formatJson(video));
    } else {
      formatPretty(video);
    }

    success('Done!');
  } catch (err) {
    spinner.fail('Failed to fetch video');
    error((err as Error).message);
    process.exit(1);
  }
}

export = getVideoCommand;
```

### Update Command with Dry Run

```typescript
import ora from 'ora';
import { success, error, info } from '../lib/utils';
import { getAuthenticatedClient } from '../lib/auth';
import { google } from 'googleapis';

interface UpdateVideoOptions {
  title?: string;
  description?: string;
  dryRun?: boolean;
  yes?: boolean;
}

async function updateVideoCommand(videoId: string, options: UpdateVideoOptions): Promise<void> {
  if (!options.title && !options.description) {
    error('At least one of --title or --description must be provided');
    process.exit(1);
  }

  const spinner = ora('Updating video...').start();

  try {
    const auth = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth });

    if (options.dryRun) {
      spinner.info('Dry run mode - no changes made');
      info(`Would update video ${videoId}:`);
      if (options.title) info(`  Title: ${options.title}`);
      if (options.description) info(`  Description: ${options.description}`);
      return;
    }

    if (!options.yes) {
      spinner.info(`Updating video ${videoId}`);
      // Add confirmation prompt if needed
    }

    await youtube.videos.update({
      part: 'snippet',
      requestBody: {
        id: videoId,
        snippet: {
          title: options.title,
          description: options.description,
          categoryId: '24' // Keep existing category
        }
      }
    });

    spinner.succeed('Video updated!');
    success('Done!');
  } catch (err) {
    spinner.fail('Failed to update video');
    error((err as Error).message);
    process.exit(1);
  }
}

export = updateVideoCommand;
```

## Common Patterns

### Loading Default Channel from Config

```typescript
import { getConfigValue } from '../lib/config';

let channel = channelHandle || await getConfigValue('default.channel');
if (!channel) {
  error('No channel specified. Use --channel or set default.channel in config');
  process.exit(1);
}
```

### Output Format Switching

```typescript
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv } from '../lib/formatters';

const outputFormat = await getOutputFormat(options.output);

switch (outputFormat) {
  case 'json':
    console.log(formatJson(data));
    break;
  case 'table':
    console.log(formatTable(data));
    break;
  case 'csv':
    console.log(formatCsv(data));
    break;
  case 'text':
    data.forEach(item => console.log(Object.values(item).join('\t')));
    break;
  case 'pretty':
  default:
    // Colorful output using chalk
    break;
}
```

### Error Handling

```typescript
try {
  // operation
} catch (err) {
  if ((err as any).code === 403) {
    error('API quota exceeded. Try again tomorrow.');
  } else if ((err as any).code === 404) {
    error('Video not found. Check the video ID.');
  } else {
    error(`Failed: ${(err as Error).message}`);
  }
  process.exit(1);
}
```

## Related Guides

- [TypeScript Guide](typescript-guide.md) - Type safety and patterns
- [Testing Guide](testing-guide.md) - How to test commands
- [Error Handling Guide](error-handling.md) - Error patterns
- [Output Formats Guide](output-formats.md) - Output format implementation
- [YouTube API Guide](youtube-api-guide.md) - API patterns
- [Git Workflow Guide](git-workflow.md) - Branch, commit, release
