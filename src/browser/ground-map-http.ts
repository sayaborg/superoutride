import { decodeGroundMapPageManifest, GroundMapPageAsset } from '../groundmap/ground-map-pages.js';
import { GroundMapPayloadStore } from '../groundmap/ground-map-payload-store.js';

interface GroundMapHttpOptions {
  readonly buildRoot: string;
  readonly payloadEncoding?: 'identity' | 'gzip';
  readonly buildSha: string;
  readonly maxManifestBytes: number;
  readonly requestTimeoutMs: number;
  readonly maxResidentBytes: number;
  readonly maxLoadingBytes: number;
}

/** One selected immutable build, one shared payload store. This never chooses a course or runs physics. */
export class GroundMapHttpSession {
  readonly #root: URL;
  readonly #options: GroundMapHttpOptions;
  readonly #fetch: typeof fetch;
  readonly #lifetime = new AbortController();
  readonly #store: GroundMapPayloadStore;
  readonly #assets = new WeakSet<GroundMapPageAsset>();
  #manifestTail: Promise<void> = Promise.resolve();

  constructor(options: GroundMapHttpOptions, fetchResource: typeof fetch = fetch) {
    const root = new URL(options.buildRoot);
    if (
      (!/^[0-9a-f]{40}$/.test(options.buildSha) && options.buildSha !== 'development') ||
      !['http:', 'https:'].includes(root.protocol) ||
      !(options.buildSha === 'development'
        ? root.pathname.endsWith('/dist/')
        : root.pathname.endsWith(`/build/${options.buildSha}/`)) ||
      root.pathname.includes('%') ||
      root.search ||
      root.hash ||
      root.username ||
      root.password
    )
      throw new Error('GroundMap requires an immutable build root matching its commit');
    for (const value of [options.maxManifestBytes, options.requestTimeoutMs])
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new RangeError('GroundMap HTTP limits must be positive safe integers');
    this.#root = new URL('ground-pages/', root);
    this.#options = Object.freeze({ ...options });
    this.#fetch = fetchResource;
    this.#store = new GroundMapPayloadStore(
      (identity) =>
        this.#read(identity.sha256, options.payloadEncoding === 'gzip' ? 'bin.gz' : 'bin', identity.byteLength, true),
      options,
    );
  }

  get accounting() {
    return this.#store.accounting;
  }

  /** Serialize manifest bodies so concurrent opens cannot multiply the configured scratch buffer. */
  open(sha256: string, signal?: AbortSignal): Promise<GroundMapPageAsset> {
    const combined = this.#signal(signal);
    combined.throwIfAborted();
    const job = this.#manifestTail.then(async () => {
      combined.throwIfAborted();
      const bytes = await this.#read(sha256, 'json', this.#options.maxManifestBytes, false, combined);
      const manifest = await decodeGroundMapPageManifest(new Uint8Array(bytes), sha256);
      combined.throwIfAborted();
      const asset = new GroundMapPageAsset(manifest);
      this.#assets.add(asset);
      return asset;
    });
    this.#manifestTail = job.then(
      () => undefined,
      () => undefined,
    );
    return waitForConsumer(job, combined);
  }

  async acquire(asset: GroundMapPageAsset, demand: Parameters<GroundMapPageAsset['acquire']>[1], signal?: AbortSignal) {
    const combined = this.#signal(signal);
    combined.throwIfAborted();
    if (!this.#assets.has(asset)) throw new Error('GroundMap asset is not bound to this build session');
    const frame = await asset.acquire(this.#store, demand, combined);
    if (combined.aborted) {
      frame.release();
      combined.throwIfAborted();
    }
    return frame;
  }

  tryAcquire(asset: GroundMapPageAsset, demand: Parameters<GroundMapPageAsset['acquire']>[1]) {
    this.#lifetime.signal.throwIfAborted();
    if (!this.#assets.has(asset)) throw new Error('GroundMap asset is not bound to this build session');
    return asset.tryAcquire(this.#store, demand);
  }

  /** The catalog is bound to the same selected build; its entries bind immutable manifest digests. */
  async catalog(): Promise<Readonly<Record<string, string>>> {
    const bytes = await this.#read('catalog', 'json', this.#options.maxManifestBytes, false);
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      parsed.kind !== 'ground-map-catalog' ||
      parsed.version !== 1 ||
      parsed.encoding !== this.#options.payloadEncoding ||
      !parsed.bindings ||
      typeof parsed.bindings !== 'object' ||
      Array.isArray(parsed.bindings)
    )
      throw new Error('invalid GroundMap product catalog');
    const entries = Object.entries(parsed.bindings);
    if (
      !entries.length ||
      entries.some(([id, digest]) => !id || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest))
    )
      throw new Error('invalid GroundMap product binding');
    return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, string>>;
  }

  dispose(): void {
    this.#lifetime.abort(new DOMException('GroundMap HTTP session disposed', 'AbortError'));
    this.#store.dispose();
  }

  #signal(signal?: AbortSignal): AbortSignal {
    return signal ? AbortSignal.any([this.#lifetime.signal, signal]) : this.#lifetime.signal;
  }

  async #read(
    sha256: string,
    extension: 'bin' | 'bin.gz' | 'json',
    limit: number,
    exact: boolean,
    consumer?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (!(sha256 === 'catalog' && extension === 'json') && !/^[0-9a-f]{64}$/.test(sha256))
      throw new Error('GroundMap resource digest invalid');
    const deadline = new AbortController();
    const signal = AbortSignal.any([this.#signal(consumer), deadline.signal]);
    signal.throwIfAborted();
    const timeout = setTimeout(
      () => deadline.abort(new DOMException('GroundMap request timed out', 'TimeoutError')),
      this.#options.requestTimeoutMs,
    );
    const url = new URL(`${sha256}.${extension}`, this.#root).href;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancel = () => {
      void reader?.cancel(signal.reason).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const response = await this.#fetch(url, {
        signal,
        redirect: 'error',
        credentials: 'same-origin',
        cache: 'force-cache',
      });
      if (response.status !== 200 || response.redirected || response.url !== url || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw new Error('GroundMap HTTP response must be a complete asset at the selected build URL');
      }
      let stream = response.body;
      if (extension === 'bin.gz') {
        let encodedBytes = 0;
        stream = stream
          .pipeThrough(
            new TransformStream<Uint8Array<ArrayBuffer>, BufferSource>({
              transform(chunk, controller) {
                encodedBytes += chunk.byteLength;
                if (encodedBytes > Math.max(1024, limit * 2))
                  throw new RangeError('GroundMap encoded response exceeds byte limit');
                controller.enqueue(chunk);
              },
            }),
          )
          .pipeThrough(new DecompressionStream('gzip'));
      }
      reader = stream.getReader();
      signal.throwIfAborted();
      const bytes = new Uint8Array(limit);
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        if (value.byteLength > limit - length) throw new RangeError('GroundMap decoded response exceeds byte limit');
        bytes.set(value, length);
        length += value.byteLength;
      }
      if (exact && length !== limit) throw new Error('GroundMap decoded response length mismatch');
      // Payloads retain the one exact allocation. Metadata is bounded separately and snapshot-decoded.
      return exact ? bytes.buffer : bytes.buffer.slice(0, length);
    } catch (error) {
      void reader?.cancel(error).catch(() => {});
      throw error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      reader?.releaseLock();
    }
  }
}

function waitForConsumer<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
