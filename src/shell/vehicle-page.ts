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
/** The gear rows: labels at `label`, ratios at `ratio` under the `RATIO` heading at `ratioHeading`. */
export const GEAR_COLUMNS = Object.freeze({ label: 0, ratio: 4, ratioHeading: 5 });
/** The listed era, market and specification: labels at column 0, values at column 5, wrapped by words. */
export const LISTING_COLUMNS = Object.freeze({ label: 0, value: 5 });
/** A lighter grey than DARK, for axes (RGB555 22, 22, 22). */
export const GREY = 22 | (22 << 5) | (22 << 10);
/** A darker grey than DARK, for grounds and rules (RGB555 12, 12, 12). */
export const DIM = 12 | (12 << 5) | (12 << 10);

/** What a page draws from: the frame and text under it, the shown vehicle and the fuel-cut entry ratio. */
export interface VehiclePageScene {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  readonly vehicle: CompiledVehicleDefinition;
  readonly fuelCutEnterRedlineRatio: number;
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
export const ratio = (value: number) => value.toFixed(3);
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
