# CLI Patterns and Conventions

This document documents the patterns and conventions used in the staqan-yt-cli codebase.

## Spinner Progress Pattern

When processing multiple items in a loop, use the ora spinner with a counter pattern to show real-time progress.

### Pattern

```typescript
import ora from 'ora';

const spinner = ora('Initial message...').start();

// Process items with counter
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  spinner.text = `Processing item ${i + 1}/${items.length}...`;
  // ... do work ...
}

spinner.succeed(`Processed ${items.length} item(s)`);
console.log('');
```

### Key Principles

1. **No intermediate success messages** - Don't call `spinner.succeed()` until all work is complete
2. **Update in-place** - The spinner text updates continuously on one line, showing current progress
3. **Counter format** - Use `${i + 1}/${total}` format (1-indexed)
4. **Single success message** - Show final count once at the end
5. **Blank line after** - Add `console.log('')` after spinner succeeds to separate from output

### Example Output

```
Checking for existing reports...
Downloading report 1/17...    ← updates in-place
Downloading report 2/17...    ← updates in-place
Downloading report 3/17...    ← updates in-place
...
✔ Downloaded 17 report(s)

[data output here]
```

### Commands Using This Pattern

- `get-report-data.ts` - Downloads multiple reports from YouTube Reporting API
- `get-video-localizations.ts` - Fetches localizations for multiple videos
- `get-video-analytics.ts` - Fetches analytics data in chunks
- `get-video-retention.ts` - Fetches retention data in chunks

### Anti-Patterns to Avoid

❌ **Don't** show intermediate success messages:
```typescript
for (const item of items) {
  // ... work ...
  spinner.succeed(`Processed item`);  // ❌ Wrong
}
```

❌ **Don't** use separate progress functions:
```typescript
for (let i = 0; i < items.length; i++) {
  progress(`Processing ${i + 1}/${items.length}`);  // ❌ Wrong
}
```

❌ **Don't** add blank lines during processing:
```typescript
for (let i = 0; i < items.length; i++) {
  spinner.text = `Processing ${i + 1}/${items.length}...`;
  console.log('');  // ❌ Wrong - creates gaps
}
```

## Output Formatting

All commands should support multiple output formats via `getOutputFormat()`:

- `json` - Structured JSON output
- `csv` - RFC 4180 compliant CSV
- `table` - ASCII table
- `text` - Tab-delimited text
- `pretty` - Human-readable with colors (default)

Use formatter functions from `lib/formatters.ts`:
- `formatJson(data)`
- `formatCsv(data)`
- `formatTable(data)`
- `formatText(data)`

### Example

```typescript
import { getOutputFormat } from '../lib/config';
import { formatJson, formatTable, formatCsv, formatText } from '../lib/formatters';

const outputFormat = await getOutputFormat(options.output);

switch (outputFormat) {
  case 'json':
    console.log(formatJson(data));
    break;
  case 'csv':
    console.log(formatCsv(data));
    break;
  case 'table':
    console.log(formatTable(data));
    break;
  case 'text':
    console.log(formatText(data));
    break;
  case 'pretty':
  default:
    // Custom pretty output with colors
    console.log(chalk.cyan(data.title));
    break;
}
```

## Error Handling

Use spinner for errors with descriptive messages:

```typescript
try {
  // ... work ...
} catch (err) {
  spinner.fail('Operation failed');
  console.log('');
  error((err as Error).message);
  process.exit(1);
}
```

## Verbose Mode

All commands should support `--verbose` flag:

```typescript
if (options.verbose) {
  setVerbose(true);
  debug('Verbose mode enabled');
}

// Use debug() for verbose-only output
debug('Processing item', item);
```

## Date Range Chunking

For APIs with date range limits (e.g., YouTube Analytics 90-day limit):

```typescript
import { chunkDateRange } from '../lib/utils';

const dateChunks = chunkDateRange(startDate, endDate);
debug(`Split into ${dateChunks.length} chunk(s)`);

for (let i = 0; i < dateChunks.length; i++) {
  const chunk = dateChunks[i];
  spinner.text = `Fetching chunk ${i + 1}/${dateChunks.length}...`;
  // ... fetch data for chunk ...
}
```
