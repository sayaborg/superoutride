/**
 * FINAL LAP 2's road across ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-road-across)):
 * its road picture's row in its colors, a band each run of one color, laid at its scale across; and that scale, its
 * own car's width against the road at its depth.
 */
import { instruction } from '../cpu/program-words.js';
import { romDiffers } from '../shared/conversion-errors.js';
import type { Band, CrossSection } from '../shared/road-surface.js';
import { ROAD_TILE, roadTile, roadTilePixels } from '../namco-system-2/road.js';
import type { FinalLap2 } from './final-lap-2-rom.js';
import { LAP_UNITS, readRoadStep, ROW_UNITS } from './final-lap-2-road.js';
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

/** Each road tile's pixels as read once, by the tiles' memory. */
const tilePixels = new WeakMap<Uint8Array, Map<number, Uint8Array>>();

/** A picture row's colors over the columns the chip draws: pixel row `y` of tile words `words`. */
function rowColors(p: FinalLap2, words: readonly number[], y: number, tiles: Uint8Array, palette: readonly number[]) {
  let read = tilePixels.get(tiles);
  if (!read) tilePixels.set(tiles, (read = new Map()));
  return Array.from({ length: SHOWN }, (_, x) => {
    const { code, color } = roadTile(words[x >> 4]!);
    let pixels = read.get(code);
    if (!pixels) read.set(code, (pixels = roadTilePixels(tiles, code)));
    return palette[p.roadColors[(color * 4 + pixels[y * ROAD_TILE + (x & 15)]!) & 0xff]!]!;
  });
}

/** A row's runs of one color, left to right. */
function runsOf(colors: readonly number[]) {
  const runs: { from: number; to: number; color: number }[] = [];
  colors.forEach((color, x) => {
    const last = runs.at(-1);
    if (last && last.color === color) last.to = x + 1;
    else runs.push({ from: x, to: x + 1, color });
  });
  return runs;
}

/**
 * An edge line as a row draws it: its colors from its first column `from`, and its lightest run's middle, its column
 * and metres from P at the line.
 */
interface EdgeLine {
  readonly colors: readonly number[];
  readonly from: number;
  readonly column: number;
  readonly middle: number;
}

/**
 * The road across from its picture's row (64 tile words) in the road's palette (`palette`) through its color PROM:
 * a band each run of one color over the columns the chip draws, P midway between its edge lines, the first two runs of
 * its lightest color; the picture's ground, its first column's color, `SAND`, the rest `ASPHALT`; its edges the drawn
 * columns' edges, the nearer either side; its road's width, between its edge lines' middles; and its edge lines as it
 * draws them, each its lightest run and the two runs either side.
 */
export function crossSection(
  p: FinalLap2,
  words: readonly number[],
  tiles: Uint8Array,
  palette: readonly number[],
  metres: number,
): CrossSection & { readonly width: number; readonly centre: number; readonly edges: readonly [EdgeLine, EdgeLine] } {
  const colors = rowColors(p, words, 0, tiles, palette);
  const runs = runsOf(colors);
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
  const edge = (line: (typeof runs)[number]): EdgeLine => {
    const k = runs.indexOf(line);
    if (k < 2 || k + 2 >= runs.length) throw romDiffers('An edge line has not two runs either side');
    const [from, to] = [runs[k - 2]!.from, runs[k + 2]!.to];
    const column = (line.from + line.to) / 2;
    return { colors: colors.slice(from, to), from, column, middle: (column - centre) * metres };
  };
  const edges: [EdgeLine, EdgeLine] = [edge(lines[0]!), edge(lines[1]!)];
  return { bands, edge: Math.min(centre, SHOWN - centre) * metres, width: (right - left) * metres, centre, edges };
}

/**
 * Where course `c`'s road's left edge line lies along its lap, its middle's column, a tile row of its picture each
 * (`ROW_UNITS` of its position, from its table's start): where the row draws the line as the line's row does
 * (`across`'s), its leftmost place. Its right edge line stays where the line's row draws it in every row.
 */
export function leftEdges(
  p: FinalLap2,
  c: number,
  tiles: Uint8Array,
  palette: readonly number[],
  across: { readonly edges: readonly [EdgeLine, EdgeLine] },
): Float64Array {
  const [left, right] = across.edges;
  const drawn = (colors: readonly number[], line: EdgeLine, x: number) =>
    line.colors.every((v, k) => colors[x + k] === v);
  const rows = LAP_UNITS / ROW_UNITS;
  const edges = new Float64Array(rows);
  for (let k = 0; k < rows; k++) {
    const colors = rowColors(p, readRoadStep(p, c, k >> 2)[k & 3]!, 0, tiles, palette);
    if (!drawn(colors, right, right.from)) throw romDiffers(`Course ${c}'s right edge line moves at its row ${k}`);
    let x = 0;
    while (x + left.colors.length <= colors.length && !drawn(colors, left, x)) x++;
    if (x + left.colors.length > colors.length) throw romDiffers(`Course ${c}'s row ${k} draws no left edge line`);
    edges[k] = left.column + x - left.from;
  }
  return edges;
}

/**
 * Course `c`'s road picture along its lap, a row each unit of its position from its table's start: each row's colors
 * over the columns the chip draws once (`rows`), and each unit's row among them (`ids`). A tile row's 16 pixel rows lie
 * at its 16 units, its first at the nearest.
 */
export function pictureRows(p: FinalLap2, c: number, tiles: Uint8Array, palette: readonly number[]) {
  const rows: (readonly number[])[] = [];
  const known = new Map<string, number>();
  const tileRows = new Map<string, readonly number[]>();
  const ids = new Uint32Array(LAP_UNITS);
  for (let k = 0; k < LAP_UNITS / ROW_UNITS; k++) {
    const words = readRoadStep(p, c, k >> 2)[k & 3]!;
    const key = words.join();
    let pixelRows = tileRows.get(key);
    if (!pixelRows) {
      pixelRows = Array.from({ length: ROW_UNITS }, (_, y) => {
        const colors = rowColors(p, words, y, tiles, palette);
        const colorsKey = colors.join();
        let id = known.get(colorsKey);
        if (id === undefined) {
          known.set(colorsKey, (id = rows.length));
          rows.push(colors);
        }
        return id;
      });
      tileRows.set(key, pixelRows);
    }
    pixelRows.forEach((id, y) => (ids[k * ROW_UNITS + y] = id));
  }
  return { rows, ids };
}
