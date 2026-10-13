import { TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import { LISTING_LINE_LENGTH, listingWords } from '../vehicle/definition-document.js';
import { TEXT_ROWS } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import {
  DIM,
  GEAR_BARS,
  GEAR_COLUMNS,
  GREY,
  SIDE_VIEW,
  LISTING_COLUMNS,
  VALUE_COLUMNS,
  integer,
  millimetres,
  ratio,
  twoDecimals,
  writeValues,
  type VehiclePage,
  type VehiclePageScene,
} from './vehicle-page.js';

const GEAR_LABELS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];

/** A disc of `radius` about (`x`, `y`): a ring a pixel wide in `ring`, filled with `fill`. */
function disc(frame: SoftwareSurface, x: number, y: number, radius: number, ring: number, fill: number) {
  for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py++)
    for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
      const distance = Math.hypot(px - x, py - y);
      if (distance <= radius) frame.setPixel(px, py, distance > radius - 1.2 ? ring : fill);
    }
}

/**
 * The side view: the ground; the overall length, centred on the wheelbase as the overhangs are not held, and the
 * overall height as a dotted box; both wheels at their radii; the wheelbase as a dimension line under the ground; and
 * the centre of mass, `frontAxle` behind the front axle at `desiredCgHeight`, as a quartered disc on a dotted plumb
 * line. Row 3 heads it and each wheel's static load share stands under it on row 11.
 */
function drawSideView({ frame, text, vehicle }: VehiclePageScene) {
  const v = vehicle.compiledVehicle;
  const scale = SIDE_VIEW.pixelsPerMeter;
  const ground = SIDE_VIEW.groundY;
  const white = text.mainColor(TEXT_PALETTES.WHITE);
  const yellow = text.mainColor(TEXT_PALETTES.YELLOW);
  const dark = text.mainColor(TEXT_PALETTES.DARK);
  const wheelbase = v.frontAxle + v.rearAxle;
  const rearX = SIDE_VIEW.centreX - (wheelbase * scale) / 2;
  const frontX = SIDE_VIEW.centreX + (wheelbase * scale) / 2;
  frame.fillSpan(ground, SIDE_VIEW.left, SIDE_VIEW.right, GREY);

  const boxLeft = Math.round(SIDE_VIEW.centreX - (v.overallLength * scale) / 2);
  const boxRight = Math.round(SIDE_VIEW.centreX + (v.overallLength * scale) / 2);
  const boxTop = Math.round(ground - v.overallHeight * scale);
  for (let x = boxLeft; x <= boxRight; x += 2) frame.setPixel(x, boxTop, dark);
  for (let y = boxTop; y < ground; y += 2) {
    frame.setPixel(boxLeft, y, dark);
    frame.setPixel(boxRight, y, dark);
  }

  for (const [x, station] of [
    [rearX, v.rearStation],
    [frontX, v.frontStation],
  ] as const) {
    const radius = station.rollingRadius * scale;
    disc(frame, x, ground - radius, radius, white, DIM);
    frame.setPixel(Math.round(x), Math.round(ground - radius), white);
  }

  frame.fillSpan(ground + SIDE_VIEW.dimensionDepth, rearX, frontX, yellow);
  for (let y = ground + 1; y <= ground + SIDE_VIEW.tickDepth; y++) {
    frame.setPixel(Math.round(rearX), y, yellow);
    frame.setPixel(Math.round(frontX), y, yellow);
  }

  const cgX = Math.round(frontX - v.frontAxle * scale);
  const cgY = Math.round(ground - v.desiredCgHeight * scale);
  for (let y = cgY; y < ground; y += 2) frame.setPixel(cgX, y, yellow);
  const reach = Math.ceil(SIDE_VIEW.cgRadius);
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++)
      if (Math.hypot(dx, dy) <= SIDE_VIEW.cgRadius) frame.setPixel(cgX + dx, cgY + dy, dx * dy >= 0 ? yellow : 0);

  text.write(22, 3, 'SIDE', TEXT_PALETTES.WHITE);
  text.write(27, 3, 'CG', TEXT_PALETTES.YELLOW);
  text.write(30, 3, 'W/BASE', TEXT_PALETTES.YELLOW);
  const front = Math.round((v.rearAxle / wheelbase) * 100);
  // Each label's 4 columns centred under its wheel, moved apart evenly to keep a column between them, within the row.
  const centred = (x: number) => Math.round(x / TEXT_TILE_SIZE) - 2;
  const short = Math.max(0, centred(rearX) + 5 - centred(frontX));
  const rearColumn = Math.max(SIDE_VIEW.loadFirstColumn, centred(rearX) - Math.ceil(short / 2));
  const frontColumn = Math.min(SIDE_VIEW.loadLastColumn, centred(frontX) + Math.floor(short / 2));
  text.write(rearColumn, SIDE_VIEW.loadRow, `R${100 - front}%`, TEXT_PALETTES.WHITE);
  text.write(frontColumn, SIDE_VIEW.loadRow, `F${front}%`, TEXT_PALETTES.WHITE);
}

/** Each gear's road speed at redline (km/h), at the rolling radius of the wheels taking more than half the drive. */
function gearSpeeds(vehicle: VehiclePageScene['vehicle']) {
  const v = vehicle.compiledVehicle;
  const p = v.powertrain;
  const radius = (v.frontDriveTorqueFraction > 0.5 ? v.frontStation : v.rearStation).rollingRadius;
  const metresPerSecond = (p.redlineRpm / 60) * 2 * Math.PI * radius;
  return p.gearRatios.map((gear) => (metresPerSecond * 3.6) / (gear * p.finalDriveRatio));
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

/** A listed text in upper case as lines of at most the listing line length, joined word by word. */
function wrap(value: string): string[] {
  const lines: string[] = [];
  for (const word of listingWords(value.toUpperCase())) {
    const last = lines.length - 1;
    const joined = last < 0 ? '' : `${lines[last]!}${lines[last]!.endsWith('/') ? '' : ' '}${word}`;
    if (last >= 0 && joined.length <= LISTING_LINE_LENGTH) lines[last] = joined;
    else lines.push(word);
  }
  return lines;
}

/** The driveline: each gear's ratio and road speed at redline with its bar, the final drive and the drive, then the listing's era, market and specification. */
function writeDriveline(scene: VehiclePageScene) {
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
  row += 3;
  const { metadata } = vehicle.listing;
  const listed: [string, string][] = [];
  const list = (label: string, value: string) =>
    wrap(value).forEach((line, k) => listed.push([k === 0 ? label : '', line]));
  list('ERA', metadata.period);
  list('MKT', metadata.physicsAnchor.market);
  metadata.selectedSpecification.forEach((line, k) => list(k === 0 ? 'SPEC' : '', line));
  writeValues(text, LISTING_COLUMNS.label, row, listed.slice(0, TEXT_ROWS - row), LISTING_COLUMNS.value);
}

/** The body's values in the right column; values with a front and a rear are written `front/rear`. */
function writeBody({ text, vehicle }: VehiclePageScene) {
  const { mechanics: m, compiledVehicle: v } = vehicle;
  writeValues(text, VALUE_COLUMNS.right, VALUE_COLUMNS.firstRow, [
    ['LENGTH', millimetres(v.overallLength)],
    ['WIDTH', millimetres(v.overallWidth)],
    ['HEIGHT', millimetres(v.overallHeight)],
    ['W/BASE', millimetres(v.frontAxle + v.rearAxle)],
    ['MASS', `${integer(v.mass)}kg`],
    ['CG HT', millimetres(v.desiredCgHeight)],
    ['YAW I', `${integer(v.yawInertia)}kgm2`],
    ['PITCH I', `${integer(v.pitchInertia)}kgm2`],
    ['TIRE', `${integer(2000 * m.frontWheelRadius)}/${integer(2000 * m.rearWheelRadius)}mm`],
    ['WHL I', `${m.frontWheelInertia.toFixed(1)}/${m.rearWheelInertia.toFixed(1)}kgm2`],
    ['RIDE', `${twoDecimals(m.frontRideFrequency)}/${twoDecimals(m.rearRideFrequency)}Hz`],
    ['DAMPING', `${twoDecimals(m.frontDampingRatio)}/${twoDecimals(m.rearDampingRatio)}`],
    ['TRAVEL', `${integer(m.frontQTravel * 1000)}/${integer(m.rearQTravel * 1000)}mm`],
    ['BRAKE', `${integer(v.frontStation.maxBrakeTorque)}/${integer(v.rearStation.maxBrakeTorque)}Nm`],
    ['DRAG', `${twoDecimals(v.quadraticDrag)}kg/m`],
  ]);
}

/** CHASSIS: the side view, the driveline, the listing's era, market and specification, and the body. */
export const CHASSIS_PAGE: VehiclePage = Object.freeze({
  name: 'CHASSIS',
  draw(scene: VehiclePageScene) {
    drawSideView(scene);
    writeDriveline(scene);
    writeBody(scene);
  },
});
