import { TEXT_MARKS, TEXT_PALETTES } from '../image/text-tiles.js';
import type { MenuCommand } from '../input/menu-input.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import { drawScaledSprite, scaledSpriteBounds } from '../view/sprite.js';
import type { TextLayer } from '../view/text-layer.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  spriteSetColors,
  type VehicleSpriteImages,
} from '../vehicle/vehicle-sprite-set.js';
import { SCREEN_BACKGROUND } from './menu.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MenuResponse, Screen } from './screen-host.js';

/** Fixed steps each yaw image stays on SELECT VEHICLE. */
const YAW_IMAGE_STEPS = 6;
/** The picture's box in pixels: text columns 0-19 by rows 4-10. */
const PICTURE_BOX = Object.freeze({ x: 0, y: 32, width: 160, height: 56 });
/** The factor by which a picture too large for its box shrinks from the player depth until it fits. */
const PICTURE_SCALE_STEP = 0.99;
/**
 * The curve graph in pixels, under text columns 22-39 and rows 4-11: its horizontal axis runs from 20 % of redline at
 * the left edge, 16 pixels for each 10 %, to 110 % beyond the right edge; its vertical axis from 0 on the bottom row to
 * 100 % on the top grid line, with grid lines every 25 % (15 pixels).
 */
const GRAPH = Object.freeze({
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
/** The graph's axes, a lighter grey than its DARK grid (RGB555 22, 22, 22). */
const GRAPH_AXIS_COLOR = 22 | (22 << 5) | (22 << 10);
const GEAR_LABELS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];
/** The value columns: labels at a column's first text column, values eight columns on, from row 13. */
const VALUE_COLUMNS = Object.freeze({ engine: 0, body: 20, valueOffset: 8, firstRow: 13 });

/** A vehicle's display name: its manufacturer and model. */
export function vehicleName(vehicle: CompiledVehicleDefinition): string {
  const { manufacturer, model } = vehicle.listing.metadata;
  return `${manufacturer} ${model}`;
}

const integer = (value: number) => Math.round(value).toString();
/** Power or torque: an integer from 100 up, one decimal below. */
const quantity = (value: number) => (Math.round(value * 10) >= 1000 ? integer(value) : value.toFixed(1));
const millimetres = (metres: number) => `${integer(metres * 1000)}mm`;
const ratio = (value: number) => value.toFixed(3);
const twoDecimals = (value: number) => value.toFixed(2);

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

/** The engine and driveline column and the body column, as label and value rows of the compiled vehicle. */
function vehicleValues(vehicle: CompiledVehicleDefinition) {
  const { mechanics, compiledVehicle: v } = vehicle;
  const p = v.powertrain;
  const peaks = enginePeaks(vehicle);
  const f = v.frontDriveTorqueFraction;
  const front = Math.round(f * 100);
  const drive = f === 0 ? 'RWD' : f === 1 ? 'FWD' : `AWD ${front}/${100 - front}`;
  const wheelbase = v.frontAxle + v.rearAxle;
  const frontLoad = Math.round((v.rearAxle / wheelbase) * 100);
  const engine: (readonly [string, string])[] = [
    ['ENGINE', `${vehicle.listing.metadata.engine} ${integer(p.displacementCc)}cc`],
    ['CYCLE', `${p.cycle}-STROKE`],
    ['POWER', `${quantity(peaks.power)}kW/${integer(peaks.powerRpm)}`],
    ['TORQUE', `${quantity(peaks.torque)}Nm/${integer(peaks.torqueRpm)}`],
    ['IDLE', `${integer(p.idleRpm)}rpm`],
    ['REDLINE', `${integer(p.redlineRpm)}rpm`],
    ['DRIVE', drive],
    ...p.gearRatios.map((gear, i) => [GEAR_LABELS[i]!, ratio(gear)] as const),
    ['FINAL', ratio(p.finalDriveRatio)],
    ['BRAKE F', `${integer(v.frontStation.maxBrakeTorque)}Nm`],
    ['BRAKE R', `${integer(v.rearStation.maxBrakeTorque)}Nm`],
    ['DRAG', `${twoDecimals(v.quadraticDrag)}kg/m`],
  ];
  const body: (readonly [string, string])[] = [
    ['LENGTH', millimetres(v.overallLength)],
    ['WIDTH', millimetres(v.overallWidth)],
    ['HEIGHT', millimetres(v.overallHeight)],
    ['W/BASE', millimetres(wheelbase)],
    ['MASS', `${integer(v.mass)}kg`],
    ['F/R', `${frontLoad}/${100 - frontLoad}`],
    ['CG HT', millimetres(v.desiredCgHeight)],
    ['YAW I', `${integer(v.yawInertia)}kgm2`],
    ['PITCH I', `${integer(v.pitchInertia)}kgm2`],
    ['TIRE F', millimetres(2 * mechanics.frontWheelRadius)],
    ['TIRE R', millimetres(2 * mechanics.rearWheelRadius)],
    ['RIDE', `${twoDecimals(mechanics.frontRideFrequency)}/${twoDecimals(mechanics.rearRideFrequency)}Hz`],
    ['DAMPING', `${twoDecimals(mechanics.frontDampingRatio)}/${twoDecimals(mechanics.rearDampingRatio)}`],
    ['TRAVEL', `${integer(mechanics.frontQTravel * 1000)}/${integer(mechanics.rearQTravel * 1000)}mm`],
  ];
  return { engine, body };
}

/**
 * The picture's one scale for all its yaw images, the largest from the player depth down at which every image, each
 * standing at the same anchor, fits the picture box, and the anchor that centres those images in the box.
 */
function pictureFit(set: VehicleSpriteImages) {
  const assets = Array.from(
    { length: set.yawVariants },
    (_, i) => selectVehicleSprite(set, (i * Math.PI * 2) / set.yawVariants).asset,
  );
  for (let scale = PLAYER_DEPTH_PIXELS_PER_METER; ; scale *= PICTURE_SCALE_STEP) {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const asset of assets) {
      const bounds = scaledSpriteBounds(asset, scale);
      left = Math.min(left, bounds.left);
      top = Math.min(top, bounds.top);
      right = Math.max(right, bounds.right);
      bottom = Math.max(bottom, bounds.bottom);
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
 * The graph: DARK grid lines, lighter axes, and the torque (YELLOW) and power (RED) curves, each scaled so its maximum
 * touches the top grid line and joined vertically between columns, from the larger of idle and 20 % of redline to the
 * fuel-cut entry.
 */
function drawGraph(frame: SoftwareSurface, text: TextLayer, vehicle: CompiledVehicleDefinition, fuelCutRatio: number) {
  const powertrain = vehicle.compiledVehicle.powertrain;
  const redline = powertrain.redlineRpm;
  const height = GRAPH.bottom - GRAPH.top;
  const xOf = (rpm: number) => GRAPH.left + (rpm / redline - GRAPH.firstRedline) * GRAPH.pixelsPerRedline;
  const rpmOf = (x: number) => (GRAPH.firstRedline + (x - GRAPH.left) / GRAPH.pixelsPerRedline) * redline;
  const grid = text.mainColor(TEXT_PALETTES.DARK);
  for (let k = 1; k <= GRAPH.gridLevels; k++)
    frame.fillSpan(GRAPH.bottom - (k * height) / GRAPH.gridLevels, GRAPH.left, GRAPH.right, grid);
  const gridLines = Math.round((GRAPH.lastRedline - GRAPH.firstRedline) / GRAPH.gridRedline);
  for (let k = 1; k <= gridLines; k++) {
    const x = Math.min(GRAPH.right, GRAPH.left + k * GRAPH.gridRedline * GRAPH.pixelsPerRedline);
    for (let y = GRAPH.top; y < GRAPH.bottom; y++) frame.setPixel(x, y, grid);
  }
  frame.fillSpan(GRAPH.bottom, GRAPH.left, GRAPH.right, GRAPH_AXIS_COLOR);
  for (let y = GRAPH.top; y <= GRAPH.bottom; y++) frame.setPixel(GRAPH.left, y, GRAPH_AXIS_COLOR);

  const peaks = enginePeaks(vehicle);
  const first = Math.ceil(xOf(Math.max(powertrain.idleRpm, GRAPH.firstRedline * redline)));
  const last = Math.min(GRAPH.right, Math.floor(xOf(fuelCutRpm(redline, fuelCutRatio))));
  const curve = (share: (rpm: number) => number, color: number) => {
    let previous: number | null = null;
    for (let x = first; x <= last; x++) {
      const y = GRAPH.bottom - Math.round(share(rpmOf(x)) * height);
      const from = previous ?? y;
      for (let row = Math.min(from, y); row <= Math.max(from, y); row++) frame.setPixel(x, row, color);
      previous = y;
    }
  };
  const peakPower = peaks.power * 1000;
  curve(
    (rpm) => (sampleEngineTorque(powertrain, rpm) * rpm * 2 * Math.PI) / 60 / peakPower,
    text.mainColor(TEXT_PALETTES.RED),
  );
  curve((rpm) => sampleEngineTorque(powertrain, rpm) / peaks.torque, text.mainColor(TEXT_PALETTES.YELLOW));
}

/**
 * SELECT VEHICLE, one catalog page per vehicle: its name, a picture turning through its yaw images in its color, its
 * torque and power curves to the fuel-cut entry (`fuelCutEnterRedlineRatio` times redline) and its physical values as
 * the simulation holds them. LEFT and RIGHT change the vehicle and UP and DOWN its color, each wrapping around,
 * starting from `choice`; each vehicle is first shown in `colorOf` its color. With fixed colors it has no color choice
 * and keeps that color. CONFIRM chooses the shown vehicle and color (null with fixed colors).
 */
export function createVehicleScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  candidates: readonly CompiledVehicleDefinition[],
  fuelCutEnterRedlineRatio: number,
  choice: {
    vehicleId: string | null;
    fixedColors: boolean;
    colorOf(vehicle: CompiledVehicleDefinition): string;
    /** Its CONFIRM starts the run: it answers `entry`. */
    entry: boolean;
    /** A picture the page stands over at quarter brightness; null for the plain background. */
    background: TilePicture | null;
  },
  actions: { confirm(vehicle: CompiledVehicleDefinition, color: string | null): void; back(): void },
): Screen {
  let index = Math.max(
    0,
    candidates.findIndex((vehicle) => vehicle.compiledVehicle.id === choice.vehicleId),
  );
  let colors: readonly string[] = [],
    color = 0,
    steps = 0;
  const sets = new Map<string, VehicleSpriteImages>();
  // A vehicle's colors share its pictures' shapes, so one fit serves them all.
  const fits = new Map<string, ReturnType<typeof pictureFit>>();
  const show = () => {
    const vehicle = candidates[index]!;
    colors = choice.fixedColors ? [] : spriteSetColors(vehicle.spriteSet);
    color = Math.max(0, colors.indexOf(choice.colorOf(vehicle)));
  };
  show();
  const turn = (list: number, step: number, at: number) => (at + step + list) % list;
  return {
    live: false,
    wallpaper: choice.background,
    tick() {
      steps++;
    },
    command(command: MenuCommand): MenuResponse | null {
      if (command === 'LEFT' || command === 'RIGHT') {
        const before = index;
        index = turn(candidates.length, command === 'LEFT' ? -1 : 1, index);
        show();
        return index === before ? null : 'move';
      }
      if ((command === 'UP' || command === 'DOWN') && colors.length > 0) {
        const before = color;
        color = turn(colors.length, command === 'UP' ? -1 : 1, color);
        return color === before ? null : 'move';
      }
      if (command === 'CONFIRM') {
        actions.confirm(candidates[index]!, colors[color] ?? null);
        return choice.entry ? 'entry' : 'confirm';
      }
      if (command === 'BACK') {
        actions.back();
        return 'back';
      }
      return null;
    },
    render() {
      const vehicle = candidates[index]!;
      const id = vehicle.compiledVehicle.id;
      const palette = colors[color] ?? choice.colorOf(vehicle);
      const key = `${id}/${palette}`;
      let set = sets.get(key);
      if (!set) sets.set(key, (set = createVehiclePaletteVariant(vehicle.spriteSet, palette)));
      let fit = fits.get(id);
      if (!fit) fits.set(id, (fit = pictureFit(set)));
      const yaw = (Math.floor(steps / YAW_IMAGE_STEPS) % set.yawVariants) * ((Math.PI * 2) / set.yawVariants);
      if (choice.background) {
        choice.background.draw(frame, 0, 0);
        for (let i = 0; i < frame.pixels.length; i++) frame.pixels[i] = halveRgb555(halveRgb555(frame.pixels[i]!));
      } else frame.clear(SCREEN_BACKGROUND);
      drawScaledSprite(frame, selectVehicleSprite(set, yaw).asset, fit.x, fit.y, fit.scale);
      drawGraph(frame, text, vehicle, fuelCutEnterRedlineRatio);

      const { metadata } = vehicle.listing;
      text.clear();
      text.write(13, 0, 'SELECT VEHICLE', TEXT_PALETTES.WHITE);
      text.write(32, 0, `${TEXT_MARKS.left} ${index + 1}/${candidates.length} ${TEXT_MARKS.right}`, TEXT_PALETTES.DARK);
      text.write(1, 2, vehicleName(vehicle), TEXT_PALETTES.YELLOW);
      const label = metadata.identifier ? `  ${metadata.identifier.officialLabel.toUpperCase()}` : '';
      text.write(1, 3, `${metadata.physicsAnchor.modelYear}${label}`, TEXT_PALETTES.DARK);
      text.write(22, 3, 'TORQUE', TEXT_PALETTES.YELLOW);
      text.write(31, 3, 'POWER', TEXT_PALETTES.RED);
      const colorName = vehicle.listing.visuals.colorNames[palette]!;
      text.write(
        1,
        11,
        colors.length > 0
          ? `${TEXT_MARKS.up} ${colorName} ${color + 1}/${colors.length} ${TEXT_MARKS.down}`
          : colorName,
        TEXT_PALETTES.WHITE,
      );
      const { engine, body } = vehicleValues(vehicle);
      const column = (rows: readonly (readonly [string, string])[], at: number) =>
        rows.forEach(([label, value], row) => {
          text.write(at, VALUE_COLUMNS.firstRow + row, label, TEXT_PALETTES.DARK);
          text.write(at + VALUE_COLUMNS.valueOffset, VALUE_COLUMNS.firstRow + row, value, TEXT_PALETTES.WHITE);
        });
      column(engine, VALUE_COLUMNS.engine);
      column(body, VALUE_COLUMNS.body);
      text.draw(frame);
      present();
    },
  };
}
