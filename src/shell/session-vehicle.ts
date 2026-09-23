import type { SessionVehicle } from '../race/session-configuration.js';
import type { VehicleCatalogEntry } from '../vehicle/vehicle-catalog.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from './tire-friction-selection.js';
import {
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
} from './steering-calibration-selection.js';

/** One product starting calibration, shared by the browser and offline reference runner. */
export function browserSessionVehicle(entry: VehicleCatalogEntry): SessionVehicle {
  const rate = DEFAULT_BROWSER_STEERING_RESPONSE_RATE;
  return Object.freeze({
    profile: entry.profile,
    torqueProtection: entry.torqueProtection,
    kind: entry.visualFamily === 'CAR' ? 'car' : 'bike',
    steeringCalibration: Object.freeze({
      maxRoadWheelSteer: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
      steeringOffsetMax: DEFAULT_BROWSER_STEERING_OFFSET,
      steeringActuatorResponse: Object.freeze({ applyRate: rate, releaseRate: rate }),
    }),
    tireFrictionCalibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
  });
}
