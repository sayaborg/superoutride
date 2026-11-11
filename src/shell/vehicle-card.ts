import { TEXT_MARKS, TEXT_PALETTES } from '../image/text-tiles.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  type VehicleSpriteImages,
} from '../vehicle/vehicle-sprite-set.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import { drawScaledSprite, scaledSpriteBounds } from '../view/sprite.js';
import { PAGE, PAGE_COLORS, type CardPage, type PageCanvas } from './card-face.js';

/** The vehicle's pictures' box in the picture's box, in pixels: 2 clear of its edges. */
const PICTURE_BOX = Object.freeze({ x: 3, y: 27, width: 121, height: 65 });
/** A picture too large for its box shrinks from the player depth by this factor until every yaw image fits. */
const PICTURE_SCALE_STEP = 0.99;
/** The still card's picture: the yaw image 40 of a turn's 64, the vehicle seen from ahead and its right. */
const REST_TURN = 40 / 64;
/**
 * The graph in the facts' box, in pixels: 20 % to 110 % of redline across x `left`–`right` and 0 to each curve's
 * maximum up y `bottom`–`top`, with grid lines every 10 % of redline and every quarter of the height.
 */
const GRAPH = Object.freeze({
  left: 131,
  right: 218,
  top: 29,
  bottom: 89,
  first: 0.2,
  last: 1.1,
  grid: 0.1,
  levels: 4,
});
/** A lighter grey than DARK, for the graph's axes (RGB555 22, 22, 22). */
const GREY = 22 | (22 << 5) | (22 << 10);
/** The specifications in the words' box: labels from column `label`, values from column `value`, rows from `row`. */
const SPECS = Object.freeze({ label: 1, value: 9, row: 13 });

const integer = (value: number) => Math.round(value).toString();
/** Power or torque: an integer from 10 up, one decimal below. */
const quantity = (value: number) => (Math.round(value * 10) >= 100 ? integer(value) : value.toFixed(1));

/** The curve's maximum torque and maximum power (kW), with their RPM: points C and D of the admitted curve. */
function enginePeaks(vehicle: CompiledVehicleDefinition) {
  const powertrain = vehicle.compiledVehicle.powertrain;
  const { peakTorqueRpm, peakPowerRpm } = powertrain;
  return {
    torque: sampleEngineTorque(powertrain, peakTorqueRpm),
    torqueRpm: peakTorqueRpm,
    power: (sampleEngineTorque(powertrain, peakPowerRpm) * peakPowerRpm * 2 * Math.PI) / 60 / 1000,
    powerRpm: peakPowerRpm,
  };
}

/**
 * The pictures' one scale, the largest from the player depth down at which every yaw image, each standing at the same
 * anchor, fits the pictures' box, and the anchor that centres them in it.
 */
function pictureFit(images: VehicleSpriteImages) {
  const assets = Array.from(
    { length: images.yawVariants },
    (_, i) => selectVehicleSprite(images, (i * Math.PI * 2) / images.yawVariants).asset,
  );
  for (let scale = PLAYER_DEPTH_PIXELS_PER_METER; ; scale *= PICTURE_SCALE_STEP) {
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const asset of assets) {
      const bounds = scaledSpriteBounds(asset, scale);
      [left, top] = [Math.min(left, bounds.left), Math.min(top, bounds.top)];
      [right, bottom] = [Math.max(right, bounds.right), Math.max(bottom, bounds.bottom)];
    }
    if (right - left <= PICTURE_BOX.width && bottom - top <= PICTURE_BOX.height)
      return {
        scale,
        x: PICTURE_BOX.x + PICTURE_BOX.width / 2 - (left + right) / 2,
        y: PICTURE_BOX.y + PICTURE_BOX.height / 2 - (top + bottom) / 2,
      };
  }
}

/**
 * The graph: DARK grid lines, lighter axes, the redline dashed RED, and the power (RED) and torque (YELLOW) curves, each
 * scaled so its maximum touches the top, a pixel wide and joined vertically between columns, from the larger of idle
 * and 20 % of redline to the fuel cut's entry.
 */
function drawGraph(canvas: PageCanvas, vehicle: CompiledVehicleDefinition, fuelCutEnterRedlineRatio: number) {
  const { surface } = canvas;
  const powertrain = vehicle.compiledVehicle.powertrain,
    redline = powertrain.redlineRpm,
    height = GRAPH.bottom - GRAPH.top,
    perRedline = (GRAPH.right - GRAPH.left) / (GRAPH.last - GRAPH.first);
  const xOf = (rpm: number) => GRAPH.left + (rpm / redline - GRAPH.first) * perRedline,
    rpmOf = (x: number) => (GRAPH.first + (x - GRAPH.left) / perRedline) * redline;
  const grid = canvas.mainColor(TEXT_PALETTES.DARK);
  for (let k = 1; k <= GRAPH.levels; k++)
    surface.fillSpan(Math.round(GRAPH.bottom - (k * height) / GRAPH.levels), GRAPH.left, GRAPH.right, grid);
  for (let share = GRAPH.first + GRAPH.grid; share < GRAPH.last + 1e-9; share += GRAPH.grid) {
    const x = Math.round(GRAPH.left + (share - GRAPH.first) * perRedline);
    for (let y = GRAPH.top; y < GRAPH.bottom; y++) surface.setPixel(x, y, grid);
  }
  surface.fillSpan(GRAPH.bottom, GRAPH.left, GRAPH.right, GREY);
  for (let y = GRAPH.top; y <= GRAPH.bottom; y++) surface.setPixel(GRAPH.left, y, GREY);
  const red = canvas.mainColor(TEXT_PALETTES.RED),
    yellow = canvas.mainColor(TEXT_PALETTES.YELLOW);
  for (let y = GRAPH.top; y < GRAPH.bottom; y += 2) surface.setPixel(Math.round(xOf(redline)), y, red);
  const peaks = enginePeaks(vehicle),
    first = Math.ceil(xOf(Math.max(powertrain.idleRpm, GRAPH.first * redline))),
    last = Math.min(GRAPH.right, Math.floor(xOf(fuelCutRpm(redline, fuelCutEnterRedlineRatio))));
  const curve = (share: (rpm: number) => number, color: number) => {
    let previous: number | null = null;
    for (let x = first; x <= last; x++) {
      const y = GRAPH.bottom - Math.round(Math.min(1, share(rpmOf(x))) * height),
        from = previous ?? y;
      for (let row = Math.min(from, y); row <= Math.max(from, y); row++) surface.setPixel(x, row, color);
      previous = y;
    }
  };
  curve((rpm) => (sampleEngineTorque(powertrain, rpm) * rpm * 2 * Math.PI) / 60 / (peaks.power * 1000), red);
  curve((rpm) => sampleEngineTorque(powertrain, rpm) / peaks.torque, yellow);
}

/** How the card shows the vehicle's color: its name, and whether UP and DOWN may change it. */
export interface VehicleCardColor {
  readonly color: string;
  readonly changes: boolean;
}

/**
 * A vehicle's card (SELECT VEHICLE; K's prototype of the cards, 2026-11-09): its manufacturer and model; its picture in
 * its color, still at the yaw image 40 of 64; its engine's power (RED) and torque (YELLOW) over 20 % to 110 % of its
 * redline; and its specifications: the engine, its power and torque with their speeds and its redline (the POWER and
 * TORQUE labels in their curves' colors, the graph's legend), its mass, gears and drive, its model year and type, and
 * its color, between `▲` and `▼` when UP and DOWN change it.
 */
export function vehicleCard(
  vehicle: CompiledVehicleDefinition,
  shown: VehicleCardColor,
  fuelCutEnterRedlineRatio: number,
): CardPage {
  const { metadata, visuals } = vehicle.listing;
  const title = `${metadata.manufacturer} ${metadata.model}`.toUpperCase();
  const v = vehicle.compiledVehicle,
    p = v.powertrain,
    peaks = enginePeaks(vehicle);
  const drive = v.frontDriveTorqueFraction === 0 ? 'RWD' : v.frontDriveTorqueFraction === 1 ? 'FWD' : 'AWD';
  const type = metadata.identifier?.officialLabel.toUpperCase() ?? '';
  const name = visuals.colorNames[shown.color] ?? shown.color;
  const specs: readonly (readonly [string, number, string])[] = [
    ['ENGINE', TEXT_PALETTES.DARK, `${metadata.engine} ${integer(p.displacementCc)}cc`],
    ['POWER', TEXT_PALETTES.RED, `${quantity(peaks.power)}kW/${integer(peaks.powerRpm)}`],
    ['TORQUE', TEXT_PALETTES.YELLOW, `${quantity(peaks.torque)}Nm/${integer(peaks.torqueRpm)}`],
    ['REDLINE', TEXT_PALETTES.DARK, `${integer(p.redlineRpm)}rpm`],
  ];
  return Object.freeze({
    title,
    paint(canvas: PageCanvas) {
      canvas.box(PAGE.picture, PAGE_COLORS.deep);
      const images = createVehiclePaletteVariant(vehicle.spriteSet, shown.color),
        fit = pictureFit(images);
      drawScaledSprite(
        canvas.surface,
        selectVehicleSprite(images, REST_TURN * 2 * Math.PI).asset,
        fit.x,
        fit.y,
        fit.scale,
      );
      canvas.box(PAGE.facts, PAGE_COLORS.deep);
      drawGraph(canvas, vehicle, fuelCutEnterRedlineRatio);
      canvas.box(PAGE.words, PAGE_COLORS.ground);
      specs.forEach(([label, palette, value], i) => {
        canvas.write(SPECS.label, SPECS.row + i, label, palette);
        canvas.write(SPECS.value, SPECS.row + i, value);
      });
      canvas.write(SPECS.label, SPECS.row + 4, `${integer(v.mass)}kg  ${p.gearRatios.length}-SPEED  ${drive}`);
      const year = metadata.physicsAnchor.modelYear.toUpperCase();
      canvas.write(
        SPECS.label,
        SPECS.row + 5,
        type && !title.includes(type) ? `${year}  ${type}` : year,
        TEXT_PALETTES.DARK,
      );
      canvas.write(SPECS.label, SPECS.row + 6, 'COLOR', TEXT_PALETTES.DARK);
      if (shown.changes) {
        canvas.write(SPECS.value, SPECS.row + 6, TEXT_MARKS.up);
        canvas.write(SPECS.value + 2, SPECS.row + 6, name, TEXT_PALETTES.YELLOW);
        canvas.write(SPECS.value + 3 + name.length, SPECS.row + 6, TEXT_MARKS.down);
      } else canvas.write(SPECS.value, SPECS.row + 6, name, TEXT_PALETTES.YELLOW);
    },
    words: null,
  });
}
