/**
 * FINAL LAP 2's road across ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-road-across)):
 * its road picture's row in its colors, a band each run of one color, laid at its scale across; and that scale, its
 * own car's width against the road at its depth.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { Band, CrossSection } from '../shared/circuit-layout.js';
import { ROAD_TILE, roadTile, roadTilePixels } from '../namco-system-2/road.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { CAR_COLUMNS, CAR_WIDTH } from './final-lap-2-constants.js';

/** The road picture's columns the road chip draws: 44 tiles. */
const SHOWN = 44 * ROAD_TILE;
/** The road's tile map's pixels across, which a line's zoom spans. */
const MAP_PIXELS = 1024;

/**
 * A road picture pixel's width, metres: its own car at its depth as wide as `CAR_WIDTH`. The slave's 0x1666 makes a
 * road line's zoom the depth over 16 (its 0x1672), the line `0x87C2C0` over the depth less 0x15A, so a road pixel is
 * 0x87C2C0 / 16 / 1024 screen pixels over the line + 0x15A; its 0x305E scales an object by 0x1AF26 over the line +
 * 0x15A, a big sprite's 32 pixels a quarter of it (its 0x3078 and a car's 0x2C90): its car's `CAR_COLUMNS` are so many
 * road pixels.
 */
export function roadPixelMetres(p: FinalLap2): number {
  const [roadHigh, roadLow] = instruction(p.slave, 0x1622, [0x267c, null, null], 'the road lines');
  instruction(p.slave, 0x1670, [0x3202, 0xe849], "a line's zoom");
  instruction(p.slave, 0x303e, [0x0641, 0x015a], "an object's line");
  const [objectHigh, objectLow] = instruction(p.slave, 0x305e, [0x2a3c, null, null, 0x8ac1], "an object's scale");
  instruction(p.slave, 0x3078, [0xe44d], "a big sprite's quarter");
  instruction(p.slave, 0x2c90, [0xd645], "a car's tiles side by side");
  const road = ((roadHigh! << 16) | roadLow!) / 16 / MAP_PIXELS;
  const object = ((objectHigh! << 16) | objectLow!) / 4 / 32;
  return CAR_WIDTH / ((CAR_COLUMNS * object) / road);
}

/**
 * The road across from its picture's row (64 tile words) in the road's palette (`palette`) through its color PROM:
 * a band each run of one color over the columns the chip draws, P midway between its edge lines, the first two runs of
 * its lightest color; the picture's ground, its first column's color, `SAND`, the rest `ASPHALT`; its limits the drawn
 * columns' edges, the nearer either side; and its road's width, between its edge lines' middles.
 */
export function crossSection(
  p: FinalLap2,
  words: readonly number[],
  tiles: Uint8Array,
  palette: readonly number[],
  metres: number,
): CrossSection & { readonly width: number } {
  const y = 0;
  const colors = Array.from({ length: SHOWN }, (_, x) => {
    const { code, color } = roadTile(words[x >> 4]!);
    const pen = roadTilePixels(tiles, code)[y * ROAD_TILE + (x & 15)]!;
    return palette[p.roadColors[(color * 4 + pen) & 0xff]!]!;
  });
  const runs: { from: number; to: number; color: number }[] = [];
  colors.forEach((color, x) => {
    const last = runs.at(-1);
    if (last && last.color === color) last.to = x + 1;
    else runs.push({ from: x, to: x + 1, color });
  });
  // The edge lines: the first two runs of the row's lightest color; P midway between their middles.
  const lightness = (c: number) => ((c >> 10) & 31) + ((c >> 5) & 31) + (c & 31);
  const lightest = Math.max(...colors.map(lightness));
  const lines = runs.filter((r) => lightness(r.color) === lightest).slice(0, 2);
  if (lines.length !== 2) throw romDiffers("The road picture's row has no two edge lines");
  const [left, right] = lines.map((r) => (r.from + r.to) / 2) as [number, number];
  const centre = (left + right) / 2;
  const ground = colors[0]!;
  if (!runs.some((r) => r.color !== ground)) throw romDiffers('The road picture shows no road');
  const bands: Band[] = runs.map((r) => ({
    left: (r.from - centre) * metres,
    right: (r.to - centre) * metres,
    colors: [r.color],
    material: r.color === ground ? 'SAND' : 'ASPHALT',
  }));
  return { bands, limit: Math.min(centre, SHOWN - centre) * metres, width: (right - left) * metres };
}
