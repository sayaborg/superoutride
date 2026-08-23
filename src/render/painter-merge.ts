export interface DepthItem {
  d: number;
}

/**
 * Merge two far->near lists without allocating a combined sort buffer.
 * Core §52 tie rule: when d is equal, terrain is drawn before sprite.
 */
export function mergeTerrainAndSprites<TTerrain extends DepthItem, TSprite extends DepthItem>(
  terrain: readonly TTerrain[],
  sprites: readonly TSprite[],
  drawTerrain: (item: TTerrain) => void,
  drawSprite: (item: TSprite) => void,
): void {
  let ti = 0;
  let si = 0;

  while (ti < terrain.length || si < sprites.length) {
    if (ti >= terrain.length) {
      drawSprite(sprites[si++]!);
      continue;
    }
    if (si >= sprites.length) {
      drawTerrain(terrain[ti++]!);
      continue;
    }

    const t = terrain[ti]!;
    const s = sprites[si]!;
    if (t.d >= s.d) {
      // Equal depth intentionally chooses terrain first.
      drawTerrain(t);
      ti += 1;
    } else {
      drawSprite(s);
      si += 1;
    }
  }
}
