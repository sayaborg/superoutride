import { halveRgb555 } from '../image/rgb555.js';
import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import {
  createExhaustDiagram,
  crossSection,
  exhaustCollectors,
  exhaustTopology,
  tubeThickness,
  type DiagramBox,
  type DiagramPoint,
  type ExhaustDiagram,
} from '../view/exhaust-diagram.js';
import type { EngineSound } from '../audio/engine-sound.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import {
  BANK_PALETTES,
  DIM,
  ENGINE_SPEED_LINE,
  EXHAUST_DIAGRAM,
  FIRING_FLASH,
  FIRING_STRIP,
  GRAPH,
  GREY,
  SLOW_MOTION,
  VALUE_COLUMNS,
  drawGraphGrid,
  drawGraphLine,
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
 * fuel-cut entry; over them, the free-revving engine's speed from 20 % of redline as a WHITE upright line with a mark
 * in each curve's color where it crosses it.
 */
function drawGraph(scene: VehiclePageScene) {
  const { frame, text, vehicle, fuelCutEnterRedlineRatio } = scene;
  const powertrain = vehicle.compiledVehicle.powertrain;
  const redline = powertrain.redlineRpm;
  const height = GRAPH.bottom - GRAPH.top;
  const xOf = (rpm: number) => GRAPH.left + (rpm / redline - GRAPH.firstRedline) * GRAPH.pixelsPerRedline;
  const rpmOf = (x: number) => (GRAPH.firstRedline + (x - GRAPH.left) / GRAPH.pixelsPerRedline) * redline;
  drawGraphGrid(scene);
  const redlineX = Math.round(xOf(redline));
  for (let y = GRAPH.top; y < GRAPH.bottom; y += 2) frame.setPixel(redlineX, y, text.mainColor(TEXT_PALETTES.RED));

  const peaks = enginePeaks(vehicle);
  const first = Math.ceil(xOf(Math.max(powertrain.idleRpm, GRAPH.firstRedline * redline)));
  const last = Math.min(GRAPH.right, Math.floor(xOf(fuelCutRpm(redline, fuelCutEnterRedlineRatio))));
  const curve = (share: (rpm: number) => number, color: number) =>
    drawGraphLine(frame, first, last, (x) => GRAPH.bottom - Math.round(share(rpmOf(x)) * height), color);
  const peakPower = peaks.power * 1000;
  const red = text.mainColor(TEXT_PALETTES.RED);
  const yellow = text.mainColor(TEXT_PALETTES.YELLOW);
  const powerShare = (rpm: number) => (sampleEngineTorque(powertrain, rpm) * rpm * 2 * Math.PI) / 60 / peakPower;
  const torqueShare = (rpm: number) => sampleEngineTorque(powertrain, rpm) / peaks.torque;
  curve(powerShare, red);
  curve(torqueShare, yellow);

  // The free-revving engine's speed: a WHITE upright line where it stands on the axis, with a mark on each curve.
  const rpm = scene.engineRpm;
  if (rpm !== null && rpm >= GRAPH.firstRedline * redline) {
    const x = Math.round(xOf(rpm));
    if (x <= GRAPH.right) {
      for (let y = GRAPH.top; y <= GRAPH.bottom; y++) frame.setPixel(x, y, text.mainColor(TEXT_PALETTES.WHITE));
      const r = ENGINE_SPEED_LINE.markRadius;
      for (const [share, color] of [
        [powerShare, red],
        [torqueShare, yellow],
      ] as const) {
        const y = GRAPH.bottom - Math.round(share(rpm) * height);
        for (let row = y - r; row <= y + r; row++) frame.fillSpan(row, x - r, x + r, color);
      }
    }
  }
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

/** A bank's color: its collector's palette in turn (`exhaustCollectors`). */
const bankColor = ({ text }: VehiclePageScene, collector: number) =>
  text.mainColor(BANK_PALETTES[collector % BANK_PALETTES.length]!);

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
  const collectors = exhaustCollectors(sound);
  frame.fillSpan(strip.bottom, strip.left, strip.right, GREY);
  for (let degree = 0; degree <= degrees; degree += strip.tickDegrees) {
    const x = Math.round(strip.left + (degree / degrees) * width);
    for (let y = strip.bottom; y <= strip.bottom + 2; y++) frame.setPixel(x, y, GREY);
  }
  sound.firingPhases.forEach((firing, cylinder) => {
    const x = Math.round(strip.left + firing * width);
    const lit = sinceFiring(sound, phase, cylinder) < FIRING_FLASH;
    const color = lit ? white : bankColor(scene, collectors.get(sound.exhaust.primaries[cylinder]!.to)!);
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

/**
 * The pixels of one level or upright piece of a tube `thickness` pixels across, its cross-section about its line
 * (`crossSection`). An end that `joins` a bar or another piece reaches past its point by that side's part of the
 * cross-section, so it ends inside what it joins; a valve's or open end's does not.
 */
function tubeBox(
  [[x0, y0], [x1, y1]]: readonly [DiagramPoint, DiagramPoint],
  thickness: number,
  joins: readonly [boolean, boolean],
): DiagramBox {
  const { low, high } = crossSection(thickness);
  const [lowJoins, highJoins] = x1 > x0 || y1 > y0 ? joins : [joins[1], joins[0]];
  return y0 === y1
    ? [Math.min(x0, x1) - (lowJoins ? low : 0), y0 - low, Math.max(x0, x1) + (highJoins ? high : 0), y0 + high]
    : [x0 - low, Math.min(y0, y1) - (lowJoins ? low : 0), x0 + high, Math.max(y0, y1) + (highJoins ? high : 0)];
}

/**
 * Boxes painted flat in their colors, later over earlier, then shaded once as one shape whatever their colors: a
 * pixel that tops a vertical run of 3 or more painted pixels, or ends a horizontal run of 3 or more on the left and
 * does not end a vertical one at the bottom, is lit halfway to white; one that ends a vertical run at the bottom, or a
 * horizontal run on the right and does not top a vertical one, is at half brightness; lit wins over both.
 */
function drawShaded(frame: SoftwareSurface, shapes: readonly { readonly box: DiagramBox; readonly color: number }[]) {
  const left = Math.min(...shapes.map(({ box }) => box[0])),
    top = Math.min(...shapes.map(({ box }) => box[1]));
  const width = Math.max(...shapes.map(({ box }) => box[2])) - left + 1,
    height = Math.max(...shapes.map(({ box }) => box[3])) - top + 1;
  const paint = new Int32Array(width * height).fill(-1);
  for (const { box, color } of shapes)
    for (let y = box[1]; y <= box[3]; y++)
      paint.fill(color, (y - top) * width + box[0] - left, (y - top) * width + box[2] - left + 1);
  const painted = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height && paint[y * width + x]! >= 0;
  // Each painted pixel's run length down its column and along its row.
  const vertical = new Int32Array(width * height),
    horizontal = new Int32Array(width * height);
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height;) {
      let end = y;
      while (painted(x, end)) end++;
      for (let k = y; k < end; k++) vertical[k * width + x] = end - y;
      y = Math.max(end, y + 1);
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width;) {
      let end = x;
      while (painted(end, y)) end++;
      horizontal.fill(end - x, y * width + x, y * width + end);
      x = Math.max(end, x + 1);
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const color = paint[y * width + x]!;
      if (color < 0) continue;
      const column = vertical[y * width + x]! >= 3,
        row = horizontal[y * width + x]! >= 3;
      const topEnd = column && !painted(x, y - 1),
        bottomEnd = column && !painted(x, y + 1);
      const lit = topEnd || (row && !painted(x - 1, y) && !bottomEnd);
      const shaded = bottomEnd || (row && !painted(x + 1, y) && !topEnd);
      frame.setPixel(left + x, top + y, lit ? lighten(color) : shaded ? halveRgb555(color) : color);
    }
}

const diagrams = new WeakMap<EngineSound, { readonly scale: number; readonly diagram: ExhaustDiagram }>();
/** A sound's exhaust diagram at `pixelsPerMeter`, made once for each sound. */
function exhaustDiagramOf(sound: EngineSound, pixelsPerMeter: number): ExhaustDiagram {
  const made = diagrams.get(sound);
  if (made?.scale === pixelsPerMeter) return made.diagram;
  const diagram = createExhaustDiagram(sound, {
    left: EXHAUST_DIAGRAM.left,
    firstRow: EXHAUST_DIAGRAM.firstRow,
    rowHeight: TEXT_TILE_SIZE,
    pixelsPerMeter,
    pixelsAcrossPerMeter: EXHAUST_DIAGRAM.pixelsAcrossPerMeter,
    gap: EXHAUST_DIAGRAM.gap,
  });
  diagrams.set(sound, { scale: pixelsPerMeter, diagram });
  return diagram;
}

/**
 * The exhaust: its form; each primary's length (cm) and diameter (mm); the tubes true to their lengths and in proportion
 * to their diameters at the catalog's one scale and the junctions' bars, shaded as one shape (`drawShaded`): primaries
 * and collectors' bars in their bank's color and the rest grey; each cylinder a block before its valve that is lit
 * WHITE for `FIRING_FLASH` of a cycle after it fires; the valve's diameter and open crank angle; and the scale marks, a
 * metre and a 50 mm pipe.
 */
function drawExhaust(scene: VehiclePageScene) {
  const { frame, text, vehicle, exhaustPixelsPerMeter } = scene;
  const sound = vehicle.sound;
  const diagram = exhaustDiagramOf(sound, exhaustPixelsPerMeter);
  const phase = cyclePhase(scene);
  const white = text.mainColor(TEXT_PALETTES.WHITE);
  const layout = EXHAUST_DIAGRAM;

  // Every drawn pixel box, so the pipes' values stand only in text cells nothing is drawn in.
  const boxes: DiagramBox[] = [];
  const shapes: { box: DiagramBox; color: number }[] = [];
  const levels = new Map<number, DiagramBox>();
  for (const tube of diagram.tubes) {
    const { points, thickness } = tube;
    const color = tube.kind === 'primary' ? bankColor(scene, tube.collector) : GREY;
    // Pieces of no length draw nothing; a valve begins a primary and an open end ends an open pipe.
    const pieces = points.slice(1).flatMap((point, k) => {
      const from = points[k]!;
      return from[0] === point[0] && from[1] === point[1] ? [] : [{ from, to: point, k }];
    });
    pieces.forEach(({ from, to, k }, n) => {
      const level = from[1] === to[1];
      const box = tubeBox([from, to], thickness, [
        !(k === 0 && tube.kind === 'primary'),
        !(n === pieces.length - 1 && tube.kind === 'pipe' && tube.open),
      ]);
      shapes.push({ box, color });
      // A pipe's value stands by its longest level piece.
      const known = tube.kind === 'pipe' ? levels.get(tube.pipe) : undefined;
      if (tube.kind === 'pipe' && level && (!known || box[2] - box[0] > known[2] - known[0]))
        levels.set(tube.pipe, box);
    });
  }
  for (const { box, collector } of diagram.bars)
    shapes.push({ box, color: collector === null ? GREY : bankColor(scene, collector) });
  drawShaded(frame, shapes);
  boxes.push(...shapes.map(({ box }) => box));

  for (const { cylinder, collector, row, valve } of diagram.primaries) {
    const { length, diameter } = sound.exhaust.primaries[cylinder]!;
    text.write(layout.lengthColumn, row, integer(length * 100).padStart(3), TEXT_PALETTES.WHITE);
    text.write(layout.diameterColumn, row, integer(diameter * 1000).padStart(3), TEXT_PALETTES.WHITE);
    const lit = sinceFiring(sound, phase, cylinder) < FIRING_FLASH;
    const [x, y] = valve;
    const bank = bankColor(scene, collector);
    for (let k = -3; k <= 3; k++) frame.fillSpan(y + k, x - 7, x - 2, lit ? white : Math.abs(k) === 3 ? bank : DIM);
    boxes.push([x - 7, y - 3, x - 2, y + 3]);
  }

  // Each pipe's length (cm) and diameter (mm), longest first, in the text row above or else below the rows of its longest
  // level piece, over that piece and as near its centre as cells holding nothing drawn or written allow; a pipe with no
  // such place has none.
  const cell = TEXT_TILE_SIZE;
  const taken = new Set<string>();
  // Written text keeps a cell clear after it: the legend's and each primary's values.
  const written = (column: number, row: number, length: number) => {
    for (let k = 0; k <= length; k++) taken.add(`${column + k},${row}`);
  };
  written(layout.lengthColumn, layout.legendRow, layout.diameterColumn + 3 - layout.lengthColumn);
  for (const { row } of diagram.primaries)
    written(layout.lengthColumn, row, layout.diameterColumn + 3 - layout.lengthColumn);
  for (const [left, top, right, bottom] of boxes)
    for (let row = Math.floor((top - 1) / cell); row <= Math.floor((bottom + 1) / cell); row++)
      for (let column = Math.floor((left - 1) / cell); column <= Math.floor((right + 1) / cell); column++)
        taken.add(`${column},${row}`);
  const pipes = sound.exhaust.pipes
    .map((pipe, index) => ({ pipe, box: levels.get(index) }))
    .filter((entry): entry is { pipe: (typeof sound.exhaust.pipes)[number]; box: DiagramBox } => !!entry.box)
    .sort((a, b) => b.pipe.length - a.pipe.length);
  for (const { pipe, box } of pipes) {
    const value = `${integer(pipe.length * 100)}/${integer(pipe.diameter * 1000)}`;
    // Starts that keep the value over its piece and inside the columns, nearest the centred one first.
    const centred = Math.round((box[0] + box[2]) / 2 / cell - value.length / 2);
    const lowest = Math.max(layout.pipeFirstColumn, Math.floor(box[0] / cell) - value.length + 1);
    const highest = Math.min(layout.pipeLastColumn - value.length + 1, Math.floor(box[2] / cell));
    const starts = Array.from({ length: Math.max(0, highest - lowest + 1) }, (_, k) => lowest + k).sort(
      (a, b) => Math.abs(a - centred) - Math.abs(b - centred) || a - b,
    );
    const place = [Math.floor(box[1] / cell) - 1, Math.floor(box[3] / cell) + 1]
      .filter((row) => row >= layout.legendRow && row < layout.valveRow)
      .flatMap((row) => starts.map((column) => ({ row, column })))
      .find(({ row, column }) =>
        Array.from({ length: value.length }, (_, k) => `${column + k},${row}`).every((key) => !taken.has(key)),
      );
    if (!place) continue;
    text.write(place.column, place.row, value, TEXT_PALETTES.DARK);
    written(place.column, place.row, value.length);
  }

  text.write(20, layout.headingRow, 'EXHAUST', TEXT_PALETTES.DARK);
  text.write(layout.formColumn, layout.headingRow, exhaustTopology(sound), TEXT_PALETTES.WHITE);
  text.write(layout.lengthColumn + 1, layout.legendRow, 'cm', TEXT_PALETTES.DARK);
  text.write(layout.diameterColumn + 1, layout.legendRow, 'mm', TEXT_PALETTES.DARK);
  const { valve } = sound.exhaust;
  text.write(20, layout.valveRow, 'VALVE', TEXT_PALETTES.DARK);
  text.write(
    26,
    layout.valveRow,
    `${(valve.diameter * 1000).toFixed(1)}mm ${integer(valve.open * sound.cycleRevolutions * 360)}DEG`,
    TEXT_PALETTES.WHITE,
  );

  // The scale marks: a metre as a WHITE line with end ticks, and a 50 mm pipe a metre long.
  const middle = layout.scaleRow * TEXT_TILE_SIZE + TEXT_TILE_SIZE / 2;
  text.write(20, layout.scaleRow, '1m', TEXT_PALETTES.DARK);
  const barLeft = 23 * TEXT_TILE_SIZE;
  frame.fillSpan(middle, barLeft, barLeft + exhaustPixelsPerMeter, white);
  for (const x of [barLeft, barLeft + exhaustPixelsPerMeter])
    for (let y = middle - 2; y <= middle + 2; y++) frame.setPixel(x, y, white);
  text.write(28, layout.scaleRow, '50mm', TEXT_PALETTES.DARK);
  const sampleLeft = 33 * TEXT_TILE_SIZE;
  const sample = tubeBox(
    [
      [sampleLeft, middle],
      [sampleLeft + exhaustPixelsPerMeter, middle],
    ],
    tubeThickness(0.05, layout.pixelsAcrossPerMeter),
    [false, false],
  );
  drawShaded(frame, [{ box: sample, color: GREY }]);
}

/** ENGINE: the engine's curves and values, its firing and its exhaust. */
export const ENGINE_PAGE: VehiclePage = Object.freeze({
  name: 'ENGINE',
  revs: true,
  draw(scene: VehiclePageScene) {
    drawGraph(scene);
    writeEngine(scene);
    drawFiring(scene);
    drawExhaust(scene);
  },
});
