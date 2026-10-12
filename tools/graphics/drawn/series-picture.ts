import {
  bands,
  createRaster,
  fillEllipse,
  fillPolygon,
  fillRect,
  line,
  outlined,
  textWidth,
  writeText,
  type Color,
  type Raster,
} from './raster.js';

const INK = 0x1c0c28;

/** A palm silhouette standing at (x, y), `height` pixels tall, its trunk leaning by `lean` (pixels at the top). */
export function palmSilhouette(raster: Raster, x: number, y: number, height: number, lean: number, color: Color) {
  const top: [number, number] = [x + lean, y - height];
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments,
      t1 = (i + 1) / segments;
    const at = (t: number): [number, number] => [x + lean * t * t, y - height * t];
    line(raster, at(t0), at(t1), Math.max(2, (height / 22) * (1 - t0 * 0.5)), color);
  }
  // Fronds: drooping leaves from the crown, each a thin tapered polygon.
  const fronds = [-2.7, -2.2, -1.6, -0.9, -0.3, 0.3, 0.9, 1.5];
  for (const angle of fronds) {
    const length = height * 0.42,
      tip: [number, number] = [
        top[0] + Math.sin(angle) * length,
        top[1] + (Math.abs(Math.sin(angle)) > 0.9 ? 0.45 : 0.25) * length,
      ];
    const mid: [number, number] = [top[0] + Math.sin(angle) * length * 0.55, top[1] - length * 0.12];
    const w = height * 0.05;
    fillPolygon(raster, [top, [mid[0], mid[1] - w], tip, [mid[0], mid[1] + w]], color);
  }
  fillEllipse(raster, top[0], top[1], height * 0.04, height * 0.035, color);
}

/**
 * OUTRUN TEST's series picture, 320×240: a coastal road at sunset running to the horizon between palms, a red
 * TESTAROSSA seen from behind, and the series' name across the sky.
 */
export function drawSeriesPicture(): Raster {
  const raster = createRaster(320, 240);
  const horizon = 132;
  // Sky: stepped bands from night blue to the sunset's gold.
  bands(
    raster,
    0,
    horizon,
    [
      0x140c40, 0x1e1054, 0x2c1466, 0x401a76, 0x582080, 0x762886, 0x983484, 0xbc4480, 0xdc5a74, 0xf27a62, 0xf8a050,
      0xf8c448,
    ],
  );
  // The sun, in bands from pale yellow to orange, with the sky showing through stripes across its lower half.
  const sun = [0xfff07a, 0xffe064, 0xffd058, 0xffbc48, 0xffa63c, 0xff9034];
  const stripes = [
    [100, 2],
    [108, 3],
    [116, 4],
    [124, 5],
  ] as const;
  for (let y = 68; y < horizon; y++)
    for (let x = 110; x < 210; x++) {
      if ((x + 0.5 - 160) ** 2 + (y + 0.5 - 118) ** 2 > 50 * 50) continue;
      if (stripes.some(([top, h]) => y >= top && y < top + h)) continue;
      fillRect(raster, x, y, 1, 1, sun[Math.min(sun.length - 1, Math.floor(((y - 68) / 64) * sun.length))]!);
    }
  // The sea at the horizon, with the sun's reflection.
  bands(raster, horizon, 150, [0x3a2a78, 0x302470, 0x281e64, 0x22185a]);
  for (let k = 0; k < 6; k++) fillRect(raster, 138 + k * 3 - (k % 2) * 6, horizon + 2 + k * 3, 44 - k * 6, 1, 0xffb040);
  // The beach and the road from the horizon to the frame's foot.
  bands(raster, 150, 240, [0xc88a5a, 0xd49866, 0xdea672, 0xe6b27e, 0xecbe8a, 0xf0c896]);
  const vanish: [number, number] = [160, 146];
  fillPolygon(raster, [vanish, vanish, [330, 240], [-10, 240]], 0x2a2440);
  fillPolygon(
    raster,
    [
      [vanish[0] - 1, 150],
      [vanish[0] + 1, 150],
      [262, 240],
      [58, 240],
    ],
    0x3c3456,
  );
  // Edge lines and lane dashes, converging on the vanishing point.
  for (const side of [-1, 1]) line(raster, [160 + side * 3, 150], [160 + side * 112, 240], 2, 0xe8e0f0);
  for (let k = 0; k < 7; k++) {
    const t0 = (k / 7) ** 1.7,
      t1 = ((k + 0.5) / 7) ** 1.7;
    const y0 = 150 + 90 * t0,
      y1 = 150 + 90 * t1;
    line(raster, [160, y0], [160, y1], 1 + 3 * t1, 0xe8e0f0);
  }
  // Palms either side, nearer ones larger.
  for (const [x, h, lean] of [
    [22, 150, 18],
    [72, 96, 10],
    [104, 60, 6],
    [126, 36, 4],
  ] as const) {
    palmSilhouette(raster, x, 150 + h * 0.62, h, -lean, 0x1c1030);
    palmSilhouette(raster, 320 - x, 150 + h * 0.62, h, lean, 0x1c1030);
  }
  // The TESTAROSSA from behind: wide body, black louvres across its tail, round lamps under them.
  outlined(raster, INK, (layer) => {
    fillPolygon(
      layer,
      [
        [110, 196],
        [118, 178],
        [202, 178],
        [210, 196],
        [214, 220],
        [106, 220],
      ],
      0xd01c1c,
    );
    fillPolygon(
      layer,
      [
        [126, 178],
        [134, 164],
        [186, 164],
        [194, 178],
      ],
      0xb01414,
    );
    fillRect(layer, 102, 214, 18, 14, 0x141018);
    fillRect(layer, 200, 214, 18, 14, 0x141018);
  });
  fillPolygon(
    raster,
    [
      [136, 176],
      [140, 167],
      [180, 167],
      [184, 176],
    ],
    0x241c34,
  );
  for (let k = 0; k < 5; k++) fillRect(raster, 118, 190 + k * 3, 84, 2, 0x201420);
  for (const x of [118, 196]) fillRect(raster, x, 205, 8, 4, 0xff6030);
  fillRect(raster, 150, 207, 20, 5, 0xf0f0f0);
  fillRect(raster, 108, 196, 104, 2, 0xf05050);
  // The name across the sky: yellow block letters with a red shadow and dark outline, leaning forward.
  const name = 'OUTRUN TEST',
    scale = 4,
    x = Math.round((320 - textWidth(name, scale) - 6) / 2);
  outlined(raster, INK, (layer) => writeText(layer, x + 4, 22, name, scale, 0xc01818, 0.25));
  outlined(raster, INK, (layer) => writeText(layer, x, 18, name, scale, 0xf8d030, 0.25));
  return raster;
}
