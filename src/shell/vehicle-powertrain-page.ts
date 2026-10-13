import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { fuelCutRpm, sampleEngineTorque } from '../vehicle/physics/automatic-powertrain.js';
import {
  GRAPH,
  GREY,
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
 * The graph: DARK grid lines, lighter axes, and the torque (YELLOW) and power (RED) curves, each scaled so its maximum
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

/** POWERTRAIN: the engine's curves and values. */
export const POWERTRAIN_PAGE: VehiclePage = Object.freeze({
  name: 'POWERTRAIN',
  draw(scene: VehiclePageScene) {
    drawGraph(scene);
    writeEngine(scene);
  },
});
