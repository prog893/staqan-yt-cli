#!/usr/bin/env bun

/**
 * preversion script - runs before npm bumps the version
 * Run safety checks to ensure we're ready for release
 */

import { execSync } from 'child_process';
import { join } from 'path';

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

  console.log('\n✅ All safety checks passed!\n');
}

runSafetyChecks();
