#!/usr/bin/env bun

/**
 * version script - runs after npm bumps the version in package.json
 * Sync the new version to other files and add them to npm's commit
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const rootDir = join(__dirname, '..');
const tapDir = join(rootDir, 'homebrew-tap');

/**
 * Execute git command
 */
function git(cmd: string): void {
  execSync(cmd, { encoding: 'utf-8', cwd: rootDir });
}

// Read new version from package.json (npm already bumped it)
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

console.log(`📦 Syncing version ${version} to all files...\n`);

// 1. Update bin/staqan-yt.ts fallback version
const binFilePath = join(rootDir, 'bin/staqan-yt.ts');
let binContent = readFileSync(binFilePath, 'utf-8');
binContent = binContent.replace(
  /let version = '[^']+'; \/\/ Fallback version for compiled binaries/,
  `let version = '${version}'; // Fallback version for compiled binaries`
);
writeFileSync(binFilePath, binContent, 'utf-8');
console.log(`  ✓ Updated bin/staqan-yt.ts`);

// 2. Update homebrew-tap/Formula/staqan-yt.rb version (tap clone)
const tapFormulaPath = join(tapDir, 'Formula/staqan-yt.rb');
let formulaContent = readFileSync(tapFormulaPath, 'utf-8');
formulaContent = formulaContent.replace(
  /version "[^"]+"/,
  `version "${version}"`
);
writeFileSync(tapFormulaPath, formulaContent, 'utf-8');
console.log(`  ✓ Updated homebrew-tap/Formula/staqan-yt.rb`);

// 3. Add files to npm's commit (tap formula is committed separately by postversion)
git('git add bin/staqan-yt.ts package.json');
console.log('  ✓ Added files to npm commit');

console.log(`\n✅ Version ${version} synced! npm will now commit and tag.\n`);
