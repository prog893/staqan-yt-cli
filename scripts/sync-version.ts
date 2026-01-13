#!/usr/bin/env bun

/**
 * Sync version from package.json to all files that need it
 *
 * This ensures package.json is the single source of truth for versioning.
 * Run this script after bumping the version in package.json.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');

// Read version from package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

console.log(`📦 Syncing version ${version} to all files...`);

// 1. Update bin/staqan-yt.ts fallback version
const binFilePath = join(rootDir, 'bin/staqan-yt.ts');
let binContent = readFileSync(binFilePath, 'utf-8');
binContent = binContent.replace(
  /let version = '[^']+'; \/\/ Fallback version for compiled binaries/,
  `let version = '${version}'; // Fallback version for compiled binaries`
);
writeFileSync(binFilePath, binContent, 'utf-8');
console.log(`  ✓ Updated bin/staqan-yt.ts`);

// 2. Update Formula/staqan-yt.rb version
const formulaPath = join(rootDir, 'Formula/staqan-yt.rb');
let formulaContent = readFileSync(formulaPath, 'utf-8');
formulaContent = formulaContent.replace(
  /version "[^"]+"/,
  `version "${version}"`
);
writeFileSync(formulaPath, formulaContent, 'utf-8');
console.log(`  ✓ Updated Formula/staqan-yt.rb`);

console.log(`\n✨ Version ${version} synced successfully!\n`);
console.log(`Next steps:`);
console.log(`  1. Review changes: git diff`);
console.log(`  2. Commit: git add -A && git commit -m "Bump version to ${version}"`);
console.log(`  3. Tag: git tag v${version}`);
console.log(`  4. Push: git push && git push --tags`);
