import type { VehicleSpriteSetDocument } from '../../src/vehicle/vehicle-sprite-library.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';

type Frame = VehicleSpriteSetDocument['pictures'][number]['sizes'][number];

/** Native-texel frames on one common base-point grid, with their own shadows; no rescaling or image correction. */
export function vehiclePictureSheet(frames: readonly Frame[], colors: readonly number[], columns = 8) {
  if (!frames.length || !Number.isInteger(columns) || columns < 1)
    throw new RangeError('A contact sheet needs frames and a positive column count');
  const palette = colors.map((c) => unpackRgba(rgb555ToRgba(c)));
  const extent = (of: (frame: Frame) => number) => Math.ceil(Math.max(...frames.map(of))) + 2;
  const left = extent((f) => Math.max(f.anchorX, f.shadow.anchorX)),
    right = extent((f) => Math.max(f.width - f.anchorX, f.shadow.width - f.shadow.anchorX));
  const up = extent((f) => Math.max(f.anchorY, f.shadow.anchorY)),
    down = extent((f) => Math.max(f.height - f.anchorY, f.shadow.height - f.shadow.anchorY));
  const cw = left + right,
    ch = up + down,
    width = cw * columns,
    height = ch * Math.ceil(frames.length / columns),
    data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([96, 104, 104, 255], i);
  frames.forEach((frame, index) => {
    const ox = (index % columns) * cw + left,
      oy = Math.floor(index / columns) * ch + up;
    for (const [picture, shadow] of [
      [frame.shadow, true],
      [frame, false],
    ] as const) {
      const x0 = ox - Math.round(picture.anchorX + 0.5),
        y0 = oy - Math.round(picture.anchorY + 0.5);
      picture.rows.forEach((row, y) =>
        Array.from(row, (digit, x) => {
          const slot = parseInt(digit, 16);
          if (!slot) return;
          const c = palette[slot]!;
          data.set(shadow ? [40, 46, 46, 255] : [c.r, c.g, c.b, 255], ((y0 + y) * width + x0 + x) * 4);
        }),
      );
    }
  });
  return { width, height, data };
}
