import type { SpriteLodDocument } from '../../src/image/sprite.js';

/** Reflect the completed master and shadow together; the light is not recast. */
export function mirrorSprite(master: SpriteLodDocument): SpriteLodDocument {
  const mirror = (indices: readonly number[], width: number) =>
    indices.map((_, i) => indices[Math.floor(i / width) * width + width - 1 - (i % width)]!);
  return {
    ...master,
    name: `${master.name}-mirrored`,
    anchorX: master.width - 1 - master.anchorX,
    levels: master.levels.map((level) => ({ ...level, indices: mirror(level.indices, master.width) })),
    ...(master.shadow
      ? {
          shadow: {
            ...master.shadow,
            anchorX: master.shadow.width - 1 - master.shadow.anchorX,
            levels: master.shadow.levels.map((level) => ({ indices: mirror(level.indices, master.shadow!.width) })),
          },
        }
      : {}),
  };
}
