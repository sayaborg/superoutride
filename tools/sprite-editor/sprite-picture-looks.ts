import type { PictureLook, PictureLookRequest } from './sprite-look-worker.js';

/** A thumbnail's side, in screen pixels. */
export const THUMBNAIL = 48;

/** What a picture's look is worked out from: its files' bytes, and the paths and revisions that name them. */
export type PictureLookInput = Omit<PictureLookRequest, 'id'>;

export type PictureLooks = ReturnType<typeof createPictureLooks>;

/**
 * The list's pictures' looks (`PictureLook`) in a worker of their own, found from the build root as the import worker
 * is. Each look is kept by its key (its inputs' paths and revisions), so a change of the working state works out again
 * only the pictures whose files changed; `keep` forgets the looks no longer listed. A worker that fails answers no more
 * looks: each is shown without its outline mark and thumbnail.
 */
export function createPictureLooks() {
  const worker = new Worker(new URL('../../tools/sprite-editor/sprite-look-worker.js', location.href), {
    type: 'module',
  });
  const waiting = new Map<number, (look: PictureLook) => void>();
  const none: PictureLook = { iou: null, thumbnail: null };
  let id = 0,
    failed = false;
  worker.addEventListener('message', ({ data }: MessageEvent<{ id: number } & Partial<PictureLook>>) => {
    waiting.get(data.id)?.({ iou: data.iou ?? null, thumbnail: data.thumbnail ?? null });
    waiting.delete(data.id);
  });
  worker.addEventListener('error', () => {
    failed = true;
    for (const resolve of waiting.values()) resolve(none);
    waiting.clear();
  });
  const looks = new Map<string, Promise<PictureLook>>();
  return {
    /** The look of the picture whose inputs `key` names, worked out from `input` (read only when it is not kept). */
    look(key: string, input: () => Promise<PictureLookInput>): Promise<PictureLook> {
      if (!looks.has(key))
        looks.set(
          key,
          failed
            ? Promise.resolve(none)
            : input().then(
                (request) =>
                  new Promise<PictureLook>((resolve) => {
                    waiting.set(++id, resolve);
                    worker.postMessage({ ...request, id } satisfies PictureLookRequest);
                  }),
                () => none,
              ),
        );
      return looks.get(key)!;
    },
    /** Forget every look but those of `keys`. */
    keep(keys: ReadonlySet<string>) {
      for (const key of looks.keys()) if (!keys.has(key)) looks.delete(key);
    },
  };
}
