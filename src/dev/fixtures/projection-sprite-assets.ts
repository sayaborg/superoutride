import { rgba } from '../../graphics/software-surface.js';
import { createSpriteAsset, SPRITE_TRANSPARENT, type SpriteAsset } from '../../graphics/sprite.js';

const SPRITE_COLORS = {
  dark: rgba(18, 23, 27),
  tire: rgba(12, 14, 16),
  chrome: rgba(196, 211, 218),
  carBody: rgba(236, 82, 56),
  carHighlight: rgba(255, 159, 92),
  tail: rgba(255, 48, 42),
  head: rgba(255, 239, 164),
  glass: rgba(74, 120, 139),
  rider: rgba(244, 216, 161),
  riderSuit: rgba(50, 83, 149),
  bikeBody: rgba(232, 197, 43),
  trunk: rgba(93, 62, 39),
  leafA: rgba(37, 116, 51),
  leafB: rgba(70, 151, 67),
  signFace: rgba(238, 240, 229),
  signMark: rgba(42, 87, 173),
  concrete: rgba(130, 130, 126),
  building: rgba(188, 157, 106),
} as const;

export function createProjectionSpriteAssets() {
  return {
    tree: createTreeAsset(),
    sign: createSignAsset(),
    guardrail: createGuardrailAsset(),
    building: createBuildingAsset(),
  };
}

function createTreeAsset(): SpriteAsset {
  const b = bitmap(7, 11);
  for (let y = 1; y <= 7; y += 1) {
    const radius = y <= 3 ? 2 : 3;
    for (let x = 3 - radius; x <= 3 + radius; x += 1) {
      if (x >= 0 && x < 7 && Math.abs(x - 3) + Math.abs(y - 4) < 6) {
        b.set(x, y, (x + y) % 2 ? SPRITE_COLORS.leafA : SPRITE_COLORS.leafB);
      }
    }
  }
  b.fillRect(3, 7, 3, 10, SPRITE_COLORS.trunk);
  return createSpriteAsset('TREE', 7, 11, b.pixels, undefined, undefined, 2.5);
}

function createSignAsset(): SpriteAsset {
  const b = bitmap(9, 8);
  b.fillRect(1, 0, 7, 4, SPRITE_COLORS.signFace);
  b.fillRect(2, 1, 6, 1, SPRITE_COLORS.signMark);
  b.fillRect(4, 2, 4, 3, SPRITE_COLORS.signMark);
  b.fillRect(4, 5, 4, 7, SPRITE_COLORS.concrete);
  return createSpriteAsset('SIGN', 9, 8, b.pixels, undefined, undefined, 1.8);
}

function createGuardrailAsset(): SpriteAsset {
  const b = bitmap(9, 4);
  b.fillRect(0, 0, 8, 1, SPRITE_COLORS.chrome);
  b.fillRect(1, 2, 1, 3, SPRITE_COLORS.concrete);
  b.fillRect(7, 2, 7, 3, SPRITE_COLORS.concrete);
  return createSpriteAsset('GUARDRAIL', 9, 4, b.pixels, undefined, undefined, 3.0);
}

function createBuildingAsset(): SpriteAsset {
  const b = bitmap(11, 10);
  b.fillRect(1, 2, 9, 9, SPRITE_COLORS.building);
  b.fillRect(0, 1, 10, 2, SPRITE_COLORS.dark);
  for (let y = 4; y <= 7; y += 3) {
    for (let x = 2; x <= 8; x += 3) b.fillRect(x, y, x + 1, y + 1, SPRITE_COLORS.glass);
  }
  return createSpriteAsset('BUILDING', 11, 10, b.pixels, undefined, undefined, 8.0);
}

function bitmap(
  width: number,
  height: number,
): {
  pixels: Uint32Array;
  set: (x: number, y: number, color: number) => void;
  fillRect: (x0: number, y0: number, x1: number, y1: number, color: number) => void;
} {
  const pixels = new Uint32Array(width * height);
  pixels.fill(SPRITE_TRANSPARENT);
  const set = (x: number, y: number, color: number): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    pixels[y * width + x] = color >>> 0;
  };
  const fillRect = (x0: number, y0: number, x1: number, y1: number, color: number): void => {
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(width - 1, Math.max(x0, x1));
    const top = Math.max(0, Math.min(y0, y1));
    const bottom = Math.min(height - 1, Math.max(y0, y1));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) set(x, y, color);
    }
  };
  return { pixels, set, fillRect };
}
