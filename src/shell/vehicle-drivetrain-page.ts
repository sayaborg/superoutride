import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import {
  DIM,
  GEAR_BARS,
  GEAR_COLUMNS,
  GRAPH,
  VALUE_COLUMNS,
  drawGraphGrid,
  drawGraphLine,
  integer,
  ratio,
  writeValues,
  type VehiclePage,
  type VehiclePageScene,
} from './vehicle-page.js';

const GEAR_LABELS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];

/** Each gear's road speed at redline (km/h), at the rolling radius of the wheels taking more than half the drive. */
function gearSpeeds(vehicle: VehiclePageScene['vehicle']) {
  const v = vehicle.compiledVehicle;
  const p = v.powertrain;
  const radius = (v.frontDriveTorqueFraction > 0.5 ? v.frontStation : v.rearStation).rollingRadius;
  const metresPerSecond = (p.redlineRpm / 60) * 2 * Math.PI * radius;
  return p.gearRatios.map((gear) => (metresPerSecond * 3.6) / (gear * p.finalDriveRatio));
}

/**
 * The speed graph: the grid, the redline dashed RED on the top grid line, and each gear's engine speed, in proportion
 * to road speed, from 0 to its speed at redline: DIM up to the previous gear's speed at redline and YELLOW from there,
 * and an upright YELLOW line down to the next gear's engine speed, a saw tooth over the gears. The top gear's speed at
 * redline stands on the right edge.
 */
function drawSpeedGraph(scene: VehiclePageScene) {
  const { frame, text, vehicle } = scene;
  const ratios = vehicle.compiledVehicle.powertrain.gearRatios;
  const speeds = gearSpeeds(vehicle);
  const height = GRAPH.bottom - GRAPH.top;
  const xOf = (kmh: number) => GRAPH.left + (kmh / speeds[speeds.length - 1]!) * (GRAPH.right - GRAPH.left);
  drawGraphGrid(scene);
  for (let x = GRAPH.left; x <= GRAPH.right; x += 2) frame.setPixel(x, GRAPH.top, text.mainColor(TEXT_PALETTES.RED));

  const yellow = text.mainColor(TEXT_PALETTES.YELLOW);
  // A gear's engine speed reaches redline at its own speed at redline.
  const line = (gear: number, from: number, to: number, color: number) =>
    drawGraphLine(
      frame,
      Math.round(xOf(from)),
      Math.round(xOf(to)),
      (x) => GRAPH.bottom - ((x - GRAPH.left) / (xOf(speeds[gear]!) - GRAPH.left)) * height,
      color,
    );
  speeds.forEach((_, gear) => gear > 0 && line(gear, 0, speeds[gear - 1]!, DIM));
  speeds.forEach((speed, gear) => {
    line(gear, gear === 0 ? 0 : speeds[gear - 1]!, speed, yellow);
    const next = ratios[gear + 1];
    if (next === undefined) return;
    const x = Math.round(xOf(speed));
    for (let y = GRAPH.top; y <= GRAPH.bottom - Math.round((next / ratios[gear]!) * height); y++)
      frame.setPixel(x, y, yellow);
  });
  text.write(22, 3, 'GEARS', TEXT_PALETTES.YELLOW);
}

/** A gear's bar on text row `row`: DIM to the previous gear's speed at redline, YELLOW on to its own. */
function drawGearBar({ frame, text }: VehiclePageScene, row: number, from: number, to: number) {
  const scale = (GEAR_BARS.right - GEAR_BARS.left) / GEAR_BARS.kmh;
  const x = (kmh: number) => GEAR_BARS.left + Math.min(GEAR_BARS.kmh, kmh) * scale;
  for (let y = row * TEXT_TILE_SIZE + GEAR_BARS.top; y <= row * TEXT_TILE_SIZE + GEAR_BARS.bottom; y++) {
    frame.fillSpan(y, GEAR_BARS.left, x(from), DIM);
    frame.fillSpan(y, x(from), x(to), text.mainColor(TEXT_PALETTES.YELLOW));
  }
}

/** The gears: each gear's ratio and road speed at redline with its bar, then the final drive and the drive. */
function writeGears(scene: VehiclePageScene) {
  const { text, vehicle } = scene;
  const v = vehicle.compiledVehicle;
  const p = v.powertrain;
  const f = v.frontDriveTorqueFraction;
  const front = Math.round(f * 100);
  let row = VALUE_COLUMNS.firstRow;
  text.write(GEAR_COLUMNS.label, row, 'GEAR', TEXT_PALETTES.DARK);
  text.write(GEAR_COLUMNS.ratioHeading, row, 'RATIO', TEXT_PALETTES.DARK);
  text.write(GEAR_COLUMNS.kmh, row, 'KMH', TEXT_PALETTES.DARK);
  row++;
  const speeds = gearSpeeds(vehicle);
  p.gearRatios.forEach((gear, i) => {
    text.write(GEAR_COLUMNS.label, row + i, GEAR_LABELS[i]!, TEXT_PALETTES.DARK);
    text.write(GEAR_COLUMNS.ratio, row + i, ratio(gear), TEXT_PALETTES.WHITE);
    drawGearBar(scene, row + i, i === 0 ? 0 : speeds[i - 1]!, speeds[i]!);
    text.write(GEAR_COLUMNS.kmh, row + i, integer(speeds[i]!).padStart(3), TEXT_PALETTES.WHITE);
  });
  row += p.gearRatios.length;
  writeValues(text, VALUE_COLUMNS.left, row, [
    ['FINAL', ratio(p.finalDriveRatio)],
    ['DRIVE', f === 0 ? 'RWD' : f === 1 ? 'FWD' : `AWD ${front}/${100 - front}`],
  ]);
}

/** The wheels' values in the right column, written `front/rear`. */
function writeWheels({ text, vehicle }: VehiclePageScene) {
  const m = vehicle.mechanics;
  writeValues(text, VALUE_COLUMNS.right, VALUE_COLUMNS.firstRow, [
    ['TIRE', `${integer(2000 * m.frontWheelRadius)}/${integer(2000 * m.rearWheelRadius)}mm`],
    ['WHL I', `${m.frontWheelInertia.toFixed(1)}/${m.rearWheelInertia.toFixed(1)}kgm2`],
  ]);
}

/** DRIVETRAIN: the gears' speed graph, the gears, the final drive and the drive, and the wheels. */
export const DRIVETRAIN_PAGE: VehiclePage = Object.freeze({
  name: 'DRIVETRAIN',
  revs: false,
  draw(scene: VehiclePageScene) {
    drawSpeedGraph(scene);
    writeGears(scene);
    writeWheels(scene);
  },
});
