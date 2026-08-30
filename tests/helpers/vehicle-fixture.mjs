import {
  createArcadeVehicle,
  updateArcadeVehicle,
} from '../../dist/physics/arcade-vehicle-physics.js';
import {
  BIKE_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../../dist/physics/vehicle-profiles.js';

export {
  BIKE_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
};

export function createTestCar(
  guide,
  height,
  surfaces,
  s,
  l = 0,
  speed = 45,
  profile = FR_VEHICLE_PROFILE,
) {
  return createArcadeVehicle(profile, guide, height, surfaces, s, l, speed);
}

export function createTestBike(guide, height, surfaces, s, l = 0, speed = 45, profile = BIKE_VEHICLE_PROFILE) {
  return createArcadeVehicle(profile, guide, height, surfaces, s, l, speed);
}

export function updateTestVehicle(guide, height, surfaces, vehicle, input, dt) {
  updateArcadeVehicle(guide, height, surfaces, vehicle, input, dt);
}
