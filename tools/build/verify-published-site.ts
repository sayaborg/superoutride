import { loadContentManifest } from '../../src/content/content-delivery.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { compileContent } from '../authoring/compile-content.js';
import { openPublishedStore } from '../workbench/published-store.js';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [site, sha] = process.argv.slice(2);
if (!site || !sha || !/^[0-9a-f]{40}$/.test(sha))
  throw new Error('Usage: verify-published-site.ts <Pages URL> <commit>');
const root = new URL(site.endsWith('/') ? site : `${site}/`);
assert.ok(['http:', 'https:'].includes(root.protocol), 'Expected an HTTP site');
const run = promisify(execFile);
let failure: unknown;
for (let attempt = 1; attempt <= 10; attempt++) {
  let userDataDirectory: string | undefined;
  try {
    const response: Response = await fetch(new URL(`version.txt?verify=${sha}`, root), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, 'Public version is unavailable');
    assert.equal((await response.text()).trim(), sha, 'Public version has not propagated');
    const content = await loadContentManifest(new URL(`build/${sha}/delivery/`, root));
    for (const entry of content.manifest.files) await content.bytes(entry.kind, entry.id);
    userDataDirectory = await mkdtemp(path.join(tmpdir(), 'superoutride-startup-'));
    // A URL that names a course starts its run directly; the first indexed course is the default. DEV adds the
    // performance HUD, which only rendered frames fill.
    const page = new URL(root);
    page.searchParams.set('course', (await loadCourseIndex(content))[0]!.id);
    page.searchParams.set('dev', '1');
    page.searchParams.set('verify', sha);
    const { stdout } = await run(
      process.env.CHROME_BIN ?? 'google-chrome',
      [
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDirectory}`,
        '--window-size=1280,800',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=15000',
        '--dump-dom',
        page.href,
      ],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
    );
    // The performance HUD is filled by rendered frames of the shared scene, not static HTML.
    const status = stdout.match(/<output\b[^>]*aria-label="Course performance"[^>]*>([\s\S]*?)<\/output>/)?.[1];
    assert.ok(status && status.trim(), 'Published game did not reach its first rendered Session frame');
    // The workbench's one address leads to this build's workbench, whose store is the build's published authored
    // files: the authoring core compiles them over HTTP, as the page does, into exactly the published delivery.
    const workbenchPage: URL = new URL(`build/${sha}/tools/workbench/workbench.html`, root);
    for (const url of [new URL('workbench.html', root), workbenchPage, new URL('workbench.js', workbenchPage)] as URL[])
      assert.equal((await fetch(url, { cache: 'no-store' })).status, 200, `Workbench file unavailable: ${url}`);
    const published = await openPublishedStore(new URL(`build/${sha}/authored/`, root));
    assert.equal(published.index.commit, sha, 'Published authored files belong to another commit');
    const compiled = await compileContent(published.store);
    assert.ok(
      compiled.ok,
      `Published authored files do not compile: ${JSON.stringify(!compiled.ok && compiled.diagnostics)}`,
    );
    for (const file of compiled.value.files) {
      const entry = content.manifest.files.find(
        (delivered) => delivered.kind === file.kind && delivered.id === file.id,
      );
      assert.equal(
        await contentDigest(file.bytes),
        entry?.sha256,
        `Workbench product differs: ${file.kind} ${file.id}`,
      );
    }
    console.log(
      JSON.stringify({
        publishedCommit: sha,
        started: true,
        verifiedFiles: content.manifest.files.length,
        status: status.trim(),
        workbenchFiles: published.index.files.length,
      }),
    );
    failure = null;
    break;
  } catch (error) {
    failure = error;
    console.error(`Published startup attempt ${attempt}: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 5000));
  } finally {
    if (userDataDirectory) await rm(userDataDirectory, { recursive: true, force: true });
  }
}
if (failure) throw failure;
