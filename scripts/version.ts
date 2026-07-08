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

// 1. Update lib/version.ts fallback version (shared by the CLI entry point
// and the MCP server via getVersion())
const versionFilePath = join(rootDir, 'lib/version.ts');
const versionContent = readFileSync(versionFilePath, 'utf-8');
const updatedVersionContent = versionContent.replace(
  /export const FALLBACK_VERSION = '[^']+'; \/\/ synced by scripts\/version\.ts/,
  `export const FALLBACK_VERSION = '${version}'; // synced by scripts/version.ts`
);
if (updatedVersionContent === versionContent) {
  throw new Error('FALLBACK_VERSION marker not found in lib/version.ts — sync regex needs updating');
}
writeFileSync(versionFilePath, updatedVersionContent, 'utf-8');
console.log(`  ✓ Updated lib/version.ts`);

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
git('git add lib/version.ts package.json');
console.log('  ✓ Added files to npm commit');

console.log(`\n✅ Version ${version} synced! npm will now commit and tag.\n`);
