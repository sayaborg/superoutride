import { compileContent } from '../authoring/compile-content.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createLayeredStore } from '../authoring/layered-store.js';
import { openPublishedStore } from './published-store.js';
import type { CompileRequest, CompileResponse } from './compile-protocol.js';

/** The workbench's compiler, off the page's thread: one authoring-core compile per request. */
const bases = new Map<string, Promise<ContentStore>>();
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<CompileRequest>) => void): void;
  postMessage(message: CompileResponse, transfer: Transferable[]): void;
};

scope.addEventListener('message', async ({ data }) => {
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  let response: CompileResponse;
  try {
    let base = bases.get(data.root);
    if (!base) bases.set(data.root, (base = openPublishedStore(new URL(data.root)).then(({ store }) => store)));
    const result = await compileContent(createLayeredStore(await base, new Map(data.changes)));
    response = result.ok
      ? { generation: data.generation, seconds: seconds(), ok: true, files: result.value.files }
      : { generation: data.generation, seconds: seconds(), ok: false, diagnostics: result.diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response = {
      generation: data.generation,
      seconds: seconds(),
      ok: false,
      diagnostics: [{ kind: 'internal', code: 'internal_error', document: '', path: '', message }],
    };
  }
  scope.postMessage(response, response.ok ? [...new Set(response.files.map((file) => file.bytes.buffer))] : []);
});
