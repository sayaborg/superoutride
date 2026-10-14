import { ACOUSTICS } from '../audio/exhaust-acoustics.js';
import { halveRgb555 } from '../image/rgb555.js';
import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import { PLAYER_DEPTH_PIXELS_PER_METER } from '../view/display-scale.js';
import {
  createExhaustDiagram,
  exhaustTopology,
  pointAlong,
  type DiagramPoint,
  type ExhaustDiagram,
} from '../view/exhaust-diagram.js';
import type { EngineSound } from '../audio/engine-sound.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import {
  BANK_PALETTES,
  DIM,
  EXHAUST_DIAGRAM,
  FIRING_FLASH,
  FIRING_STRIP,
  GRAPH,
  GREY,
  SLOW_MOTION,
  VALUE_COLUMNS,
  integer,
  quantity,
  writeValues,
  type VehiclePage,
  type VehiclePageScene,
} from './vehicle-page.js';

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
 * The graph: DARK grid lines, lighter axes, the redline dashed RED, and the torque (YELLOW) and power (RED) curves, each scaled so its maximum
 * touches the top grid line and joined vertically between columns, from the larger of idle and 20 % of redline to the
 * fuel-cut entry.
 */
function drawGraph({ frame, text, vehicle, fuelCutEnterRedlineRatio }: VehiclePageScene) {
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
  frame.fillSpan(GRAPH.bottom, GRAPH.left, GRAPH.right, GREY);
  for (let y = GRAPH.top; y <= GRAPH.bottom; y++) frame.setPixel(GRAPH.left, y, GREY);
  const redlineX = Math.round(xOf(redline));
  for (let y = GRAPH.top; y < GRAPH.bottom; y += 2) frame.setPixel(redlineX, y, text.mainColor(TEXT_PALETTES.RED));

  const peaks = enginePeaks(vehicle);
  const first = Math.ceil(xOf(Math.max(powertrain.idleRpm, GRAPH.firstRedline * redline)));
  const last = Math.min(GRAPH.right, Math.floor(xOf(fuelCutRpm(redline, fuelCutEnterRedlineRatio))));
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
  text.write(22, 3, 'TORQUE', TEXT_PALETTES.YELLOW);
  text.write(31, 3, 'POWER', TEXT_PALETTES.RED);
}

/** The engine's values in the left column. */
function writeEngine({ text, vehicle, fuelCutEnterRedlineRatio }: VehiclePageScene) {
  const p = vehicle.compiledVehicle.powertrain;
  const peaks = enginePeaks(vehicle);
  writeValues(text, VALUE_COLUMNS.left, VALUE_COLUMNS.firstRow, [
    ['ENGINE', `${vehicle.listing.metadata.engine} ${integer(p.displacementCc)}cc`],
    ['CYCLE', `${p.cycle}-STROKE`],
    ['POWER', `${quantity(peaks.power)}kW/${integer(peaks.powerRpm)}`],
    ['TORQUE', `${quantity(peaks.torque)}Nm/${integer(peaks.torqueRpm)}`],
    ['IDLE', `${integer(p.idleRpm)}rpm`],
    ['REDLINE', `${integer(p.redlineRpm)}rpm`],
    ['CUT', `${integer(fuelCutRpm(p.redlineRpm, fuelCutEnterRedlineRatio))}rpm`],
  ]);
}

/** A color halfway to white. */
function lighten(color: number): number {
  return halveRgb555(color) + halveRgb555(0x7fff);
}

/** A bank's color: its junction's palette in turn. */
const bankColor = ({ text }: VehiclePageScene, junction: number) =>
  text.mainColor(BANK_PALETTES[junction % BANK_PALETTES.length]!);

/** Where in its cycle the engine stands, from 0 to 1, turning at idle in slow motion since the vehicle was shown. */
function cyclePhase({ vehicle, shownSteps }: VehiclePageScene) {
  return ((shownSteps * SIM_DT) / cycleSeconds(vehicle)) % 1;
}

/** A cycle's length in slow-motion seconds at idle. */
function cycleSeconds(vehicle: CompiledVehicleDefinition) {
  return (vehicle.sound.cycleRevolutions * 60 * SLOW_MOTION) / vehicle.compiledVehicle.powertrain.idleRpm;
}

/** The share of a cycle since `cylinder` last fired. */
const sinceFiring = (sound: EngineSound, phase: number, cylinder: number) =>
  (phase - sound.firingPhases[cylinder]! + 1) % 1;

/**
 * The crank degrees between firings in firing order, as their shortest repeating run: `EVEN 120` when all are equal,
 * a single cylinder its cycle (`360`), otherwise the run joined by `-` (`90-270`).
 */
function firingIntervals(sound: EngineSound): string {
  const phases = sound.firingPhases;
  const intervals = phases.map((phase, i) =>
    Math.round(((phases[i + 1] ?? phases[0]! + 1) - phase) * sound.cycleRevolutions * 360),
  );
  if (intervals.length === 1) return `${intervals[0]}`;
  if (intervals.every((interval) => interval === intervals[0])) return `EVEN ${intervals[0]}`;
  const run = intervals.findIndex(
    (_, n) => n > 0 && intervals.length % n === 0 && intervals.every((interval, i) => interval === intervals[i % n]),
  );
  return intervals.slice(0, run > 0 ? run : intervals.length).join('-');
}

/**
 * The firing strip: one cycle of crank degrees with a grey tick every 90°, each cylinder's tick at its phase in its
 * bank's color, lit WHITE and taller for `FIRING_FLASH` of a cycle after it fires, and the engine's place as a dotted
 * cursor; with `FIRING` and its intervals above and its axis and slow motion written below.
 */
function drawFiring(scene: VehiclePageScene) {
  const { frame, text, vehicle } = scene;
  const sound = vehicle.sound;
  const strip = FIRING_STRIP;
  const degrees = sound.cycleRevolutions * 360;
  const width = strip.right - strip.left;
  const phase = cyclePhase(scene);
  const white = text.mainColor(TEXT_PALETTES.WHITE);
  frame.fillSpan(strip.bottom, strip.left, strip.right, GREY);
  for (let degree = 0; degree <= degrees; degree += strip.tickDegrees) {
    const x = Math.round(strip.left + (degree / degrees) * width);
    for (let y = strip.bottom; y <= strip.bottom + 2; y++) frame.setPixel(x, y, GREY);
  }
  sound.firingPhases.forEach((firing, cylinder) => {
    const x = Math.round(strip.left + firing * width);
    const lit = sinceFiring(sound, phase, cylinder) < FIRING_FLASH;
    const color = lit ? white : bankColor(scene, sound.exhaust.banks[cylinder]!);
    for (let y = strip.top + (lit ? 0 : strip.tickInset); y < strip.bottom; y++) {
      frame.setPixel(x, y, color);
      frame.setPixel(x + 1, y, color);
    }
  });
  const cursor = Math.round(strip.left + phase * width);
  for (let y = strip.top - 2; y <= strip.bottom; y += 2) frame.setPixel(cursor, y, GREY);

  text.write(0, strip.labelRow, 'FIRING', TEXT_PALETTES.DARK);
  text.write(VALUE_COLUMNS.valueOffset, strip.labelRow, firingIntervals(sound), TEXT_PALETTES.WHITE);
  text.write(0, strip.axisRow, '0', TEXT_PALETTES.DARK);
  text.write(5, strip.axisRow, 'CRANK DEG', TEXT_PALETTES.DARK);
  text.write(16, strip.axisRow, `${degrees}`.padStart(3), TEXT_PALETTES.DARK);
  text.write(0, strip.noteRow, `IDLE x1/${SLOW_MOTION}`, TEXT_PALETTES.DARK);
}

/** A tube 3 pixels thick along a level or upright segment: lit above or left, `color` along it, shaded below or right. */
function drawTube(frame: SoftwareSurface, from: DiagramPoint, to: DiagramPoint, color: number) {
  const [x0, y0] = from.map(Math.round) as [number, number];
  const [x1, y1] = to.map(Math.round) as [number, number];
  const shades = [lighten(color), color, halveRgb555(color)];
  if (y0 === y1)
    shades.forEach((shade, k) => frame.fillSpan(y0 - 1 + k, Math.min(x0, x1) - 1, Math.max(x0, x1) + 1, shade));
  else
    for (let y = Math.min(y0, y1) - 1; y <= Math.max(y0, y1) + 1; y++)
      shades.forEach((shade, k) => frame.setPixel(x0 - 1 + k, y, shade));
}

const diagrams = new WeakMap<EngineSound, ExhaustDiagram>();
/** A sound's exhaust diagram, made once for each sound. */
function exhaustDiagramOf(sound: EngineSound): ExhaustDiagram {
  let diagram = diagrams.get(sound);
  if (!diagram)
    diagrams.set(
      sound,
      (diagram = createExhaustDiagram(sound, {
        left: EXHAUST_DIAGRAM.left,
        firstRow: EXHAUST_DIAGRAM.firstRow,
        rowHeight: TEXT_TILE_SIZE,
        pixelsPerMeter: PLAYER_DEPTH_PIXELS_PER_METER,
        outletSpacing: EXHAUST_DIAGRAM.outletSpacing,
      })),
    );
  return diagram;
}

/**
 * The exhaust: its form and each primary's length in centimetres; the pipes as tubes, primaries in their bank's
 * color and the rest grey, each open end with an outlet and each cylinder a block that is lit WHITE for
 * `FIRING_FLASH` of a cycle after it fires; and each firing's pulse, a WHITE dot with a grey trail, travelling from
 * the primary's start along every way to an open end at the speed of sound in slow motion. `PIPE` lists the pipes'
 * lengths.
 */
function drawExhaust(scene: VehiclePageScene) {
  const { frame, text, vehicle } = scene;
  const sound = vehicle.sound;
  const diagram = exhaustDiagramOf(sound);
  const phase = cyclePhase(scene);
  const seconds = cycleSeconds(vehicle);
  const white = text.mainColor(TEXT_PALETTES.WHITE);
  const centimetres = (metres: number) => integer(metres * 100);

  for (const { from, to, junction } of diagram.segments)
    drawTube(frame, from, to, junction === null ? GREY : bankColor(scene, junction));
  for (const [x, y] of diagram.outlets)
    for (let k = -3; k <= 3; k++) frame.fillSpan(y + k, x + 1, x + 5, k < -1 ? lighten(GREY) : k > 1 ? DIM : GREY);

  const pixelsPerSecond = (ACOUSTICS.waveSpeed * PLAYER_DEPTH_PIXELS_PER_METER) / SLOW_MOTION;
  for (const { cylinder, junction, row, start } of diagram.primaries) {
    text.write(20, row, centimetres(sound.exhaust.lengths[cylinder]!).padStart(3), TEXT_PALETTES.WHITE);
    const since = sinceFiring(sound, phase, cylinder);
    const lit = since < FIRING_FLASH;
    const [x, y] = start;
    const bank = bankColor(scene, junction);
    for (let k = -3; k <= 3; k++) frame.fillSpan(y + k, x - 7, x - 2, lit ? white : Math.abs(k) === 3 ? bank : DIM);
    const travelled = since * seconds * pixelsPerSecond;
    for (const path of diagram.paths[cylinder]!)
      for (let trail = 0; trail < 3; trail++) {
        const at = pointAlong(path, travelled - trail * 3);
        if (!at) continue;
        const [px, py] = at.map(Math.round) as [number, number];
        for (let dx = -1; dx <= 0; dx++) {
          frame.setPixel(px + dx, py, trail === 0 ? white : lighten(GREY));
          frame.setPixel(px + dx, py - 1, trail === 0 ? white : GREY);
        }
      }
  }

  text.write(20, EXHAUST_DIAGRAM.headingRow, 'EXHAUST', TEXT_PALETTES.DARK);
  text.write(EXHAUST_DIAGRAM.formColumn, EXHAUST_DIAGRAM.headingRow, exhaustTopology(sound), TEXT_PALETTES.WHITE);
  text.write(EXHAUST_DIAGRAM.unitColumn, EXHAUST_DIAGRAM.headingRow, 'cm', TEXT_PALETTES.DARK);
  text.write(20, EXHAUST_DIAGRAM.pipeRow, 'PIPE', TEXT_PALETTES.DARK);
  text.write(
    EXHAUST_DIAGRAM.pipeColumn,
    EXHAUST_DIAGRAM.pipeRow,
    sound.exhaust.pipes.map((pipe) => centimetres(pipe.length)).join('/'),
    TEXT_PALETTES.WHITE,
  );
}

/** ENGINE: the engine's curves and values, its firing and its exhaust. */
export const ENGINE_PAGE: VehiclePage = Object.freeze({
  name: 'ENGINE',
  draw(scene: VehiclePageScene) {
    drawGraph(scene);
    writeEngine(scene);
    drawFiring(scene);
    drawExhaust(scene);
  },
});
