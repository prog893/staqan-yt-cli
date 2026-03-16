# Troubleshooting Guide

This guide covers resolving common TypeScript and build errors in the staqan-yt-cli project.

## TypeScript Errors

### "Cannot find module" Errors

**Error**: `Cannot find module '../lib/youtube' or its corresponding type declarations`

**Solution**: Check imports use correct paths:

```typescript
// ✅ Correct - no .ts extension
import { getVideoInfo } from '../lib/youtube';

// ❌ Wrong - .ts extension not needed
import { getVideoInfo } from '../lib/youtube.ts';
```

### Type Errors with googleapis

**Error**: Properties are optional and TypeScript complains

**Solution**: Use optional chaining and non-null assertions carefully:

```typescript
// ✅ Use optional chaining
const channelId = response.data.items?.[0]?.snippet?.channelId;
if (!channelId) {
  throw new Error('Channel not found');
}

// ✅ Validate first, then assert
if (response.data.items && response.data.items.length > 0) {
  const title = response.data.items[0].snippet!.title!;  // Safe!
}
```

See [TypeScript Guide](typescript-guide.md#non-null-assertion-usage) for detailed rationale.

### "Property does not exist" Errors

**Error**: Property `xxx` does not exist on type `yyy`

**Solution**: Add proper type definitions:

```typescript
// Define interface for external data
interface ApiResponse {
  items?: Item[];
}

// Use type assertion for untyped libraries
const data = response as unknown as YourType;
```

### Implicit Any Errors

**Error**: Parameter `xxx` implicitly has an `any` type

**Solution**: Add explicit types:

```typescript
// ❌ Implicit any
function handler(videoId) {
  // ...
}

// ✅ Explicit type
function handler(videoId: string): void {
  // ...
}
```

## Build Errors

### "Cannot compile" Errors

**Symptom**: `npm run build` fails with compilation errors

**Solution**:

```bash
# Clean build artifacts
rm -rf dist/

# Check TypeScript errors
npm run type-check

# Fix errors and rebuild
npm run build
```

### "Module not found" Errors

**Error**: `Cannot find module 'xxx'` when running compiled code

**Solution**:

```bash
# Check if module is installed
npm ls xxx

# Install missing module
npm install xxx

# Rebuild
npm run build
```

### TSC Errors

**Error**: `tsc` command not found

**Solution**: TypeScript is installed as a dev dependency:

```bash
# Use npm scripts instead
npm run type-check
npm run build

# Or install globally
npm install -g typescript
```

## ESLint Errors

### Common ESLint Issues

```bash
# See all errors
npm run lint
```

### Unused Imports

**Error**: `xxx` is defined but never used

**Solution**: Remove unused imports:

```typescript
// ❌ Unused import
import { unused, used } from './module';

// ✅ Only import what you use
import { used } from './module';
```

### Unused Variables

**Error**: `xxx` is assigned a value but never used

**Solution**: Prefix with underscore if intentional:

```typescript
// ✅ Prefix intentional unused variables
const _unused = getSomeValue();
```

### Any Type Errors

**Error**: Unsafe use of `any` type

**Solution**: Add proper types (see [TypeScript Guide](typescript-guide.md)):

```typescript
// ❌ Using any
function handler(data: any): any {
  // ...
}

// ✅ Using specific types
interface VideoData {
  id: string;
  title: string;
}

function handler(data: VideoData): Promise<void> {
  // ...
}
```

## Runtime Errors

### "Authentication failed" Errors

**Error**: `No authentication token found`

**Solution**:

```bash
# Run authentication
staqan-yt auth

# Check token exists
ls ~/.staqan-yt-cli/token.json
```

### "Channel not found" Errors

**Error**: `Channel not found` or `No uploads playlist found`

**Solution**: Verify channel handle:

```bash
# Must include @ symbol
staqan-yt list-videos @staqan  # ✅ Correct
staqan-yt list-videos staqan   # ❌ Missing @
```

### "Video not found" Errors

**Error**: `Video not found`

**Solution**: Check video ID format:

```bash
# Video IDs are 11 characters
staqan-yt get-video dQw4w9WgXcQ  # ✅ Correct
staqan-yt get-video abc          # ❌ Too short
```

## NPM Errors

### "EACCES" Permission Errors

**Error**: `EACCES: permission denied`

**Solution**: Fix npm permissions or use sudo (not recommended):

```bash
# Fix npm permissions (recommended)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Or use sudo (not recommended)
sudo npm install -g .
```

### "EBUSY" File Lock Errors

**Error**: `EBUSY: resource busy or locked`

**Solution**: Close other processes using the files:

```bash
# On Windows: Check open files
# On macOS/Linux: Use lsof
lsof | grep node

# Kill process if needed
kill -9 <PID>
```

## Debugging Tips

### Enable Debug Logging

```typescript
// Add verbose logging
if (options.verbose) {
  console.log('Debug info:', debugData);
}
```

### Check File Paths

```typescript
import path from 'path';

// Always resolve paths
const configPath = path.resolve(__dirname, '../config.json');
console.log('Loading config from:', configPath);
```

### Verify Environment

```bash
# Check Node version
node --version  # Should be v18 or higher

# Check npm version
npm --version

# Check environment variables
env | grep NODE
```

## Getting Help

If you can't resolve the error:

1. Check [Troubleshooting (User Guide)](../troubleshooting.md) for common user issues
2. Review [Error Handling Guide](error-handling.md) for error patterns
3. Check GitHub Issues: https://github.com/prog893/staqan-yt-cli/issues
4. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Your environment (OS, Node version, CLI version)

## Related Guides

- [TypeScript Guide](typescript-guide.md) - Type safety and patterns
- [Error Handling Guide](error-handling.md) - Error patterns
- [Testing Guide](testing-guide.md) - Testing strategies
