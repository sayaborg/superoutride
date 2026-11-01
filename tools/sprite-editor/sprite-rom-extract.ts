import type { RomExtractAnswer, RomExtractRequest, RomZipsAnswer, RomZipsRequest } from './sprite-rom-worker.js';
import { createWorkerRequests } from './worker-requests.js';

/**
 * The ROM size set an original picture shows, from its name: ENDURO RACER's `enduror-<five hex digits>`, the size
 * set's address (road data's `pictureName`), then `-mirrored` when reflected and `-unshaded` for the picture drawn
 * without shadows; null for a name of another original.
 */
export function romPicture(name: string): { readonly address: number; readonly mirrored: boolean } | null {
  const found = /^enduror-([0-9a-f]{5})(-mirrored)?(?:-unshaded)?$/.exec(name);
  return found ? { address: parseInt(found[1]!, 16), mirrored: !!found[2] } : null;
}

/** A palette's number from its name (`p046`: 46), as road data names the originals' palettes. */
export const romPalette = (name: string) => (/^p(\d+)$/.test(name) ? Number(name.slice(1)) : null);

/** An extract: the ROM's pixels of a size set, `width` by `height`. */
export type RomExtract = ImageData;

/**
 * The ROM extracts K's dropped zips give (MAME's `enduror` and `endurobl` for ENDURO RACER), read in a worker of their
 * own (`sprite-rom-worker`). The zips and the extracts live in the worker and this page alone: never in the working
 * state, the browser's storage or an archive, and gone when the page closes. `status` says which zips are read and,
 * while the set is not whole, what it lacks in the ROM set's own words.
 */
export function createRomExtracts() {
  type Answer = { readonly id: number; readonly error?: string } & Partial<RomZipsAnswer & RomExtractAnswer>;
  const ask = createWorkerRequests<Answer>('../../tools/sprite-editor/sprite-rom-worker.js', 'ROM');
  const listeners = new Set<() => void>();
  const extracts = new Map<string, Promise<RomExtract | null>>();
  let zips: readonly string[] = [],
    ready = false,
    problem: string | null = null;
  const told = () => listeners.forEach((listener) => listener());
  return {
    /** Read dropped zips with those read before. */
    async load(files: readonly File[]) {
      const read = await Promise.all(
        files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
      );
      try {
        const answer = await ask({ kind: 'zips', zips: read } satisfies Omit<RomZipsRequest, 'id'>, [
          ...read.map((zip) => zip.bytes.buffer),
        ]);
        [zips, ready, problem] = [answer.zips ?? [], !!answer.ready, answer.missing ?? null];
      } catch (error) {
        problem = error instanceof Error ? error.message : String(error);
      }
      extracts.clear();
      told();
    },
    /** What the ROM extract has: the zips read and whether the set is whole, else what it lacks. */
    status(): string {
      if (ready) return `ROM extract from ${zips.join(' and ')}.`;
      const read = zips.length ? `Read ${zips.join(' and ')}. ` : '';
      return `${read}${problem ?? 'Drop enduror.zip and endurobl.zip on the page to see the ROM’s own pixels.'}`;
    },
    ready: () => ready,
    /** The extract of original picture `name` in palette `palette` (its name, `p046`), or null when there is none. */
    extract(name: string, palette: string): Promise<RomExtract | null> {
      const picture = romPicture(name),
        number = romPalette(palette);
      if (!ready || !picture || number === null) return Promise.resolve(null);
      const key = `${name} ${palette}`;
      if (!extracts.has(key))
        extracts.set(
          key,
          ask({ kind: 'extract', ...picture, palette: number } satisfies Omit<RomExtractRequest, 'id'>).then(
            ({ width, height, rgba }) => (width && height && rgba ? new ImageData(rgba, width, height) : null),
            () => null,
          ),
        );
      return extracts.get(key)!;
    },
    /** Hear zips read. */
    subscribe(listener: () => void) {
      listeners.add(listener);
    },
  };
}

export type RomExtracts = ReturnType<typeof createRomExtracts>;
