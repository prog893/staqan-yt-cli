# Error Handling Guide

This guide covers error handling patterns for the staqan-yt-cli project.

## User-Friendly Errors

Always provide clear, actionable error messages:

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

## Common Error Patterns

### Authentication Errors

```typescript
import { getAuthenticatedClient } from '../lib/auth';

async function yourCommand() {
  let auth;
  try {
    auth = await getAuthenticatedClient();
  } catch (err) {
    error('Authentication failed. Please run: staqan-yt auth');
    process.exit(1);
  }

  // Use auth for API calls
}
```

### Input Validation Errors

```typescript
// Validate video ID format
if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
  error('Invalid video ID format. Video IDs must be 11 characters.');
  process.exit(1);
}

// Validate required parameters
if (!options.title && !options.description) {
  error('At least one of --title or --description must be provided');
  process.exit(1);
}

// Validate channel parameter
if (!channel) {
  error('No channel specified. Use --channel or set default.channel in config');
  process.exit(1);
}
```

### API Response Errors

```typescript
const response = await youtube.videos.list({
  part: 'snippet,statistics',
  id: videoId
});

if (!response.data.items || response.data.items.length === 0) {
  spinner.fail('Video not found');
  process.exit(1);
}

const video = response.data.items[0];
// Process video
```

### File Operation Errors

```typescript
import { acquireLock } from '../lib/lock';

async function writeData() {
  let release;
  try {
    release = await acquireLock(lockPath, { timeout: 5000 });
    // ... write operations ...
  } catch (err) {
    if ((err as Error).message.includes('timeout')) {
      error('Could not acquire lock. Another operation may be in progress.');
    } else {
      error(`Failed to write data: ${(err as Error).message}`);
    }
    process.exit(1);
  } finally {
    if (release) await release();
  }
}
```

## Error Message Best Practices

### DO ✅

- Be specific about what went wrong
- Provide actionable next steps
- Use user-friendly language
- Include relevant IDs/values in error messages
- Match error type to the problem

```typescript
error('Video not found. Check the video ID: dQw4w9WgXcQ');
error('API quota exceeded. Try again tomorrow.');
error('No authentication token found. Please run: staqan-yt auth');
```

### DON'T ❌

- Use technical jargon unnecessarily
- Blame the user
- Provide unhelpful error messages
- Expose stack traces to users
- Use generic errors for specific problems

```typescript
// Bad examples
error('Error occurred');  // Too generic
error('You provided wrong input');  // Blaming
error('Error: 500 Internal Server Error');  // Too technical
console.error(err.stack);  // Exposes implementation
```

## Error Types

### YouTube API Errors

| Error Code | Meaning | User Message |
|------------|---------|--------------|
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required |
| 403 | Forbidden | API quota exceeded or insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |

### Configuration Errors

```typescript
// Missing configuration
if (!configValue) {
  error('Configuration value not found. Run: staqan-yt config set key value');
}

// Invalid configuration
if (outputFormat && !['json', 'table', 'text', 'csv', 'pretty'].includes(outputFormat)) {
  error('Invalid output format. Must be: json, table, text, csv, or pretty');
}
```

### Network Errors

```typescript
try {
  const response = await fetch(url);
} catch (err) {
  if ((err as Error).message.includes('ECONNREFUSED')) {
    error('Cannot connect to YouTube. Check your internet connection.');
  } else if ((err as Error).message.includes('ETIMEDOUT')) {
    error('Request timed out. Please try again.');
  } else {
    error(`Network error: ${(err as Error).message}`);
  }
  process.exit(1);
}
```

## Spinner Error Handling

Use ora spinners for better UX:

```typescript
import ora from 'ora';

async function yourCommand() {
  const spinner = ora('Processing...').start();

  try {
    // Your logic here
    spinner.succeed('Processing completed!');
  } catch (err) {
    spinner.fail('Processing failed');
    error((err as Error).message);
    process.exit(1);
  }
}
```

## Error Testing

Always test error cases:

```bash
# Test with invalid video ID
staqan-yt get-video invalid-id

# Test without authentication
rm ~/.staqan-yt-cli/token.json
staqan-yt get-video dQw4w9WgXcQ

# Test with missing required parameters
staqan-yt update-video VIDEO_ID  # Missing --title or --description

# Test with invalid configuration
staqan-yt config set invalid.key value
```

## Related Guides

- [Adding Commands Guide](adding-commands.md) - Command error patterns
- [TypeScript Guide](typescript-guide.md) - Type error handling
- [Troubleshooting Guide](troubleshooting.md) - Common error resolution
