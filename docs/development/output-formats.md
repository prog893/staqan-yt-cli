# Output Formats Guide

This guide covers implementing output formats in commands for the staqan-yt-cli project.

## Output Format System

The CLI supports 5 output formats via `--output <format>`:

- **json** - Machine-readable JSON (2-space indentation)
- **table** - ASCII table format with borders and column alignment
- **text** - Tab-delimited output for Unix pipelines (awk, cut)
- **pretty** - Colorful, human-friendly output (default)
- **csv** - RFC 4180 CSV format for Excel and data analysis

## Implementing Output Formats

### Basic Pattern

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
  case 'text':
    data.forEach(item => console.log(Object.values(item).join('\t')));
    break;
  case 'csv':
    console.log(formatCsv(data));
    break;
  case 'pretty':
  default:
    // Colorful output using chalk
    break;
}
```

### Load Output Format

```typescript
import { getOutputFormat } from '../lib/config';

// Returns one of: 'json' | 'table' | 'text' | 'csv' | 'pretty'
const outputFormat = await getOutputFormat(options.output);
```

The `getOutputFormat` function:
1. Checks the `--output` flag (highest priority)
2. Falls back to `config.json` default.output setting
3. Defaults to `'pretty'` if neither is specified

## Output Format Details

### JSON Format

**Formatter**: `formatJson(data)`

```typescript
import { formatJson } from '../lib/formatters';

console.log(formatJson(data));
```

**Output**: 2-space indented JSON

```json
{
  "videoId": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "viewCount": "1400000000"
}
```

**Use cases**:
- APIs and programmatic access
- Data pipelines
- Further processing with jq

### Table Format

**Formatter**: `formatTable(data)`

```typescript
import { formatTable } from '../lib/formatters';

console.log(formatTable(data));
```

**Output**: ASCII table with borders

```
┌─────────────┬──────────────────────────────┬──────────────┐
│ Video ID    │ Title                        │ View Count   │
├─────────────┼──────────────────────────────┼──────────────┤
│ dQw4w9...   │ Never Gonna Give You Up      │ 1.4B         │
└─────────────┴──────────────────────────────┴──────────────┘
```

**Use cases**:
- Terminal viewing
- Reports
- Quick scanning

### Text Format

**Pattern**: Tab-delimited output

```typescript
data.forEach(item => console.log(Object.values(item).join('\t')));
```

**Output**: Tab-separated values

```
dQw4w9WgXcQ	Never Gonna Give You Up	1400000000
```

**Use cases**:
- Unix pipelines (awk, cut, sort)
- Log files
- Simple parsing

### CSV Format

**Formatter**: `formatCsv(data)`

```typescript
import { formatCsv } from '../lib/formatters';

console.log(formatCsv(data));
```

**Output**: RFC 4180 CSV format

```csv
videoId,title,viewCount
"dQw4w9WgXcQ","Never Gonna Give You Up","1400000000"
```

**Features**:
- Escapes fields containing commas, quotes, or newlines
- Doubles internal quotes for proper escaping
- Handles nested objects by JSON-encoding them
- Always includes a header row with field names

**Use cases**:
- Excel and spreadsheet import
- Data analysis (pandas, R)
- Business intelligence tools

### Pretty Format (Default)

**Pattern**: Chalk-based colorful output

```typescript
import chalk from 'chalk';

console.log(chalk.cyan('Video ID:'), videoId);
console.log(chalk.green('✓'), 'Title:', title);
console.log(chalk.yellow('Views:'), viewCount);
```

**Output**: Colorized terminal output

```
Video ID: dQw4w9WgXcQ
✓ Title: Never Gonna Give You Up
Views: 1.4B
```

**Use cases**:
- Interactive terminal use
- Human-readable output
- Quick visual scanning

## Data Preparation

### Flatten Nested Objects

For table/text/CSV formats, flatten nested objects:

```typescript
// Nested object from API
const video = {
  id: 'dQw4w9WgXcQ',
  snippet: {
    title: 'Never Gonna Give You Up',
    description: '...'
  },
  statistics: {
    viewCount: '1400000000'
  }
};

// Flatten for output
const flat = {
  videoId: video.id,
  title: video.snippet.title,
  viewCount: video.statistics.viewCount
};

// Now use with formatters
console.log(formatTable([flat]));
```

### Format Numbers

```typescript
// Format large numbers
function formatNumber(num: string): string {
  const n = parseInt(num, 10);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return num;
}

const data = {
  views: formatNumber(video.statistics.viewCount)
};
```

### Format Dates

```typescript
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

const data = {
  publishedAt: formatDate(video.snippet.publishedAt)
};
```

## Configuration Integration

### Default Output Format

Users can set a default in `config.json`:

```bash
staqan-yt config set default.output csv
```

Now all commands default to CSV output:

```bash
staqan-yt list-videos @channel  # Outputs CSV
```

### Override Default

Users can override per-command:

```bash
staqan-yt list-videos @channel --output json  # JSON this time
```

## Output Testing

Always test all output formats:

```bash
# Test all formats for a command
staqan-yt get-video dQw4w9WgXcQ --output json
staqan-yt get-video dQw4w9WgXcQ --output table
staqan-yt get-video dQw4w9WgXcQ --output text
staqan-yt get-video dQw4w9WgXcQ --output csv
staqan-yt get-video dQw4w9WgXcQ --output pretty
```

## Related Documentation

- [Output Formats (User Guide)](../output-formats.md) - User-facing documentation
- [Adding Commands Guide](adding-commands.md) - Implementing formats in commands
- [Testing Guide](testing-guide.md) - Testing output formats
