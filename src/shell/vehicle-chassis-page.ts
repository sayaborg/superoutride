import { TEXT_PALETTES } from '../image/text-tiles.js';
import { LISTING_LINE_LENGTH, listingWords } from '../vehicle/definition-document.js';
import { TEXT_ROWS } from '../view/text-layer.js';
import {
  GEAR_COLUMNS,
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

/** The driveline: each gear's ratio, the final drive and the drive, then the listing's era, market and specification. */
function writeDriveline({ text, vehicle }: VehiclePageScene) {
  const v = vehicle.compiledVehicle;
  const p = v.powertrain;
  const f = v.frontDriveTorqueFraction;
  const front = Math.round(f * 100);
  let row = VALUE_COLUMNS.firstRow;
  text.write(GEAR_COLUMNS.label, row, 'GEAR', TEXT_PALETTES.DARK);
  text.write(GEAR_COLUMNS.ratioHeading, row, 'RATIO', TEXT_PALETTES.DARK);
  row++;
  p.gearRatios.forEach((gear, i) => {
    text.write(GEAR_COLUMNS.label, row + i, GEAR_LABELS[i]!, TEXT_PALETTES.DARK);
    text.write(GEAR_COLUMNS.ratio, row + i, ratio(gear), TEXT_PALETTES.WHITE);
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

/** CHASSIS: the driveline, the listing's era, market and specification, and the body. */
export const CHASSIS_PAGE: VehiclePage = Object.freeze({
  name: 'CHASSIS',
  draw(scene: VehiclePageScene) {
    writeDriveline(scene);
    writeBody(scene);
  },
});
