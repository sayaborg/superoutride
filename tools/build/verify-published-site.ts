import { loadContentManifest } from '../../src/content/content-delivery.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { compileContent } from '../authoring/compile-content.js';
import { openPublishedStore } from '../browser-shared/published-store.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [site, sha] = process.argv.slice(2);
if (!site || !sha || !/^[0-9a-f]{40}$/.test(sha))
  throw new Error('Usage: verify-published-site.ts <Pages URL> <commit>');
const root = new URL(site.endsWith('/') ? site : `${site}/`);
assert.ok(['http:', 'https:'].includes(root.protocol), 'Expected an HTTP site');
/** How long, in real time, the game has to start in headless Chrome. */
const STARTUP_MILLISECONDS = 60000;

/**
 * Open `page` in headless Chrome and return the course performance HUD's text once a rendered frame fills it, polled
 * over the DevTools protocol (on Chrome's pipe) in real time, or null if none has after `STARTUP_MILLISECONDS`. Real
 * time, not a virtual-time budget: Chrome advances virtual time to the next timer whenever the page waits on real I/O,
 * so a budget's reach would depend on the machine. The deadline ends every wait: a call Chrome does not answer, and
 * Chrome's exit, which is forced once the deadline has passed.
 */
async function startedStatus(page: URL, userDataDirectory: string): Promise<string | null> {
  const chrome = spawn(
    process.env.CHROME_BIN ?? 'google-chrome',
    [
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--user-data-dir=${userDataDirectory}`,
      '--window-size=1280,800',
      '--remote-debugging-pipe',
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  const toChrome = chrome.stdio[3] as Writable,
    fromChrome = chrome.stdio[4] as Readable;
  // Calls awaiting their answers; all of them fail once Chrome cannot answer.
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let lost: Error | null = null;
  const fail = (error: Error) => {
    lost ??= error;
    for (const call of pending.values()) call.reject(lost);
    pending.clear();
  };
  toChrome.on('error', fail);
  fromChrome.on('error', fail);
  const exited = new Promise<void>((resolve) => {
    chrome.once('error', (error) => (fail(error), resolve()));
    chrome.once('close', () => (fail(new Error('Chrome exited')), resolve()));
  });
  // The one deadline: when it passes, every call still waiting fails and every wait below ends.
  let expired = false;
  let expire!: () => void;
  const deadline = new Promise<void>((resolve) => (expire = resolve));
  const timer = setTimeout(() => {
    expired = true;
    fail(new Error(`No rendered frame within ${STARTUP_MILLISECONDS} ms`));
    expire();
  }, STARTUP_MILLISECONDS);
  // Messages are JSON, each ended by a NUL byte.
  let buffered = '',
    next = 0;
  fromChrome.setEncoding('utf8');
  fromChrome.on('data', (chunk: string) => {
    const messages = (buffered + chunk).split('\0');
    buffered = messages.pop()!;
    for (const text of messages) {
      const message = JSON.parse(text) as { id?: number; result?: unknown; error?: { message: string } };
      const call = message.id === undefined ? undefined : pending.get(message.id);
      if (!call) continue;
      pending.delete(message.id!);
      if (message.error) call.reject(new Error(message.error.message));
      else call.resolve(message.result);
    }
  });
  const send = <T>(method: string, params: object = {}, sessionId?: string) =>
    new Promise<T>((resolve, reject) => {
      if (lost) return reject(lost);
      const id = ++next;
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      toChrome.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  try {
    const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url: page.href });
    const { sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
    const expression = `document.querySelector('output[aria-label="Course performance"]')?.textContent ?? ''`;
    while (!expired) {
      const { result } = await send<{ result: { value: string } }>(
        'Runtime.evaluate',
        { expression, returnByValue: true },
        sessionId,
      );
      if (result.value.trim()) return result.value.trim();
      // Read again after the HUD's reporting period, about half a second.
      await Promise.race([new Promise((resolve) => setTimeout(resolve, 500)), deadline]);
    }
    return null;
  } catch (error) {
    if (expired) return null;
    throw error;
  } finally {
    chrome.kill();
    await Promise.race([exited, deadline]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    clearTimeout(timer);
  }
}
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
    // The performance HUD is filled by rendered frames of the shared scene, not static HTML.
    const status = await startedStatus(page, userDataDirectory);
    assert.ok(status, 'Published game did not reach its first rendered run frame');
    // Each browser tool's one address leads to this build's page, the course viewer's too. An editing page's store is
    // the build's published authored files: the authoring core compiles them over HTTP, as the pages do, into exactly
    // the published delivery (checked once).
    const workbenchPage: URL = new URL(`build/${sha}/tools/workbench/workbench.html`, root);
    const spriteEditorPage: URL = new URL(`build/${sha}/tools/sprite-editor/sprite-editor.html`, root);
    const courseEditorPage: URL = new URL(`build/${sha}/tools/course-editor/course-editor.html`, root);
    const courseViewerPage: URL = new URL(`build/${sha}/tools/course-viewer/course-viewer.html`, root);
    for (const url of [
      new URL('workbench.html', root),
      workbenchPage,
      new URL('workbench.js', workbenchPage),
      new URL('sprite-editor.html', root),
      spriteEditorPage,
      new URL('sprite-editor.js', spriteEditorPage),
      new URL('sprite-editor.css', spriteEditorPage),
      new URL('sprite-import-worker.js', spriteEditorPage),
      new URL('sprite-look-worker.js', spriteEditorPage),
      new URL('course-editor.html', root),
      courseEditorPage,
      new URL('course-editor.js', courseEditorPage),
      new URL('course-editor.css', courseEditorPage),
      new URL('course-viewer.html', root),
      courseViewerPage,
      new URL('course-viewer.js', courseViewerPage),
      // The editing frame's worker and stylesheet are found from the build's root, not beside the page.
      new URL('../browser-shared/compile-worker.js', workbenchPage),
      new URL('../browser-shared/editor-frame.css', workbenchPage),
    ] as URL[])
      assert.equal((await fetch(url, { cache: 'no-store' })).status, 200, `Browser tool file unavailable: ${url}`);
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
        status,
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
