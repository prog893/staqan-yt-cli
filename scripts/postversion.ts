#!/usr/bin/env bun

/**
 * postversion script - runs after npm commits and tags
 * 1. Clone/pull homebrew-tap, commit updated formula, push
 * 2. Push staqan-yt-cli commit and tag to GitHub
 */

import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const rootDir = join(__dirname, '..');
const tapDir = join(rootDir, 'homebrew-tap');
const tapRemote = 'git@github.com:prog893/homebrew-tap.git';

/**
 * Execute a command and return output
 */
function exec(cmd: string, cwd: string = rootDir): string {
  return execSync(cmd, { encoding: 'utf-8', cwd }).trim();
}

// Get version from package.json
const packageJsonPath = join(rootDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

console.log(`\n📤 Pushing release ${version} to GitHub...\n`);

// 1. Clone or pull homebrew-tap
if (!existsSync(tapDir)) {
  console.log('  ↓ Cloning homebrew-tap...');
  exec(`git clone ${tapRemote} homebrew-tap`, rootDir);
} else {
  console.log('  ↓ Pulling latest homebrew-tap...');
  exec('git pull', tapDir);
}
console.log('  ✓ homebrew-tap ready');

// 2. Commit and push updated formula to tap repo
//    (version.ts already wrote the new version into homebrew-tap/Formula/staqan-yt.rb)
exec('git add Formula/staqan-yt.rb', tapDir);
exec(`git commit -m "staqan-yt ${version}"`, tapDir);
exec('git push', tapDir);
console.log(`  ✓ Pushed staqan-yt ${version} formula to homebrew-tap`);

// 3. Push staqan-yt-cli commit and tag
exec('git push origin main', rootDir);
console.log('  ✓ Pushed commit to origin/main');

exec(`git push origin v${version}`, rootDir);
console.log(`  ✓ Pushed tag v${version} to origin`);

console.log(`\n🎉 Release ${version} complete!`);
console.log(`   View tag: https://github.com/prog893/staqan-yt-cli/releases/tag/v${version}\n`);
