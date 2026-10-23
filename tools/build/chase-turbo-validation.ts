import { mkdir, writeFile } from 'node:fs/promises';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from './node-content-store.js';
import { requireCompiled, reportError } from '../course/authoring-io.js';
import { measureRacingVehicle, measureVehicleBraking } from '../course/racing-vehicle-check.js';
import { CHASE_TURBO_PICTURES } from '../graphics/chase-turbo-shapes.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { VEHICLE_SUBSTEPS } from '../../src/vehicle/physics/vehicle-model.js';

try {
  const { definitions } = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
  const vehicles = Object.keys(CHASE_TURBO_PICTURES).map((id) => {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    if (!entry) throw new Error(`Missing vehicle ${id}`);
    const result = {
      ...measureRacingVehicle(entry, definitions.driving),
      braking100: measureVehicleBraking(entry, definitions.driving, 100),
    };
    console.log(
      JSON.stringify({ id, targets: result.targets, end: result.samples.at(-1), braking100: result.braking100.metres }),
    );
    return result;
  });
  const directory = new URL('../../dist/chase-turbo-validation/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('measurements.json', directory),
    JSON.stringify(
      {
        conditions: {
          stepSeconds: SIM_DT,
          physicsSubsteps: VEHICLE_SUBSTEPS,
          accelerationSeconds: 240,
          straightMetres: 60000,
          slope: 0,
          wind: 0,
          otherActors: 0,
          surface: 'ASPHALT',
          gripFactor: 1,
          rollingResistance: 0.014,
          acceleration:
            'Full throttle from rest at 100 m; fixed authored mass; unchanged automatic shifts and assistance.',
          braking:
            'Release throttle and request full brake after the acceleration run; stop below 0.1 m/s or after 30 s.',
          braking100:
            'Fresh vehicle rolling at 100 km/h; initial controls released, then full brake through existing actuator rates.',
          restart: 'Full throttle for 8 s after stopping.',
          cornering: 'Fresh vehicle at 25 m/s; 12 s, throttle 0.3, steering 0.25*sin(time), front steering rule 0.8.',
          terminalRangeKph:
            'Observed final ten seconds of a fixed 240 s run; not a guaranteed equilibrium or real-car top speed.',
        },
        vehicles,
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  reportError(error);
}
