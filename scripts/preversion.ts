#!/usr/bin/env bun

/**
 * preversion script - runs before npm bumps the version
 * Run safety checks to ensure we're ready for release
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const tapDir = join(rootDir, 'homebrew-tap');
const tapRemote = 'git@github.com:prog893/homebrew-tap.git';

/**
 * Execute a command and return output
 */
function exec(cmd: string, cwd: string = rootDir): string {
  return execSync(cmd, { encoding: 'utf-8', cwd }).trim();
}

function git(cmd: string): string {
  return exec(cmd);
}

/**
 * Safety checks before version bump
 */
function runSafetyChecks(): void {
  console.log('🔍 Running pre-version safety checks...\n');

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

  // 3. Check git is clean (npm does this too, but we check first)
  try {
    const status = git('git status --porcelain');
    if (status) {
      console.error('❌ Working directory is not clean');
      console.error('Please commit or stash changes first');
      process.exit(1);
    }
  } catch {
    // git status --porcelain returns empty string if clean
  }
  console.log('  ✓ Working directory is clean');

  // 4. Clone or pull homebrew-tap, verifying it's the right repo
  if (existsSync(tapDir)) {
    const remoteUrl = exec('git remote get-url origin', tapDir);
    if (remoteUrl !== tapRemote) {
      console.error(`❌ homebrew-tap remote mismatch: expected ${tapRemote}, got ${remoteUrl}`);
      process.exit(1);
    }
    console.log('  ↓ Pulling latest homebrew-tap...');
    exec('git pull', tapDir);
    console.log('  ✓ homebrew-tap up to date');
  } else {
    console.log('  ↓ Cloning homebrew-tap...');
    exec(`git clone ${tapRemote} homebrew-tap`);
    console.log('  ✓ Cloned homebrew-tap');
  }

  console.log('\n✅ All safety checks passed!\n');
}

runSafetyChecks();
