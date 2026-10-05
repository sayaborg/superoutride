import { loadContentManifest, type ContentDelivery, type ContentTransport } from '../content/content-delivery.js';
import { WORKBENCH_DELIVERY, WORKBENCH_REQUEST } from '../content/workbench-delivery.js';

/** Seconds a page opened by the workbench waits for its delivery. */
const WORKBENCH_TIMEOUT_SECONDS = 10;

let delivery: Promise<ContentDelivery> | undefined;

/**
 * The page's delivery. A page with the `workbench` parameter takes the delivery of the workbench page that opened it,
 * through the same manifest and digest checks; without that page it fails. Every other page fetches `../delivery/`.
 */
export function browserContent() {
  const root = new URL('../delivery/', import.meta.url);
  return (delivery ??= loadContentManifest(root, isWorkbenchRun() ? workbenchTransport(root) : undefined));
}

/** Whether this page runs the workbench's build. */
export function isWorkbenchRun(): boolean {
  return new URLSearchParams(location.search).has('workbench');
}

/** Each requested file's bytes from the delivery the opening workbench sends once, by path under `root`. */
function workbenchTransport(root: URL): ContentTransport {
  const files = new Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>>((resolve, reject) => {
    const workbench = window.opener as Window | null;
    if (!workbench) {
      reject(new Error('No workbench: this page was not opened by the workbench'));
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('The workbench did not send its build')),
      WORKBENCH_TIMEOUT_SECONDS * 1000,
    );
    const receive = ({ data, source, origin }: MessageEvent) => {
      if (source !== workbench || origin !== location.origin || data?.type !== WORKBENCH_DELIVERY) return;
      clearTimeout(timer);
      removeEventListener('message', receive);
      resolve(new Map(data.files as [string, Uint8Array<ArrayBuffer>][]));
    };
    addEventListener('message', receive);
    workbench.postMessage({ type: WORKBENCH_REQUEST }, location.origin);
  });
  return async (url) => {
    const path = url.href.startsWith(root.href) ? url.href.slice(root.href.length) : null;
    const bytes = path === null ? undefined : (await files).get(path);
    if (!bytes) throw new Error(`Not in the workbench build: ${url.pathname}`);
    return bytes;
  };
}
