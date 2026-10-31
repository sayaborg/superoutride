import type { SpriteShadowDocument } from '../../src/image/sprite.js';
import type { BoardShadowCaster } from '../graphics/board-shadow.js';
import type { PictureLook, PictureLookRequest, ShadowRequest } from './sprite-look-worker.js';
import { createWorkerRequests } from './worker-requests.js';

/** A thumbnail's side, in screen pixels. */
export const THUMBNAIL = 48;

/** What a picture's look is worked out from: its files' bytes, and the paths and revisions that name them. */
export type PictureLookInput = Omit<PictureLookRequest, 'id'>;

export type PictureLooks = ReturnType<typeof createPictureLooks>;

/**
 * The list's pictures' looks (`PictureLook`) in a worker of their own. Each look is kept by its key (its inputs' paths
 * and revisions), so a change of the working state works out again only the pictures whose files changed; `keep`
 * forgets the looks no longer listed. A worker that fails is started again a few times and then said
 * (`createWorkerRequests`); a look it did not give is shown without its outline mark and thumbnail, and asked again at
 * the next listing. A second worker of the same script casts the comparison's board shadows.
 */
export function createPictureLooks() {
  const ask = createWorkerRequests<{
    id: number;
    iou: number | null;
    bodies: readonly string[];
    thumbnail: ImageBitmap;
    error?: string;
  }>('../../tools/sprite-editor/sprite-look-worker.js', 'look');
  const none: PictureLook = { iou: null, bodies: [], thumbnail: null };
  const askShadow = createWorkerRequests<{ id: number; shadow: SpriteShadowDocument; error?: string }>(
    '../../tools/sprite-editor/sprite-look-worker.js',
    'shadow',
  );
  const looks = new Map<string, Promise<PictureLook>>();
  return {
    /** The look of the picture whose inputs `key` names, worked out from `input` (read only when it is not kept). */
    look(key: string, input: () => Promise<PictureLookInput>): Promise<PictureLook> {
      if (!looks.has(key))
        looks.set(
          key,
          input()
            .then((request) => ask(request))
            .then(
              ({ iou, bodies, thumbnail }): PictureLook => ({ iou, bodies, thumbnail }),
              () => {
                looks.delete(key);
                return none;
              },
            ),
        );
      return looks.get(key)!;
    },
    /** The board shadow `caster` casts (`boardShadow`), cast in a worker of its own. */
    shadow: (caster: BoardShadowCaster) =>
      askShadow({ kind: 'shadow', caster } satisfies Omit<ShadowRequest, 'id'>).then(({ shadow }) => shadow),
    /** Forget every look but those of `keys`. */
    keep(keys: ReadonlySet<string>) {
      for (const key of looks.keys()) if (!keys.has(key)) looks.delete(key);
    },
  };
}
