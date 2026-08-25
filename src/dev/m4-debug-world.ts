import type { GuideCurve } from '../core/guide-curve.js';
import type { SpriteAsset } from '../render/sprite.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { M4SpriteAssets } from '../visual/m4-sprite-assets.js';
import { compileCourseSprite, type CourseSprite, type CourseSpriteAuthoring } from '../world/course-sprite.js';

export function createM4DebugWorldSprites(
  guide: GuideCurve,
  height: HeightProfileReader,
  assets: M4SpriteAssets,
): CourseSprite[] {
  const authored: CourseSpriteAuthoring[] = [];
  let serial = 0;

  for (let s = 20; s < guide.length; s += 28) {
    if (s >= 455 && s <= 625) {
      authored.push(place(`CLIFF_TREE_${serial++}`, s, 10.5, assets.tree));
    } else {
      authored.push(place(`TREE_L_${serial++}`, s, -10.5, assets.tree));
      if ((Math.floor(s / 28) & 1) === 0) authored.push(place(`TREE_R_${serial++}`, s + 8, 10.5, assets.tree));
    }
  }

  for (let s = 462; s <= 618; s += 13) {
    authored.push(place(`RAIL_${serial++}`, s, -5.8, assets.guardrail));
  }

  authored.push(place(`SIGN_${serial++}`, 430, 7.5, assets.sign));
  authored.push(place(`SIGN_${serial++}`, 642, -7.5, assets.sign));
  authored.push(place(`BUILDING_${serial++}`, 705, 11, assets.building));

  return authored.map((source) => compileCourseSprite(guide, height, source));
}

function place(name: string, s: number, l: number, asset: SpriteAsset): CourseSpriteAuthoring {
  return { name, s, l, groundOffset: 0, asset };
}
