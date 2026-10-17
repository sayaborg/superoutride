import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { exhaustExtent } from '../view/exhaust-diagram.js';

// SELECT VEHICLE's layout: every position, scale and time its frame and pages draw by. Pixel positions are in the
// 320×240 frame; text positions in the 40×30 text grid, 8 pixels to a cell.

/** Fixed steps each yaw image stays. */
export const YAW_IMAGE_STEPS = 6;
/** Fixed steps each page stays before the next (6 s). */
export const VEHICLE_PAGE_STEPS = 360;
/**
 * ENGINE's free-revving throttle by the page's fixed steps, the same for every vehicle (values the author chose): each
 * entry's throttle holds from its step until the next entry's, idle for 1.5 s, full for 1 s, closed for 1.5 s and full
 * to the page's end.
 */
export const FREE_REV_THROTTLE = Object.freeze([
  Object.freeze({ step: 0, throttle: 0 }),
  Object.freeze({ step: 90, throttle: 1 }),
  Object.freeze({ step: 150, throttle: 0 }),
  Object.freeze({ step: 240, throttle: 1 }),
]);
/** The picture's box in pixels: text columns 0-19 by rows 4-10. */
export const PICTURE_BOX = Object.freeze({ x: 0, y: 32, width: 160, height: 56 });
/** The factor by which a picture too large for its box shrinks from the player depth until it fits. */
export const PICTURE_SCALE_STEP = 0.99;
/**
 * `◀ n/N ▶`, the vehicle among the offered vehicles, on `row`, its last character at `lastColumn` whatever the count's
 * digits.
 */
export const VEHICLE_INDEX = Object.freeze({ row: 0, lastColumn: 38 });
/**
 * The page tabs on `row`, from `firstColumn` with `gap` columns between names; `PAGE n/N` at `pageColumn`; the shown
 * page's time line under its name on `timeLineY`, and a rule across the frame on `ruleY`.
 */
export const PAGE_TABS = Object.freeze({ row: 12, firstColumn: 1, gap: 2, pageColumn: 30, timeLineY: 103, ruleY: 106 });
/**
 * Over a wallpaper, the frame stands at quarter brightness (2 halvings) and the panels darker still, by the halvings
 * of the rows they cover: the tabs (y 96-111) and the graph's box (x 172-319, y 22-97) at an eighth, the pages' values
 * (y 112-239) at a sixteenth.
 */
export const WALLPAPER_SHADE = Object.freeze({
  halvings: 2,
  panels: Object.freeze([
    Object.freeze({ left: 172, top: 22, right: 319, bottom: 97, halvings: 3 }),
    Object.freeze({ left: 0, top: 96, right: 319, bottom: 111, halvings: 3 }),
    Object.freeze({ left: 0, top: 112, right: 319, bottom: 239, halvings: 4 }),
  ]),
});
/** A page's value columns: labels at a column, values `valueOffset` columns on, from `firstRow`. */
export const VALUE_COLUMNS = Object.freeze({ left: 0, right: 20, valueOffset: 8, firstRow: 14 });
/**
 * The graph in pixels, under text columns 22-39 and rows 4-11: ENGINE's horizontal axis runs from 20 % of redline at
 * the left edge, 16 pixels for each 10 %, to 110 % beyond the right edge; the vertical axis from 0 on the bottom row to
 * 100 % on the top grid line, with grid lines every 25 % (15 pixels). DRIVETRAIN's horizontal axis runs from 0 at the
 * left edge to the top gear's speed at redline on the right edge, under the same grid.
 */
export const GRAPH = Object.freeze({
  left: 176,
  right: 319,
  bottom: 95,
  top: 35,
  firstRedline: 0.2,
  lastRedline: 1.1,
  pixelsPerRedline: 160,
  gridRedline: 0.1,
  gridLevels: 4,
});
/** The engine speed's marks on ENGINE's curves: squares `markRadius` pixels about each crossing. */
export const ENGINE_SPEED_LINE = Object.freeze({ markRadius: 1 });
/**
 * The gear rows: labels at `label`, ratios at `ratio` under the `RATIO` heading at `ratioHeading`, road speeds at `kmh`
 * under the `KMH` heading.
 */
export const GEAR_COLUMNS = Object.freeze({ label: 0, ratio: 4, ratioHeading: 5, kmh: 16 });
/**
 * The gear bars: 0 to `kmh` km/h across x `left`-`right`, one scale for every vehicle, on y 2-5 of each gear's text
 * row; DIM up to the previous gear's speed at redline, YELLOW from there to the gear's own.
 */
export const GEAR_BARS = Object.freeze({ left: 72, right: 127, kmh: 320, top: 2, bottom: 5 });
/**
 * The side view in the graph's box (x `left`-`right`), at `pixelsPerMeter`, the ground on `groundY`, the vehicle facing
 * right with its wheelbase centred on `centreX`. The wheelbase's dimension line stands `dimensionDepth` below the
 * ground with ticks `tickDepth` deep; the centre of mass is a quartered disc of `cgRadius`; each wheel's load share
 * is written on row `loadRow`, its 4 columns centred under the wheel within columns `loadFirstColumn`-`loadLastColumn`.
 */
export const SIDE_VIEW = Object.freeze({
  left: 176,
  right: 319,
  centreX: 248,
  groundY: 80,
  pixelsPerMeter: 30,
  dimensionDepth: 3,
  tickDepth: 5,
  cgRadius: 3.5,
  loadRow: 11,
  loadFirstColumn: 22,
  loadLastColumn: 36,
});
/** ENGINE's firing runs `SLOW_MOTION` times slower than real, the engine turning at idle. */
export const SLOW_MOTION = 30;
/** The bank colors of the firing strip's ticks and the exhaust's primaries, by junction number in turn. */
export const BANK_PALETTES = Object.freeze([
  TEXT_PALETTES.YELLOW,
  TEXT_PALETTES.RED,
  TEXT_PALETTES.GREEN,
  TEXT_PALETTES.WHITE,
]);
/** The share of a cycle a cylinder stays lit after it fires, on the firing strip and in the exhaust. */
export const FIRING_FLASH = 0.04;
/**
 * The firing strip: one cycle across x `left`-`right` on the baseline y `bottom`, a grey tick every `tickDegrees` of
 * crank, each cylinder's tick from `top` + `tickInset` (from `top` while lit) and the cursor dotted from `top` - 2.
 * `FIRING` and its intervals stand on `labelRow`, the axis labels on `axisRow` and the slow-motion note on `noteRow`.
 */
export const FIRING_STRIP = Object.freeze({
  left: 8,
  right: 151,
  top: 188,
  bottom: 199,
  tickDegrees: 90,
  tickInset: 4,
  labelRow: 22,
  axisRow: 26,
  noteRow: 28,
});
/**
 * The exhaust diagram in columns 20–39: `EXHAUST` and the form on `headingRow` (the form at `formColumn`); `cm` and `mm`
 * heading the primaries' lengths, right-aligned in columns 20–22, and diameters, in columns 23–25, on `legendRow`; a
 * primary a row from `firstRow`; the pipes' values within columns `pipeFirstColumn`–`pipeLastColumn`; the valve on
 * `valveRow` and the scale marks on `scaleRow`. Tubes run from the leftmost
 * valve at x `left` to open ends no farther than x `right` at `exhaustPixelsPerMeter`, `pixelsAcrossPerMeter` of their
 * diameter across (a 60 mm pipe 6 pixels), laid `gap` apart where a junction splits.
 */
export const EXHAUST_DIAGRAM = Object.freeze({
  headingRow: 14,
  formColumn: 28,
  legendRow: 15,
  lengthColumn: 20,
  diameterColumn: 23,
  firstRow: 16,
  pipeFirstColumn: 26,
  pipeLastColumn: 39,
  valveRow: 28,
  scaleRow: 29,
  left: 216,
  right: 314,
  pixelsAcrossPerMeter: 100,
  gap: 2,
});
/**
 * The one length scale of every vehicle's exhaust diagram: the largest whole pixels per metre at which the catalog's
 * farthest-reaching exhaust, from its leftmost valve to its farthest open end, fits between `left` and `right`.
 */
export function exhaustPixelsPerMeter(vehicles: readonly CompiledVehicleDefinition[]): number {
  const extent = Math.max(...vehicles.map((vehicle) => exhaustExtent(vehicle.sound)));
  return Math.floor((EXHAUST_DIAGRAM.right - EXHAUST_DIAGRAM.left) / extent);
}
/** The listed era, market and specification: labels at column 0, values at column 5, wrapped by words. */
export const LISTING_COLUMNS = Object.freeze({ label: 0, value: 5 });
/** A lighter grey than DARK, for axes (RGB555 22, 22, 22). */
export const GREY = 22 | (22 << 5) | (22 << 10);
/** A darker grey than DARK, for grounds and rules (RGB555 12, 12, 12). */
export const DIM = 12 | (12 << 5) | (12 << 10);

/**
 * What a page draws from: the frame and text under it, the shown vehicle, the fuel-cut entry ratio, the fixed steps
 * since the vehicle was shown, the free-revving engine's speed (RPM) on a page that revs it, otherwise null, and the
 * exhaust diagram's scale.
 */
export interface VehiclePageScene {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  readonly vehicle: CompiledVehicleDefinition;
  readonly fuelCutEnterRedlineRatio: number;
  readonly shownSteps: number;
  readonly engineRpm: number | null;
  /** The exhaust diagram's one length scale (`exhaustPixelsPerMeter`). */
  readonly exhaustPixelsPerMeter: number;
}

/**
 * One page of SELECT VEHICLE: the name its tab shows, whether the shown vehicle's engine revs on it by
 * `FREE_REV_THROTTLE`, and its drawing of the shown vehicle's pixels and text.
 */
export interface VehiclePage {
  readonly name: string;
  readonly revs: boolean;
  draw(scene: VehiclePageScene): void;
}

/** The free-revving throttle at page step `step`. */
export function freeRevThrottle(step: number): number {
  let throttle = 0;
  for (const entry of FREE_REV_THROTTLE) if (entry.step <= step) throttle = entry.throttle;
  return throttle;
}

/**
 * The graph's grid: DARK lines every 25 % of its height and every 10 % of redline on ENGINE's axis (the last clipped at
 * its right edge), and the lighter axes on its left edge and bottom row.
 */
export function drawGraphGrid({ frame, text }: VehiclePageScene) {
  const height = GRAPH.bottom - GRAPH.top;
  const grid = text.mainColor(TEXT_PALETTES.DARK);
  for (let k = 1; k <= GRAPH.gridLevels; k++)
    frame.fillSpan(GRAPH.bottom - (k * height) / GRAPH.gridLevels, GRAPH.left, GRAPH.right, grid);
  const gridLines = Math.round((GRAPH.lastRedline - GRAPH.firstRedline) / GRAPH.gridRedline);
  for (let k = 1; k <= gridLines; k++) {
    const x = Math.min(GRAPH.right, GRAPH.left + k * GRAPH.gridRedline * GRAPH.pixelsPerRedline);
    for (let y = GRAPH.top; y < GRAPH.bottom; y++) frame.setPixel(x, y, grid);
  }
  frame.fillSpan(GRAPH.bottom, GRAPH.left, GRAPH.right, GREY);
  for (let y = GRAPH.top; y <= GRAPH.bottom; y++) frame.setPixel(GRAPH.left, y, GREY);
}

/** A line in the graph, a pixel wide and joined vertically between columns, through `rowOf` each column `x`. */
export function drawGraphLine(
  frame: SoftwareSurface,
  first: number,
  last: number,
  rowOf: (x: number) => number,
  color: number,
) {
  let previous: number | null = null;
  for (let x = first; x <= last; x++) {
    const y = Math.round(rowOf(x));
    const from = previous ?? y;
    for (let row = Math.min(from, y); row <= Math.max(from, y); row++) frame.setPixel(x, row, color);
    previous = y;
  }
}

export const integer = (value: number) => Math.round(value).toString();
/** Power or torque: an integer from 10 up, one decimal below. */
export const quantity = (value: number) => (Math.round(value * 10) >= 100 ? integer(value) : value.toFixed(1));
export const millimetres = (metres: number) => `${integer(metres * 1000)}mm`;
/** A ratio in five characters: three decimals below 10, two from 10 up. */
export const ratio = (value: number) => value.toFixed(Math.round(value * 1000) >= 10000 ? 2 : 3);
export const twoDecimals = (value: number) => value.toFixed(2);

/** Label (DARK) and value (WHITE) rows from `row`, labels at `column` and values `valueOffset` columns on. */
export function writeValues(
  text: TextLayer,
  column: number,
  row: number,
  values: readonly (readonly [string, string])[],
  valueOffset: number = VALUE_COLUMNS.valueOffset,
) {
  values.forEach(([label, value], k) => {
    text.write(column, row + k, label, TEXT_PALETTES.DARK);
    text.write(column + valueOffset, row + k, value, TEXT_PALETTES.WHITE);
  });
}
