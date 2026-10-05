import { expandRgb555Pixels, rgba, rgbaToRgb555 } from '../../src/image/rgb555.js';
import { createSpritePalette, selectSpriteLevel, type SpriteAsset } from '../../src/image/sprite.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame, pixelsPerMeterAtDepth } from '../../src/view/display-scale.js';
import { drawScaledSprite } from '../../src/view/sprite.js';
import { make } from './dom.js';

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
     * Draw each asset with its palette and lamp slot color at `depth` metres, in `columns` columns of rows, each anchor
     * near the foot of its place; returns each drawn level.
     */
    draw(
      sprites: readonly { readonly asset: SpriteAsset; readonly palette: string; readonly lamp?: number }[],
      depth: number,
      columns = sprites.length,
    ) {
      surface.clear(background);
      const ppm = pixelsPerMeterAtDepth(CAMERA_DEFINITION.focalLength, depth);
      const rows = Math.max(1, Math.ceil(sprites.length / columns));
      const levels = sprites.map(({ asset, palette, lamp }, i) => {
        const colored = createSpritePalette(asset, palette, lamp === undefined ? [] : [lamp]);
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
