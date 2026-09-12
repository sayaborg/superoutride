import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from '../../dist/browser/steering-calibration-selection.js';
import { arcadeBodyKinematics, createArcadeVehicle } from '../../dist/physics/arcade-vehicle-physics.js';
import { deriveContactObservation } from '../../dist/physics/vehicle-dynamics.js';

/** Shared browser steering inputs; each diagnostic still owns its world and experiment parameters. */
export function createProbeVehicle(profile, world, options) {
  const rate = DEFAULT_BROWSER_STEERING_RESPONSE_RATE;
  return createArcadeVehicle(profile, world, {
    ...options,
    steeringCalibration: options.steeringCalibration ?? {
      maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
      steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
      steeringActuatorResponse: { applyRate: rate, releaseRate: rate },
    },
  });
}

/** Fresh outer-tick contacts, never a second integration or a previous-substep force ledger. */
export function observeProbeContacts({ vehicle, guide, height, surface }) {
  const body = arcadeBodyKinematics(vehicle);
  const contact = (station, steer) =>
    deriveContactObservation(guide, height, surface, body, station, steer, vehicle.course.segmentIndex);
  return {
    body,
    front: contact(vehicle.profile.frontStation, vehicle.frontSteerAngle),
    rear: contact(vehicle.profile.rearStation, 0),
  };
}

export function runProbeCli(url, main) {
  if (process.argv[1] && url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}
