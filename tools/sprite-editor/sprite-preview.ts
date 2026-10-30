import { expandRgb555Pixels, halveRgb555, rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import {
  createSpritePalette,
  selectSpriteLevel,
  SPRITE_SOURCE_TEXELS_PER_METER,
  type SpriteLodAsset,
} from '../../src/image/sprite.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame, pixelsPerMeterAtDepth } from '../../src/view/display-scale.js';
import { drawScaledSprite } from '../../src/view/sprite.js';
import { placeShadow, shadowRowSpans, type PlacedShadow } from '../../src/view/sprite-shadow.js';
import { make } from '../browser-shared/dom.js';

/** The depths a preview offers, in metres. */
export const PREVIEW_DEPTH = { min: 2.5, max: 200 } as const;

/**
 * A product frame showing sprites: the logical frame drawn by the product's sprite drawing at the product's scale for a
 * depth, presented in RGB555 as the game presents it.
 */
export function createSpritePreview() {
  const surface = createLogicalFrame();
  const canvas = make('canvas', '', {
    width: String(surface.width),
    height: String(surface.height),
    class: 'sprite-preview',
  });
  const background = rgbaToRgb555(rgba(28, 42, 54));
  const pixels = new Uint32Array(surface.pixels.length);
  return {
    canvas,
    /**
     * Draw each asset with its palette at `depth` metres, in `columns` columns of rows, each anchor near the foot of its
     * place; returns each drawn level.
     */
    draw(
      sprites: readonly { readonly asset: SpriteLodAsset; readonly palette: string }[],
      depth: number,
      columns = sprites.length,
    ) {
      surface.clear(background);
      const ppm = pixelsPerMeterAtDepth(CAMERA_DEFINITION.focalLength, depth);
      const rows = Math.max(1, Math.ceil(sprites.length / columns));
      const levels = sprites.map(({ asset, palette }, i) => {
        const colored = createSpritePalette(asset, palette);
        const x = (((i % columns) + 0.5) * surface.width) / columns,
          y = ((Math.floor(i / columns) + 0.85) * surface.height) / rows;
        drawScaledSprite(surface, colored, x, y, ppm);
        return selectSpriteLevel(asset, ppm);
      });
      expandRgb555Pixels(surface.pixels, pixels);
      canvas
        .getContext('2d')!
        .putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), surface.width, surface.height), 0, 0);
      return levels;
    },
  };
}

/** The road's color behind a picture on the road, below the horizon, and the sky's above it. */
const ROAD = rgbaToRgb555(rgba(107, 107, 107));
const SKY = rgbaToRgb555(rgba(28, 42, 54));

/**
 * A picture standing on flat road at sizes 0 to 3: each in its own logical frame at the depth where the product draws
 * level `k` at `40 / 2^k` pixels per metre, its base point in the middle. The picture is drawn by the product's sprite
 * drawing and its level's shadow cast as the renderer casts it (`placeShadow` on the flat ground's rows, the rows'
 * spans from `shadowRowSpans` at half brightness).
 */
export function createRoadPreview() {
  const frames = [0, 1, 2, 3].map(() => {
    const surface = createLogicalFrame();
    const canvas = make('canvas', '', {
      width: String(surface.width),
      height: String(surface.height),
      class: 'road-preview',
    });
    return { surface, canvas, pixels: new Uint32Array(surface.pixels.length) };
  });
  const element = make('div', '', { class: 'road-previews' });
  element.append(
    ...frames.map(({ canvas }, size) => {
      const figure = make('figure');
      figure.append(canvas, make('div', `Size ${size}`, { class: 'hint' }));
      return figure;
    }),
  );
  const { focalLength, horizonRow, height } = CAMERA_DEFINITION;
  const shadow: PlacedShadow = { frame: null!, left: 0, top: 0, scale: 0, d: 0, row: 0, dNear: 0, dFar: 0 };
  const spans: number[] = [];
  return {
    element,
    /** Draw `asset` in `palette` at each size. */
    draw(asset: SpriteLodAsset, palette: string) {
      const colored = createSpritePalette(asset, palette);
      frames.forEach(({ surface, canvas, pixels }, size) => {
        const ppm = SPRITE_SOURCE_TEXELS_PER_METER / 2 ** size;
        const depth = focalLength / ppm,
          anchorRow = horizonRow + (focalLength * height) / depth;
        // The flat ground's rows below the horizon, far to near.
        const rows = Array.from({ length: surface.height - horizonRow - 1 }, (_, i) => {
          const y = horizonRow + 1 + i;
          return { y, d: (focalLength * height) / (y - horizonRow), away: false };
        });
        surface.clear(SKY);
        for (const row of rows) surface.pixels.fill(ROAD, row.y * surface.width, (row.y + 1) * surface.width);
        if (placeShadow(colored, surface.width / 2, anchorRow, ppm, depth, rows, shadow))
          for (const row of rows) {
            shadowRowSpans(row, [shadow], surface.width, spans);
            for (let i = 0; i < spans.length; i += 2)
              for (let x = spans[i]!; x < spans[i + 1]!; x++) {
                const at = row.y * surface.width + x;
                surface.pixels[at] = halveRgb555(surface.pixels[at]!);
              }
          }
        drawScaledSprite(surface, colored, surface.width / 2, anchorRow, ppm);
        expandRgb555Pixels(surface.pixels, pixels);
        canvas
          .getContext('2d')!
          .putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), surface.width, surface.height), 0, 0);
      });
    },
  };
}
