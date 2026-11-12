import { contentDigest } from '../core/content-digest.js';
import { missingContent, requireLoaded, type ContentKind } from './content-load-error.js';
import { decodeContentJson, readContentManifest, type ContentEntry, type ContentManifest } from './content-manifest.js';
import { UNSLICED, type WorkSlices } from '../core/work-slices.js';
import type { DocumentSource } from './document-catalog.js';

/** How delivery reads bytes: `fetch` in browsers, a file read in Node. */
export type ContentTransport = (url: URL) => Promise<Uint8Array<ArrayBuffer>>;

async function fetchContentBytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Content request failed (${response.status}): ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The values of `promises`, which run at once; a failure is the first in their order, as if they had run one after
 * another.
 */
export async function inOrder<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  return settled.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

/**
 * The promises' values, which run at once, each awaited in turn by `each` in their order: work on an earlier value
 * fails before a later promise's failure is met, as if each had been awaited only when its turn came.
 */
export async function eachInTurn<T>(promises: readonly Promise<T>[], each: (value: T, index: number) => Promise<void>) {
  for (const promise of promises) promise.catch(() => {});
  for (const [index, promise] of promises.entries()) await each(await promise, index);
}

/** A delivery: its manifest, and its entries' bytes, each verified against its digest before anything decodes it. */
export interface ContentDelivery {
  readonly manifest: ContentManifest;
  bytes(kind: ContentKind, id: string): Promise<Uint8Array<ArrayBuffer>>;
  json(kind: ContentKind, id: string): Promise<unknown>;
  /**
   * Every file of `kind` as a document source, in manifest order: all are fetched at once, each is verified against
   * its own digest, then each is decoded in turn, a unit of `slices` of its own. The one form catalogs read their
   * documents by.
   */
  documents(kind: ContentKind, slices?: WorkSlices): Promise<readonly DocumentSource[]>;
}

/** The delivery of `manifest` whose entries' verified bytes `verified` reads. */
function deliveryOf(
  manifest: ContentManifest,
  verified: (entry: ContentEntry) => Promise<Uint8Array<ArrayBuffer>>,
): ContentDelivery {
  const bytes = async (kind: ContentKind, id: string) => {
    const entry = manifest.files.find((file) => file.kind === kind && file.id === id);
    if (!entry) throw missingContent(kind, id);
    return verified(entry);
  };
  return Object.freeze({
    manifest,
    bytes,
    json: async (kind: ContentKind, id: string) => decodeContentJson(await bytes(kind, id)),
    async documents(kind: ContentKind, slices: WorkSlices = UNSLICED): Promise<readonly DocumentSource[]> {
      const entries = manifest.files.filter((file) => file.kind === kind);
      const data = await inOrder(entries.map(verified));
      const sources: DocumentSource[] = [];
      for (const [index, { id, path, sha256 }] of entries.entries()) {
        if (slices.due()) await slices.pause();
        sources.push(Object.freeze({ id, path, value: decodeContentJson(data[index]!), sha256 }));
      }
      return Object.freeze(sources);
    },
  });
}

/** The manifest is the bootstrap index; every indexed payload is verified before decoding. */
export async function loadContentManifest(
  root: URL,
  transport: ContentTransport = fetchContentBytes,
): Promise<ContentDelivery> {
  const manifest = requireLoaded(
    readContentManifest(decodeContentJson(await transport(new URL('manifest.json', root)))),
  );
  return deliveryOf(manifest, async (entry) => {
    const data = await transport(new URL(entry.path, root));
    if ((await contentDigest(data)) !== entry.sha256) throw new Error(`Content digest mismatch: ${entry.path}`);
    return data;
  });
}

/** A counted reading: its delivery's loaders run one after another through `read`. */
export interface CountedReading {
  /**
   * Run `load` over the reading's delivery. Once it returns, the files it took count as read (fetched, verified,
   * decoded and admitted), and the reading pauses if its slice is due.
   */
  read<T>(load: (content: ContentDelivery) => Promise<T>): Promise<T>;
  /** Fetch and verify every planned file not yet taken, at once; until then a loader fetches what it takes. */
  fetchAll(): void;
  /** End the reading: every planned file has been read. */
  finish(): void;
}

/**
 * A counted reading of `files`, entries of `content`'s manifest decided before reading starts. Loaders run through
 * `read` one at a time, and after each `progress` hears how many of the files are read. A loader fetches the files it
 * takes, until `fetchAll` fetches every one left at once and loaders take their bytes from there. A loader that takes a file outside the plan, a loader run while
 * another runs and a `finish` before every file is read are internal faults.
 */
export function createCountedReading(
  content: ContentDelivery,
  files: readonly ContentEntry[],
  slices: WorkSlices,
  progress: (read: number, total: number) => void,
): CountedReading {
  const planned = new Set(files);
  // The verified bytes `fetchAll` fetched, until a loader takes them; a failure is met when its loader takes the file.
  const fetched = new Map<ContentEntry, Promise<Uint8Array<ArrayBuffer>>>();
  const read = new Set<ContentEntry>();
  let taken: Set<ContentEntry> | null = null;
  const delivery = deliveryOf(content.manifest, (entry) => {
    if (!taken || !planned.has(entry)) throw new Error(`A file outside the reading's plan: ${entry.kind} ${entry.id}`);
    taken.add(entry);
    const bytes = fetched.get(entry);
    // Bytes are taken once; a file taken again is fetched again.
    fetched.delete(entry);
    return bytes ?? content.bytes(entry.kind, entry.id);
  });
  return Object.freeze({
    async read<T>(load: (content: ContentDelivery) => Promise<T>) {
      if (taken) throw new Error('A counted reading runs one loader at a time');
      const step = new Set<ContentEntry>();
      taken = step;
      try {
        const value = await load(delivery);
        for (const entry of step) read.add(entry);
        progress(read.size, planned.size);
        if (slices.due()) await slices.pause();
        return value;
      } finally {
        taken = null;
      }
    },
    fetchAll() {
      for (const entry of planned)
        if (!read.has(entry) && !fetched.has(entry)) {
          const bytes = content.bytes(entry.kind, entry.id);
          bytes.catch(() => {});
          fetched.set(entry, bytes);
        }
    },
    finish() {
      if (read.size !== planned.size)
        throw new Error(`The reading ended with ${planned.size - read.size} planned files unread`);
    },
  });
}
