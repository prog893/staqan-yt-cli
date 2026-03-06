#!/usr/bin/env bun

/**
 * postversion script - runs after npm commits and tags
 * Push the commit and tag to GitHub
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

const rootDir = join(__dirname, '..');

/**
 * Execute git command and return output
 */
function git(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', cwd: rootDir }).trim();
}

// Get version from package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

console.log(`\n📤 Pushing release ${version} to GitHub...\n`);

// Push commit
git('git push origin main');
console.log('  ✓ Pushed commit to origin/main');

// Push tag
git(`git push origin v${version}`);
console.log(`  ✓ Pushed tag v${version} to origin`);

console.log(`\n🎉 Release ${version} complete!`);
console.log(`   View tag: https://github.com/prog893/staqan-yt-cli/releases/tag/v${version}\n`);
