import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';

// SELECT VEHICLE's layout: every position, scale and time its frame and pages draw by. Pixel positions are in the
// 320×240 frame; text positions in the 40×30 text grid, 8 pixels to a cell.

/** Fixed steps each yaw image stays. */
export const YAW_IMAGE_STEPS = 6;
/** Fixed steps each page stays before the next (8 s). */
export const VEHICLE_PAGE_STEPS = 480;
/** The picture's box in pixels: text columns 0-19 by rows 4-10. */
export const PICTURE_BOX = Object.freeze({ x: 0, y: 32, width: 160, height: 56 });
/** The factor by which a picture too large for its box shrinks from the player depth until it fits. */
export const PICTURE_SCALE_STEP = 0.99;
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
 * The curve graph in pixels, under text columns 22-39 and rows 4-11: its horizontal axis runs from 20 % of redline at
 * the left edge, 16 pixels for each 10 %, to 110 % beyond the right edge; its vertical axis from 0 on the bottom row to
 * 100 % on the top grid line, with grid lines every 25 % (15 pixels).
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
/**
 * ENGINE's moving drawings run `SLOW_MOTION` times slower than real: the engine turns at idle and the exhaust's
 * pulses travel at the speed of sound, both slowed alike, so their timing keeps its real ratio.
 */
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
 * The exhaust diagram at the player depth's 40 px/m, its longest primary starting at x `left`, its primaries from
 * text row `firstRow`; the heading on `headingRow` (`EXHAUST` at column 20, the form at `formColumn` and `cm` at
 * `unitColumn`), each primary's length in centimetres at column 20, and `PIPE` with the pipes' lengths on `pipeRow`
 * from `pipeColumn`.
 */
export const EXHAUST_DIAGRAM = Object.freeze({
  left: 192,
  firstRow: 16,
  outletSpacing: 6,
  headingRow: 14,
  formColumn: 28,
  unitColumn: 37,
  pipeRow: 29,
  pipeColumn: 25,
});
/** The listed era, market and specification: labels at column 0, values at column 5, wrapped by words. */
export const LISTING_COLUMNS = Object.freeze({ label: 0, value: 5 });
/** A lighter grey than DARK, for axes (RGB555 22, 22, 22). */
export const GREY = 22 | (22 << 5) | (22 << 10);
/** A darker grey than DARK, for grounds and rules (RGB555 12, 12, 12). */
export const DIM = 12 | (12 << 5) | (12 << 10);

/**
 * What a page draws from: the frame and text under it, the shown vehicle, the fuel-cut entry ratio and the fixed steps
 * since the vehicle was shown.
 */
export interface VehiclePageScene {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  readonly vehicle: CompiledVehicleDefinition;
  readonly fuelCutEnterRedlineRatio: number;
  readonly shownSteps: number;
}

/** One page of SELECT VEHICLE: the name its tab shows, and its drawing of the shown vehicle's pixels and text. */
export interface VehiclePage {
  readonly name: string;
  draw(scene: VehiclePageScene): void;
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
