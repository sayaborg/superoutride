import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [site, sha] = process.argv.slice(2);
if (!site || !/^[0-9a-f]{40}$/.test(sha ?? ''))
  throw new Error('Usage: verify-published-site.mjs <Pages URL> <commit>');
const root = new URL(site.endsWith('/') ? site : `${site}/`);
assert.ok(['http:', 'https:'].includes(root.protocol), 'Expected an HTTP site');
const run = promisify(execFile);
let failure;
for (let attempt = 1; attempt <= 10; attempt++) {
  let profile;
  try {
    const response = await fetch(new URL(`version.txt?verify=${sha}`, root), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, 'Public version is unavailable');
    assert.equal((await response.text()).trim(), sha, 'Public version has not propagated');
    profile = await mkdtemp(path.join(tmpdir(), 'superoutride-startup-'));
    const page = new URL(root);
    page.searchParams.set('verify', sha);
    const { stdout } = await run(
      process.env.CHROME_BIN ?? 'google-chrome',
      [
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${profile}`,
        '--window-size=1280,800',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=15000',
        '--dump-dom',
        page.href,
      ],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    );
    // The Session output is populated by the first completed shared-scene render, not static HTML.
    const status = stdout.match(/<output\b[^>]*aria-label="Session status"[^>]*>([\s\S]*?)<\/output>/)?.[1];
    assert.ok(status?.trim(), 'Published game did not reach its first rendered Session frame');
    console.log(JSON.stringify({ publishedCommit: sha, started: true, status: status.trim() }));
    failure = null;
    break;
  } catch (error) {
    failure = error;
    console.error(`Published startup attempt ${attempt}: ${error.message}`);
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 5000));
  } finally {
    if (profile) await rm(profile, { recursive: true, force: true });
  }
}
if (failure) throw failure;
