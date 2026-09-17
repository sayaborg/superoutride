import type { GroundColorReader } from '../render/renderer.js';
import type { GroundMapPageAsset } from '../groundmap/ground-map-pages.js';
import { GroundMapHttpSession } from './ground-map-http.js';
import { ReadyFrameController } from './ready-frame.js';
import type { FrameLoop } from './frame-loop.js';

interface GroundRequest {
  readonly sourceId: string;
  readonly samples: readonly { readonly s: number; readonly deltaSEffective: number }[];
  /** Runtime-owned window -> source mapping, also applied to demand before acquiring pages. */
  readonly sourceS?: (s: number) => number;
}
type DrawReader = GroundColorReader;
type GroundStatus = (state: 'loading' | 'ready' | 'failed', error?: unknown) => void;
interface PreparedFrame {
  readonly draw: () => void;
  release(): void;
}

// Explicit application limits, not a declaration of target-device acceptance. A miss never lowers LOD.
export const PRODUCT_GROUND_LIMITS = Object.freeze({
  maxManifestBytes: 4 * 1024 * 1024,
  maxResidentBytes: 64 * 1024 * 1024,
  maxLoadingBytes: 8 * 1024 * 1024,
  requestTimeoutMs: 30000,
});

/** One presentation lifecycle for every course root. Geometry and gameplay never await network work. */
export class GroundPresentation {
  readonly #session: GroundMapHttpSession;
  readonly #ready: ReadyFrameController<PreparedFrame>;
  readonly #assets = new Map<string, GroundMapPageAsset>();
  readonly #opening = new Map<string, Promise<GroundMapPageAsset>>();
  readonly #status: GroundStatus;
  #catalog: Promise<Readonly<Record<string, string>>> | null = null;
  #generation = 0;
  #prefetching = false;
  #prefetchKey = '';

  constructor(
    loop: FrameLoop,
    suspend: (waiting: boolean) => void,
    status: GroundStatus,
    session?: GroundMapHttpSession,
  ) {
    const root = new URL('../', import.meta.url);
    const sha = /\/build\/([0-9a-f]{40})\/$/.exec(root.pathname)?.[1] ?? 'development';
    this.#session =
      session ??
      new GroundMapHttpSession({
        ...PRODUCT_GROUND_LIMITS,
        buildRoot: root.href,
        buildSha: sha,
        payloadEncoding: 'gzip',
      });
    this.#status = status;
    this.#ready = new ReadyFrameController(loop, (frame) => frame.draw(), suspend);
  }

  draw(request: GroundRequest, draw: (reader: DrawReader) => void): void {
    const generation = ++this.#generation;
    const samples = request.sourceS
      ? request.samples.map((sample) => ({ ...sample, s: request.sourceS!(sample.s) }))
      : request.samples;
    const prepare = (lease: Awaited<ReturnType<GroundMapHttpSession['acquire']>>): PreparedFrame => {
      const source = lease.reader;
      const reader: DrawReader = request.sourceS
        ? {
            kind: 'baked',
            kMax: source.kMax,
            selectLevel: (footprint) => source.selectLevel(footprint),
            sampleAtLevel: (s, l, level) => source.sampleAtLevel(request.sourceS!(s), l, level),
          }
        : source;
      return { draw: () => draw(reader), release: lease.release };
    };
    try {
      const asset = this.#assets.get(request.sourceId);
      const resident = asset && this.#session.tryAcquire(asset, asset.rowDemand(samples));
      if (resident) {
        this.#ready.presentReady(prepare(resident));
        this.#status('ready');
        this.#prefetch(asset!, asset!.rowDemand(samples));
        return;
      }
    } catch (error) {
      this.#wait(async () => {
        throw error;
      }, generation);
      return;
    }
    this.#wait(async (signal) => {
      const asset = await this.#open(request.sourceId);
      signal.throwIfAborted();
      const demand = asset.rowDemand(samples);
      const frame = prepare(await this.#session.acquire(asset, demand, signal));
      this.#prefetch(asset, demand);
      return frame;
    }, generation);
  }

  retry(): void {
    const generation = this.#generation;
    this.#status('loading');
    void this.#ready.retry().then((success) => {
      if (generation === this.#generation) this.#status(success ? 'ready' : 'failed', this.#ready.error);
    });
  }

  dispose(): void {
    this.#generation++;
    this.#ready.dispose();
    this.#session.dispose();
    this.#assets.clear();
    this.#opening.clear();
  }

  #wait(load: (signal: AbortSignal) => Promise<PreparedFrame>, generation: number): void {
    this.#status('loading');
    void this.#ready.replace(load).then((success) => {
      if (generation === this.#generation) this.#status(success ? 'ready' : 'failed', this.#ready.error);
    });
  }

  #prefetch(asset: GroundMapPageAsset, demand: Parameters<GroundMapPageAsset['acquire']>[1]): void {
    if (this.#prefetching) return;
    const adjacent = asset.adjacentDemand(demand);
    if (!adjacent.length) return;
    const key = asset.manifest.identity.sourceId + JSON.stringify(adjacent);
    if (key === this.#prefetchKey) return;
    this.#prefetchKey = key;
    try {
      const ready = this.#session.tryAcquire(asset, adjacent);
      if (ready) {
        ready.release();
        return;
      }
    } catch {
      // Optional cached data must not invalidate a separately validated required frame.
      return;
    }
    this.#prefetching = true;
    // Optional demand uses the same admission limit. Failure is retried by the required frame path.
    void this.#session
      .acquire(asset, adjacent)
      .then(
        (lease) => lease.release(),
        () => {},
      )
      .finally(() => {
        this.#prefetching = false;
      });
  }

  #open(id: string): Promise<GroundMapPageAsset> {
    const asset = this.#assets.get(id);
    if (asset) return Promise.resolve(asset);
    const existing = this.#opening.get(id);
    if (existing) return existing;
    this.#catalog ??= this.#session.catalog().catch((error) => {
      this.#catalog = null;
      throw error;
    });
    const pending = this.#catalog
      .then(async (bindings) => {
        const digest = bindings[id];
        if (!digest) throw new Error(`GroundMap source absent from build: ${id}`);
        const loaded = await this.#session.open(digest);
        this.#assets.set(id, loaded);
        return loaded;
      })
      .finally(() => this.#opening.delete(id));
    this.#opening.set(id, pending);
    return pending;
  }
}
