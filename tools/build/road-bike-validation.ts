import { mkdir, writeFile } from 'node:fs/promises';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from './node-content-store.js';
import { requireCompiled, reportError } from '../course/authoring-io.js';
import { measureRacingVehicle, measureVehicleBraking } from '../course/racing-vehicle-check.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { VEHICLE_SUBSTEPS } from '../../src/vehicle/physics/vehicle-model.js';

const ids = ['CB900F_1981', 'GSX1100SZ', 'GPZ900R_A1', 'GSX_R750_1985', 'VMAX1200_1985'];

try {
  const { definitions } = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
  const vehicles = ids.map((id) => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    if (!entry) throw new Error(`The admitted vehicle catalog is missing ${id}`);
    const result = measureRacingVehicle(entry, definitions.driving);
    const { terminalRangeKph: finalTenSecondsRangeKph, ...observed } = result;
    const end = result.samples.at(-1)!;
    const recent = result.samples.filter((sample) => sample.time >= result.seconds - 10);
    const p = entry.compiledVehicle.powertrain;
    const measurement = {
      ...observed,
      accelerationEnd: {
        reason: 'fixed-duration',
        time: end.time,
        distance: end.distance,
        kph: end.kph,
        rpm: end.rpm,
        gear: end.gear,
        acceleration: end.acceleration,
        finalTenSecondsRangeKph,
        settled:
          finalTenSecondsRangeKph[1]! - finalTenSecondsRangeKph[0]! < 0.1 &&
          recent.every((sample) => Math.abs(sample.acceleration) < 0.01),
        sampledFuelCut: recent.some((sample) => sample.fuelCut),
      },
      gearing: p.gearRatios.map((ratio, index) => ({
        gear: index + 1,
        ratio,
        totalReduction: ratio * p.finalDriveRatio,
        redlineKph: result.redlineKph[index],
        nominalPostUpshiftRpm:
          index + 1 < p.gearRatios.length ? (p.redlineRpm * p.gearRatios[index + 1]!) / ratio : null,
      })),
      braking100: measureVehicleBraking(entry, definitions.driving, 100),
    };
    console.log(
      JSON.stringify({
        id,
        end: measurement.accelerationEnd,
        braking100: {
          seconds: measurement.braking100.seconds,
          metres: measurement.braking100.metres,
          endKph: measurement.braking100.endKph,
        },
      }),
    );
    return measurement;
  });
  const report = {
    conditions: {
      straightMetres: 60000,
      initialPositionMetres: 100,
      initialKph: 0,
      accelerationSeconds: 240,
      accelerationThrottle: 1,
      slope: 0,
      wind: 0,
      otherActors: 0,
      surface: 'ASPHALT',
      gripFactor: 1,
      rollingResistance: 0.014,
      stepSeconds: SIM_DT,
      physicsSubsteps: VEHICLE_SUBSTEPS,
      braking:
        'After full-throttle acceleration, request throttle 0 and brake 1 through existing actuator rates; stop below 0.1 m/s or after 30 s. No reaction-time delay.',
      braking100:
        'A fresh vehicle starts rolling at exactly 100 km/h with controls initially released and the standard initial gear and engine state; request throttle 0 and brake 1 through existing actuator rates.',
      restart: 'Full throttle for 8 s after the acceleration-run braking stop.',
      cornering: 'Fresh vehicle at 25 m/s; 12 s, throttle 0.3, steering 0.25*sin(time), front steering rule 0.8.',
      aids: 'Unchanged automatic shifts, launch assistance, wheel-slip and pitch protection; fixed authored mass.',
      settledCriterion:
        'Final 10 s range below 0.1 km/h and every 1 s acceleration sample below 0.01 m/s² in magnitude.',
    },
    vehicles,
  };
  const directory = new URL('../../dist/road-bike-validation/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('measurements.json', directory), JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  reportError(error);
}
