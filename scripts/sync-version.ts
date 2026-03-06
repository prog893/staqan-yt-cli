#!/usr/bin/env bun

/**
 * Sync version from package.json to all files that need it
 *
 * This ensures package.json is the single source of truth for versioning.
 * Run this script after bumping the version in package.json.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const rootDir = join(__dirname, '..');

/**
 * Execute git command and return output
 */
function git(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: rootDir }).trim();
}

/**
 * Safety checks before version bump
 */
function runSafetyChecks(): void {
  console.log('🔍 Running safety checks...\n');

  // 1. Check we're on main branch
  const currentBranch = git('git rev-parse --abbrev-ref HEAD');
  if (currentBranch !== 'main') {
    console.error(`❌ Not on main branch (currently on: ${currentBranch})`);
    console.error('Please switch to main branch first: git checkout main');
    process.exit(1);
  }
  console.log('  ✓ On main branch');

  // 2. Check there's nothing to pull
  git('git fetch origin');
  const localCommit = git('git rev-parse HEAD');
  const remoteCommit = git('git rev-parse origin/main');
  if (localCommit !== remoteCommit) {
    console.error('❌ Local main is behind origin/main');
    console.error('Please pull first: git pull');
    process.exit(1);
  }
  console.log('  ✓ Up to date with origin');

  // 3. Check no tag exists for current commit
  const currentCommit = git('git rev-parse HEAD');
  const existingTags = git(`git tag --points-at ${currentCommit}`);
  if (existingTags) {
    console.error(`❌ Current commit already has tags:`);
    existingTags.split('\n').forEach((tag) => console.error(`   - ${tag}`));
    console.error('Cannot create another tag for this commit');
    process.exit(1);
  }
  console.log('  ✓ No existing tags on current commit');

  console.log('\n✅ All safety checks passed!\n');
}

// Read version from package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

console.log(`📦 Syncing version ${version} to all files...\n`);

// Run safety checks first
runSafetyChecks();

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

// Stage changes
git('git add -A');
console.log('  ✓ Staged changes');

// Commit
const commitMessage = `Bump version to ${version}`;
git(`git commit -m "${commitMessage}"`);
console.log(`  ✓ Committed: ${commitMessage}`);

// Create tag
git(`git tag v${version}`);
console.log(`  ✓ Created tag: v${version}`);

// Push commit and tag
console.log('\n📤 Pushing to GitHub...');
git('git push origin main');
console.log('  ✓ Pushed commit to origin/main');
git(`git push origin v${version}`);
console.log(`  ✓ Pushed tag v${version} to origin`);

console.log(`\n🎉 Release ${version} complete!`);
console.log(`   View tag: https://github.com/prog893/staqan-yt-cli/releases/tag/v${version}`);
