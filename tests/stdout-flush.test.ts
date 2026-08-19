/**
 * Regression guard for #161: large output must survive a pipe.
 *
 * The trigger is `ora`. Importing it pulls in restore-cursor and signal-exit,
 * which patch process exit, and the process can then terminate with part of a
 * stdout write still queued. Merely constructing a spinner is enough; it does
 * not have to be started. Every command that reports progress goes through
 * withSpinner, so every one of them was exposed.
 *
 * That is why a payload over the 64KB pipe buffer came out cut at exactly
 * 65536 bytes with a 0 exit code: unparseable JSON, or a silently wrong total
 * for any other format.
 *
 * These tests drive real child processes through real pipes. An in-process
 * assertion cannot observe the exit race, and writing to a file never
 * truncates, so the file path is used only as the reference for byte
 * comparison.
 */
import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const PIPE_BUFFER_BYTES = 65536;
// How far past the buffer a truncated write may land. The cut point is a race
// between process exit and the pipe drain, so it is not exactly the buffer
// size every time; CI has been seen at 65537. Kept far below the full payload
// so the band still distinguishes truncation from a complete write.
const TRUNCATION_SLOP_BYTES = 64;
const ROWS = 4000;
const UTILS = path.resolve('lib/utils');
// Absolute specifiers: the scripts run from a temp dir, where a bare 'ora'
// would not resolve to this project's node_modules.
const ORA = path.resolve('node_modules/ora/index.js');

/** Payload comfortably past the pipe buffer, and valid JSON so it can be parsed. */
const PAYLOAD = `JSON.stringify(Array.from({ length: ${ROWS} }, (_, i) => ({ i, pad: 'x'.repeat(40) })), null, 2)`;

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'staqan-flush-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Write a script and run it behind a real shell pipe.
 *
 * It has to be a shell `|`. Handing the child's stdout straight to spawnSync
 * does NOT reproduce the defect, because spawnSync drains the pipe as fast as
 * the child fills it, so the buffer never backs up and the exit race never
 * happens. `bun script | cat` is what a user actually types.
 */
async function runPiped(dir: string, body: string): Promise<{ stdout: string; status: number | null }> {
  const file = path.join(dir, `s${Math.random().toString(36).slice(2)}.ts`);
  await fs.writeFile(file, body, 'utf-8');
  const r = spawnSync('bash', ['-c', `bun ${JSON.stringify(file)} 2>/dev/null | cat`], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { stdout: r.stdout ?? '', status: r.status };
}

describe('writeStdout under the ora exit hooks (issue #161)', () => {
  it('console.log truncates at the pipe buffer once ora is loaded', async () => {
    // Pins the defect itself. If this ever stops truncating, the runtime or
    // ora has changed and writeStdout can be reconsidered, rather than being
    // carried forever on an assumption nobody rechecks.
    const out = await inTempDir((dir) => runPiped(dir,
      `import ora from '${ORA}';
       ora('spinner');
       console.log(${PAYLOAD});`));

    // Asserted as a band, not as exactly PIPE_BUFFER_BYTES (issue #170). Where
    // the write is cut is a race between process exit and the pipe drain, so
    // CI intermittently observed 65537 and failed PRs that touched nothing
    // near this code. The claim being pinned is "truncated, at the pipe
    // boundary", and the full payload is roughly 4.7x the buffer, so the band
    // cannot be reached by anything except truncation right there.
    expect(out.stdout.length).toBeGreaterThanOrEqual(PIPE_BUFFER_BYTES);
    expect(out.stdout.length).toBeLessThan(PIPE_BUFFER_BYTES + TRUNCATION_SLOP_BYTES);
  });

  it('the same payload is complete without ora, which is why this was missed', async () => {
    const out = await inTempDir((dir) => runPiped(dir, `console.log(${PAYLOAD});`));
    expect(out.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
  });

  it('writeStdout survives the same conditions intact', async () => {
    const out = await inTempDir((dir) => runPiped(dir,
      `import ora from '${ORA}';
       import { writeStdout } from '${UTILS}';
       const s = ora('spinner').start(); s.succeed('done');
       await writeStdout(${PAYLOAD} + '\\n');`));
    expect(out.status).toBe(0);
    expect(out.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    expect(out.stdout.length).not.toBe(PIPE_BUFFER_BYTES);
  });

  it('writeStdout output parses in a strict JSON parser', async () => {
    const out = await inTempDir((dir) => runPiped(dir,
      `import ora from '${ORA}';
       import { writeStdout } from '${UTILS}';
       ora('spinner');
       await writeStdout(${PAYLOAD} + '\\n');`));
    expect(() => JSON.parse(out.stdout)).not.toThrow();
    expect(JSON.parse(out.stdout)).toHaveLength(ROWS);
  });

  it('writeStdout gives byte-identical output through a pipe and to a file', async () => {
    await inTempDir(async (dir) => {
      const file = path.join(dir, 'script.ts');
      const target = path.join(dir, 'out.txt');
      await fs.writeFile(file,
        `import ora from '${ORA}';
         import { writeStdout } from '${UTILS}';
         ora('spinner');
         await writeStdout(${PAYLOAD} + '\\n');`, 'utf-8');
      const piped = spawnSync('bun', [file], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '';
      spawnSync('bash', ['-c', `bun ${JSON.stringify(file)} > ${JSON.stringify(target)} 2>/dev/null`]);
      const redirected = await fs.readFile(target, 'utf-8');
      expect(piped).toBe(redirected);
      expect(piped.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
    });
  });

  it('resolves rather than rejecting when the consumer closes early (EPIPE)', async () => {
    await inTempDir(async (dir) => {
      const file = path.join(dir, 'epipe.ts');
      await fs.writeFile(file,
        `import { writeStdout } from '${UTILS}';
         await writeStdout(${PAYLOAD} + '\\n');
         await writeStdout('done\\n');`, 'utf-8');
      // `| head -1` closes the read end early. That is a normal thing for a
      // consumer to do and must not surface as a command failure.
      const r = spawnSync('bash', ['-c', `bun ${JSON.stringify(file)} 2>/dev/null | head -1`], { encoding: 'utf-8' });
      expect(r.status).toBe(0);
    });
  });
});
