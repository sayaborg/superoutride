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
 * (`createWorkerRequests`). A look that failed, in part or because its worker did, is forgotten and `again` is told
 * once, so the list asks for it again without waiting for its files to change; failing again, it is kept as it is, its
 * failure said. A second worker of the same script casts the comparison's board shadows.
 */
export function createPictureLooks() {
  const ask = createWorkerRequests<PictureLook & { readonly id: number; readonly error?: string }>(
    '../../tools/sprite-editor/sprite-look-worker.js',
    'look',
  );
  const askShadow = createWorkerRequests<{ id: number; shadow: SpriteShadowDocument; error?: string }>(
    '../../tools/sprite-editor/sprite-look-worker.js',
    'shadow',
  );
  const looks = new Map<string, Promise<PictureLook>>();
  // The looks asked again once after failing, and who hears that a look is to be asked again.
  const retried = new Set<string>();
  let again = () => {};
  return {
    /** The look of the picture whose inputs `key` names, worked out from `input` (read only when it is not kept). */
    look(key: string, input: () => Promise<PictureLookInput>): Promise<PictureLook> {
      if (!looks.has(key))
        looks.set(
          key,
          input()
            .then((request) => ask(request))
            .then(
              ({ iou, bodies, thumbnail, failure }): PictureLook => ({ iou, bodies, thumbnail, failure }),
              (error: Error): PictureLook => ({ iou: null, bodies: null, thumbnail: null, failure: error.message }),
            )
            .then((look) => {
              if (look.failure && !retried.has(key)) {
                retried.add(key);
                looks.delete(key);
                setTimeout(() => again());
              }
              return look;
            }),
        );
      return looks.get(key)!;
    },
    /** Hear when a failed look is to be asked again. */
    onAgain(listener: () => void) {
      again = listener;
    },
    /** The board shadow `caster` casts (`boardShadow`), cast in a worker of its own. */
    shadow: (caster: BoardShadowCaster) =>
      askShadow({ kind: 'shadow', caster } satisfies Omit<ShadowRequest, 'id'>).then(({ shadow }) => shadow),
    /** Forget every look but those of `keys`. */
    keep(keys: ReadonlySet<string>) {
      for (const key of looks.keys()) if (!keys.has(key)) looks.delete(key);
      for (const key of retried) if (!keys.has(key)) retried.delete(key);
    },
  };
}
