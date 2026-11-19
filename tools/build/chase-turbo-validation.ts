import { mkdir, writeFile } from 'node:fs/promises';
import { compileContent } from '../authoring/compile-content.js';
import { createNodeContentStore } from './node-content-store.js';
import { requireCompiled, reportError } from '../course/authoring-io.js';
import { measureRacingVehicle, measureVehicleBraking } from '../course/racing-vehicle-check.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { VEHICLE_SUBSTEPS } from '../../src/vehicle/physics/vehicle-model.js';

/**
 * The fourteen vehicles the [ledger](../../docs/chase-turbo-vehicles.md) validates, in its order: those with procedural
 * pictures, and the Porsche 959 of 1987 and the 928 S4 of 1987, whose pictures are baked from models.
 */
const CHASE_TURBO_VEHICLE_IDS = Object.freeze([
  'PORSCHE_928_S4_1987',
  'TURBO_ESPRIT_1984',
  'COUNTACH_5000_QV_1988',
  '911_TURBO_3_3_1986',
  'FERRARI_GTO_1985',
  'PORSCHE_928_S_1984',
  'TOYOTA_PICKUP_1980',
  'FERRARI_F40_1988',
  'PORSCHE_959_1987',
  'CORVETTE_C4_1984',
  'AUSTIN_MINI_850_1964',
  'WRANGLER_YJ_1995',
  'NOVA_250_1977',
  'NOVA_9C1_1977',
]);

try {
  const { definitions } = requireCompiled(await compileContent(createNodeContentStore(), { measured: false }));
  const vehicles = CHASE_TURBO_VEHICLE_IDS.map((id) => {
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
