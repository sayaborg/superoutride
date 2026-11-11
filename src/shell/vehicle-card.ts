import { TEXT_PALETTES } from '../image/text-tiles.js';
import {
  createCompetitorObservation,
  writeCompetitorPowertrain,
  type CompetitorObservation,
} from '../race/competitor-observation.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import { createVehicleModel } from '../vehicle/physics/vehicle-model.js';
import { createHeldVehicle, updateHeldVehicle } from '../vehicle/physics/vehicle-physics.js';
import {
  createVehiclePaletteVariant,
  selectVehicleSprite,
  type VehicleSpriteImages,
} from '../vehicle/vehicle-sprite-set.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import { drawScaledSprite, scaledSpriteBounds } from '../view/sprite.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { CardPage, PageCanvas, PixelBox } from './card-face.js';
import type { CardStyle, PageFact, PageParts } from './card-styles.js';

/** A picture too large for its box shrinks from the player depth by this factor until every yaw image fits. */
const PICTURE_SCALE_STEP = 0.99;
/** The still card's picture: the yaw image 40 of a turn's 64, the vehicle seen from ahead and its right. */
const REST_TURN = 40 / 64;
/** At rest in focus the picture turns a yaw image every this many fixed steps (64 images in 6.4 s). */
const YAW_IMAGE_STEPS = 6;
/**
 * The free-revving engine at rest in focus, as on the catalog's ENGINE page: its throttle from each entry's fixed step
 * to the next one's, idle for 1.5 s, full for 1 s, closed for 1.5 s and full to the end of `steps`, again and again.
 */
const FREE_REV = Object.freeze({
  steps: 360,
  throttle: Object.freeze([
    Object.freeze({ step: 0, throttle: 0 }),
    Object.freeze({ step: 90, throttle: 1 }),
    Object.freeze({ step: 150, throttle: 0 }),
    Object.freeze({ step: 240, throttle: 1 }),
  ]),
});
/** The engine speed's marks on the curves: squares this many pixels about each crossing. */
const MARK_REACH = 1;
/**
 * The graph in its box: 20 % to 110 % of redline across it and 0 to each curve's maximum up it, `clear` pixels clear of
 * the box's edges, with grid lines every 10 % of redline and every quarter of the height.
 */
const GRAPH = Object.freeze({ clear: 3, first: 0.2, last: 1.1, grid: 0.1, levels: 4 });
/** The pictures stand this many pixels clear of their box's edges. */
const PICTURE_CLEAR = 2;
/** A lighter grey than DARK, for the graph's axes (RGB555 22, 22, 22). */
const GREY = 22 | (22 << 5) | (22 << 10);
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
function pictureFit(images: VehicleSpriteImages, box: PixelBox) {
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
    if (right - left <= box.width - 2 * PICTURE_CLEAR && bottom - top <= box.height - 2 * PICTURE_CLEAR)
      return {
        scale,
        x: box.x + box.width / 2 - (left + right) / 2,
        y: box.y + box.height / 2 - (top + bottom) / 2,
      };
  }
}

/**
 * The graph of `vehicle`'s engine in `box`: its edges, x and y by engine speed and share of a curve's maximum, and the
 * power and torque curves' shares, each of its maximum, by engine speed.
 */
function graphOf(vehicle: CompiledVehicleDefinition, box: PixelBox) {
  const powertrain = vehicle.compiledVehicle.powertrain,
    redline = powertrain.redlineRpm,
    peaks = enginePeaks(vehicle),
    left = box.x + GRAPH.clear,
    right = box.x + box.width - 1 - GRAPH.clear,
    top = box.y + GRAPH.clear,
    bottom = box.y + box.height - 1 - GRAPH.clear,
    perRedline = (right - left) / (GRAPH.last - GRAPH.first);
  return Object.freeze({
    redline,
    left,
    right,
    top,
    bottom,
    xOf: (rpm: number) => left + (rpm / redline - GRAPH.first) * perRedline,
    rpmOf: (x: number) => (GRAPH.first + (x - left) / perRedline) * redline,
    yOf: (share: number) => bottom - Math.round(Math.min(1, share) * (bottom - top)),
    power: (rpm: number) => (sampleEngineTorque(powertrain, rpm) * rpm * 2 * Math.PI) / 60 / (peaks.power * 1000),
    torque: (rpm: number) => sampleEngineTorque(powertrain, rpm) / peaks.torque,
  });
}

/**
 * The graph: DARK grid lines, lighter axes, the redline dashed RED, and the power (RED) and torque (YELLOW) curves, each
 * scaled so its maximum touches the top, a pixel wide and joined vertically between columns, from the larger of idle
 * and 20 % of redline to the fuel cut's entry.
 */
function drawGraph(
  canvas: PageCanvas,
  vehicle: CompiledVehicleDefinition,
  graph: ReturnType<typeof graphOf>,
  fuelCutEnterRedlineRatio: number,
) {
  const { surface } = canvas,
    powertrain = vehicle.compiledVehicle.powertrain;
  const grid = canvas.mainColor(TEXT_PALETTES.DARK);
  for (let k = 1; k <= GRAPH.levels; k++) surface.fillSpan(graph.yOf(k / GRAPH.levels), graph.left, graph.right, grid);
  for (let share = GRAPH.first + GRAPH.grid; share < GRAPH.last + 1e-9; share += GRAPH.grid) {
    const x = Math.round(graph.xOf(share * graph.redline));
    for (let y = graph.top; y < graph.bottom; y++) surface.setPixel(x, y, grid);
  }
  surface.fillSpan(graph.bottom, graph.left, graph.right, GREY);
  for (let y = graph.top; y <= graph.bottom; y++) surface.setPixel(graph.left, y, GREY);
  const red = canvas.mainColor(TEXT_PALETTES.RED),
    yellow = canvas.mainColor(TEXT_PALETTES.YELLOW);
  for (let y = graph.top; y < graph.bottom; y += 2) surface.setPixel(Math.round(graph.xOf(graph.redline)), y, red);
  const first = Math.ceil(graph.xOf(Math.max(powertrain.idleRpm, GRAPH.first * graph.redline))),
    last = Math.min(graph.right, Math.floor(graph.xOf(fuelCutRpm(graph.redline, fuelCutEnterRedlineRatio))));
  const curve = (share: (rpm: number) => number, color: number) => {
    let previous: number | null = null;
    for (let x = first; x <= last; x++) {
      const y = graph.yOf(share(graph.rpmOf(x))),
        from = previous ?? y;
      for (let row = Math.min(from, y); row <= Math.max(from, y); row++) surface.setPixel(x, row, color);
      previous = y;
    }
  };
  curve(graph.power, red);
  curve(graph.torque, yellow);
}

/**
 * The engine at the end of each fixed step of its free revving, its controls and powertrain as an observation copies
 * them: its model, as a run builds it, held and revved by `FREE_REV` from idle for two of its turns; the second repeats
 * from then on.
 */
function freeRevs(vehicle: CompiledVehicleDefinition, driving: CompiledDrivingDefinition) {
  const model = createVehicleModel({ vehicleDefinition: vehicle, drivingDefinition: driving }, SIM_DT);
  const engine = createHeldVehicle(model);
  return Array.from({ length: 2 * FREE_REV.steps }, (_, step) => {
    let throttle = 0;
    for (const entry of FREE_REV.throttle) if (entry.step <= step % FREE_REV.steps) throttle = entry.throttle;
    updateHeldVehicle(engine, model, { steering: 0, throttle, brake: 0 });
    return Object.freeze({ control: { ...engine.control }, powertrain: { ...engine.powertrain } });
  });
}
/** The free revving's step `steps` after its start: the second turn repeats. */
const freeRevStep = (steps: number) => (steps < FREE_REV.steps ? steps : FREE_REV.steps + (steps % FREE_REV.steps));

/** How the card shows the vehicle's color: its name, and whether UP and DOWN may change it. */
export interface VehicleCardColor {
  readonly color: string;
  readonly changes: boolean;
}

/** Each gear's road speed at redline (km/h), at the rolling radius of the wheels taking more than half the drive. */
function gearSpeeds(vehicle: CompiledVehicleDefinition) {
  const v = vehicle.compiledVehicle,
    p = v.powertrain;
  const radius = (v.frontDriveTorqueFraction > 0.5 ? v.frontStation : v.rearStation).rollingRadius;
  const metersPerSecond = (p.redlineRpm / 60) * 2 * Math.PI * radius;
  return p.gearRatios.map((gear) => (metersPerSecond * 3.6) / (gear * p.finalDriveRatio));
}

/** What a vehicle's card says of it: the vehicle alone, the same in every series and in FREE PLAY (K, 2026-11-12). */
function vehicleParts(vehicle: CompiledVehicleDefinition, shown: VehicleCardColor): PageParts {
  const { metadata, visuals } = vehicle.listing;
  const v = vehicle.compiledVehicle,
    p = v.powertrain,
    peaks = enginePeaks(vehicle),
    front = Math.round(v.frontDriveTorqueFraction * 100),
    wheelbase = v.frontAxle + v.rearAxle,
    load = Math.round((v.rearAxle / wheelbase) * 100);
  const millimeters = (meters: number) => integer(meters * 1000);
  const type = metadata.identifier?.officialLabel.toUpperCase() ?? '';
  const facts: PageFact[] = [
    { label: 'ENGINE', value: metadata.engine.toUpperCase(), note: `${integer(p.displacementCc)}CC` },
    {
      label: 'POWER',
      value: quantity(peaks.power),
      unit: 'kW',
      note: `/${integer(peaks.powerRpm)}`,
      ink: TEXT_PALETTES.RED,
    },
    {
      label: 'TORQUE',
      value: quantity(peaks.torque),
      unit: 'Nm',
      note: `/${integer(peaks.torqueRpm)}`,
      ink: TEXT_PALETTES.YELLOW,
    },
    { label: 'REDLINE', value: integer(p.redlineRpm), unit: 'rpm' },
    { label: 'MASS', value: integer(v.mass), unit: 'kg' },
    { label: 'P/W', value: integer((peaks.power * 1000) / v.mass), unit: 'kW/t' },
    { label: 'GEARS', value: String(p.gearRatios.length), note: `FINAL ${p.finalDriveRatio.toFixed(2)}` },
    front === 0 || front === 100
      ? { label: 'DRIVE', value: front === 0 ? 'RWD' : 'FWD' }
      : { label: 'DRIVE', value: 'AWD', note: `${front}/${100 - front}` },
  ];
  const more: PageFact[] = [
    { label: 'YEAR', value: metadata.physicsAnchor.modelYear.toUpperCase() },
    { label: 'TYPE', value: type || '-' },
    { label: 'LENGTH', value: millimeters(v.overallLength), unit: 'mm' },
    { label: 'WIDTH', value: millimeters(v.overallWidth), unit: 'mm' },
    { label: 'HEIGHT', value: millimeters(v.overallHeight), unit: 'mm' },
    { label: 'W/BASE', value: millimeters(wheelbase), unit: 'mm' },
    { label: 'WEIGHT', value: `${load}/${100 - load}`, note: 'F/R' },
    { label: 'TOP', value: integer(gearSpeeds(vehicle).at(-1)!), unit: 'km/h' },
  ];
  return Object.freeze({
    title: `${metadata.manufacturer} ${metadata.model}`.toUpperCase(),
    tag: metadata.period.toUpperCase(),
    factsName: 'ENGINE',
    facts,
    moreName: 'BODY',
    more,
    choice: Object.freeze({
      label: 'COLOR',
      value: visuals.colorNames[shown.color] ?? shown.color,
      changes: shown.changes,
    }),
    chart: 'block',
    chartName: 'POWER / TORQUE',
    words: null,
  });
}

/**
 * A vehicle's card (SELECT VEHICLE; K, 2026-11-12: the same card wherever it appears) in `style`: its manufacturer and
 * model and its period; its picture in its color, still at the yaw image 40 of 64; its engine's power (RED) and torque
 * (YELLOW) over 20 % to 110 % of its redline; its engine, power and torque with their speeds (their labels in their
 * curves' colors, the graph's legend), redline, mass, power to mass, gears with the final drive, and drive; its model
 * year, type, length, width, height, wheelbase, weight on the front and rear wheels and speed at redline in top gear; and
 * its color, between `▲` and `▼` when UP and DOWN change it. At rest in focus its picture turns and its engine revs,
 * and is heard (K, 2026-11-12).
 */
export function vehicleCard(
  vehicle: CompiledVehicleDefinition,
  shown: VehicleCardColor,
  driving: CompiledDrivingDefinition,
  style: CardStyle,
): CardPage {
  const parts = vehicleParts(vehicle, shown);
  const fuelCutEnterRedlineRatio = driving.compiledDriving.powertrain.fuelCutEnterRedlineRatio;
  // The pictures in the shown color and the free revving, each made when first needed; and each painted face's
  // picture, with its fit and ground, and graph.
  let images: VehicleSpriteImages | null = null,
    revs: ReturnType<typeof freeRevs> | null = null,
    heard: CompetitorObservation | null = null;
  const painted: ({
    picture: { box: PixelBox; ground: number; fit: ReturnType<typeof pictureFit> } | null;
    graph: ReturnType<typeof graphOf> | null;
  } | null)[] = [];
  let inks: { line: number; power: number; torque: number } | null = null;
  const pictures = () => (images ??= createVehiclePaletteVariant(vehicle.spriteSet, shown.color));
  const drawPicture = (
    target: SoftwareSurface,
    x: number,
    y: number,
    turn: number,
    fit: ReturnType<typeof pictureFit>,
  ) =>
    drawScaledSprite(
      target,
      selectVehicleSprite(pictures(), turn * 2 * Math.PI).asset,
      x + fit.x,
      y + fit.y,
      fit.scale,
    );
  return Object.freeze({
    title: parts.title,
    faces: style.faces(parts),
    paint(canvas: PageCanvas, face: number) {
      const { picture, chart, words } = style.page(canvas, parts, face);
      const fit = picture && pictureFit(pictures(), picture.box),
        graph = chart && graphOf(vehicle, chart.box);
      if (picture && fit) drawPicture(canvas.surface, 0, 0, REST_TURN, fit);
      if (graph) drawGraph(canvas, vehicle, graph, fuelCutEnterRedlineRatio);
      painted[face] = { picture: picture && fit && { ...picture, fit }, graph };
      inks = {
        line: canvas.mainColor(TEXT_PALETTES.WHITE),
        power: canvas.mainColor(TEXT_PALETTES.RED),
        torque: canvas.mainColor(TEXT_PALETTES.YELLOW),
      };
      return words;
    },
    // At rest in focus, over the painted face, the picture turns from the still one and the engine revs: its speed a
    // WHITE upright line on the graph with a mark on each curve in the curve's color.
    live(target: SoftwareSurface, x: number, y: number, steps: number, face: number) {
      const shownFace = painted[face];
      if (!shownFace || !inks) throw new Error('A vehicle card moves only once painted');
      const { picture, graph } = shownFace;
      if (picture) {
        const { box, ground, fit } = picture,
          count = pictures().yawVariants;
        for (let row = box.y; row < box.y + box.height; row++)
          target.fillSpan(y + row, x + box.x, x + box.x + box.width - 1, ground);
        const image = Math.round(REST_TURN * count) + Math.floor(steps / YAW_IMAGE_STEPS);
        drawPicture(target, x, y, (image % count) / count, fit);
      }
      if (!graph) return;
      revs ??= freeRevs(vehicle, driving);
      const rpm = revs[freeRevStep(steps)]!.powertrain.engineRpm,
        at = Math.round(graph.xOf(rpm));
      if (rpm < GRAPH.first * graph.redline || at > graph.right) return;
      for (let row = graph.top; row <= graph.bottom; row++) target.setPixel(x + at, y + row, inks.line);
      for (const [share, color] of [
        [graph.power, inks.power],
        [graph.torque, inks.torque],
      ] as const) {
        const mark = graph.yOf(share(rpm));
        for (let row = mark - MARK_REACH; row <= mark + MARK_REACH; row++)
          target.fillSpan(y + row, x + at - MARK_REACH, x + at + MARK_REACH, color);
      }
    },
    // The revving engine's observation, in the player's place, at rest but for its controls and powertrain.
    sound(steps: number) {
      revs ??= freeRevs(vehicle, driving);
      heard ??= createCompetitorObservation('PLAYER', vehicle.compiledVehicle.id, shown.color, vehicle.listing.form);
      writeCompetitorPowertrain(heard, revs[freeRevStep(steps)]!, (steps + 1) * SIM_DT);
      return heard;
    },
  });
}
