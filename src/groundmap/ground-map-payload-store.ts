import { contentDigest } from '../core/content-digest.js';

/** Encoded bytes have global content identity; palettes and geometry belong to each manifest. */
interface GroundMapPayloadIdentity {
  readonly sha256: string;
  readonly byteLength: number;
}

interface PayloadEntry {
  readonly identity: GroundMapPayloadIdentity;
  readonly ready: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  pins: number;
  bytes: Uint8Array | null;
  lastUsed: number;
}

export interface GroundMapPayloadLease {
  readByte(sha256: string, offset: number): number;
  release(): void;
}

/**
 * Application-owned encoded payload cache. Admission reserves the complete pinned set before I/O.
 * Consumer cancellation releases its pins; an admitted shared load finishes into the cache.
 * The transport returns a whole exclusive ArrayBuffer, transferred (detaching aliases) on receipt.
 */
export class GroundMapPayloadStore {
  readonly #entries = new Map<string, PayloadEntry>();
  readonly #queue: PayloadEntry[] = [];
  readonly #load: (identity: GroundMapPayloadIdentity) => Promise<ArrayBuffer>;
  readonly #maxResidentBytes: number;
  readonly #maxLoadingBytes: number;
  #loadingBytes = 0;
  #reservedBytes = 0;
  #clock = 0;
  #disposed = false;

  constructor(
    load: (identity: GroundMapPayloadIdentity) => Promise<ArrayBuffer>,
    limits: { maxResidentBytes: number; maxLoadingBytes: number },
  ) {
    for (const value of [limits.maxResidentBytes, limits.maxLoadingBytes])
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new RangeError('GroundMap capacity must be a positive safe integer');
    this.#load = load;
    this.#maxResidentBytes = limits.maxResidentBytes;
    this.#maxLoadingBytes = limits.maxLoadingBytes;
  }

  get accounting() {
    let residentBytes = 0;
    let pinnedBytes = 0;
    for (const entry of this.#entries.values()) {
      if (entry.bytes) residentBytes += entry.identity.byteLength;
      if (entry.pins > 0) pinnedBytes += entry.identity.byteLength;
    }
    return Object.freeze({
      residentBytes,
      pinnedBytes,
      reservedBytes: this.#reservedBytes,
      loadingBytes: this.#loadingBytes,
    });
  }

  async acquire(identities: readonly GroundMapPayloadIdentity[], signal?: AbortSignal): Promise<GroundMapPayloadLease> {
    if (this.#disposed) throw new Error('GroundMap payload store is disposed');
    signal?.throwIfAborted();
    const unique = new Map<string, GroundMapPayloadIdentity>();
    for (const identity of identities) {
      if (
        !/^[0-9a-f]{64}$/.test(identity.sha256) ||
        !Number.isSafeInteger(identity.byteLength) ||
        identity.byteLength <= 0
      )
        throw new RangeError('invalid GroundMap payload identity');
      const existing = unique.get(identity.sha256) ?? this.#entries.get(identity.sha256)?.identity;
      if (existing && existing.byteLength !== identity.byteLength)
        throw new Error('conflicting GroundMap payload length');
      if (identity.byteLength * 2 > this.#maxLoadingBytes)
        throw new RangeError('GroundMap payload exceeds loading capacity');
      unique.set(identity.sha256, Object.freeze({ sha256: identity.sha256, byteLength: identity.byteLength }));
    }
    const missingBytes = [...unique.values()].reduce(
      (sum, item) => sum + (this.#entries.has(item.sha256) ? 0 : item.byteLength),
      0,
    );
    const victims = [...this.#entries.values()]
      .filter((entry) => entry.pins === 0 && entry.bytes && !unique.has(entry.identity.sha256))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    const reclaimable = victims.reduce((sum, entry) => sum + entry.identity.byteLength, 0);
    if (this.#reservedBytes + missingBytes - reclaimable > this.#maxResidentBytes)
      throw new RangeError('GroundMap requested working set exceeds resident capacity');
    for (const entry of victims) {
      if (this.#reservedBytes + missingBytes <= this.#maxResidentBytes) break;
      this.#entries.delete(entry.identity.sha256);
      entry.bytes = null;
      this.#reservedBytes -= entry.identity.byteLength;
    }
    const entries: PayloadEntry[] = [];
    for (const identity of unique.values()) {
      let entry = this.#entries.get(identity.sha256);
      if (!entry) {
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const ready = new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        entry = { identity, ready, resolve, reject, pins: 0, bytes: null, lastUsed: 0 };
        this.#entries.set(identity.sha256, entry);
        this.#reservedBytes += identity.byteLength;
        this.#queue.push(entry);
      }
      entry.pins++;
      entry.lastUsed = ++this.#clock;
      entries.push(entry);
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      for (const entry of entries) {
        entry.pins--;
        entry.lastUsed = ++this.#clock;
      }
    };
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      if (signal) {
        onAbort = () => {
          release();
          reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    this.#pump();
    try {
      await Promise.race([Promise.all(entries.map((entry) => entry.ready)), aborted]);
      signal?.throwIfAborted();
      return createLease(entries, () => released, release);
    } catch (error) {
      release();
      throw error;
    } finally {
      if (onAbort) signal!.removeEventListener('abort', onAbort);
    }
  }

  /** A synchronous cache hit never starts transport, evicts data or changes the scheduler. */
  tryAcquire(identities: readonly GroundMapPayloadIdentity[]): GroundMapPayloadLease | null {
    if (this.#disposed) throw new Error('GroundMap payload store is disposed');
    const entries: PayloadEntry[] = [];
    const seen = new Set<string>();
    for (const identity of identities) {
      const entry = this.#entries.get(identity.sha256);
      if (!entry?.bytes) return null;
      if (entry.identity.byteLength !== identity.byteLength) throw new Error('conflicting GroundMap payload length');
      if (seen.has(identity.sha256)) continue;
      seen.add(identity.sha256);
      entries.push(entry);
    }
    for (const entry of entries) {
      entry.pins++;
      entry.lastUsed = ++this.#clock;
    }
    let released = false;
    return createLease(
      entries,
      () => released,
      () => {
        if (released) return;
        released = true;
        for (const entry of entries) {
          entry.pins--;
          entry.lastUsed = ++this.#clock;
        }
      },
    );
  }

  /** Session shutdown invalidates readers and drops cached bytes; active transports settle separately. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#queue.splice(0)) {
      this.#entries.delete(entry.identity.sha256);
      this.#reservedBytes -= entry.identity.byteLength;
      entry.reject(new Error('GroundMap payload store is disposed'));
    }
    for (const entry of this.#entries.values()) {
      if (!entry.bytes) continue;
      entry.bytes = null;
      this.#entries.delete(entry.identity.sha256);
      this.#reservedBytes -= entry.identity.byteLength;
    }
  }

  #pump(): void {
    while (this.#queue.length) {
      const entry = this.#queue[0]!;
      const workingBytes = entry.identity.byteLength * 2;
      if (this.#loadingBytes + workingBytes > this.#maxLoadingBytes) return;
      this.#queue.shift();
      this.#loadingBytes += workingBytes;
      void this.#fill(entry).finally(() => {
        this.#loadingBytes -= workingBytes;
        this.#pump();
      });
    }
  }

  async #fill(entry: PayloadEntry): Promise<void> {
    try {
      const input = await this.#load(entry.identity);
      if (!(input instanceof ArrayBuffer) || input.byteLength !== entry.identity.byteLength)
        throw new Error('GroundMap payload byte length mismatch');
      const bytes = new Uint8Array(structuredClone(input, { transfer: [input] }));
      if ((await contentDigest(bytes)) !== entry.identity.sha256) throw new Error('GroundMap payload digest mismatch');
      if (this.#disposed) throw new Error('GroundMap payload store is disposed');
      entry.bytes = bytes;
      entry.resolve();
    } catch (error) {
      this.#entries.delete(entry.identity.sha256);
      this.#reservedBytes -= entry.identity.byteLength;
      entry.reject(error);
    }
  }
}

function createLease(
  entries: readonly PayloadEntry[],
  released: () => boolean,
  release: () => void,
): GroundMapPayloadLease {
  const permitted = new Map(entries.map((entry) => [entry.identity.sha256, entry]));
  return Object.freeze({
    readByte(sha256: string, offset: number): number {
      const entry = permitted.get(sha256);
      if (released() || !entry?.bytes) throw new Error('GroundMap payload is not pinned by this lease');
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= entry.bytes.byteLength)
        throw new RangeError('GroundMap payload byte outside bounds');
      return entry.bytes[offset]!;
    },
    release,
  });
}
