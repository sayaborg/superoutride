import {
  createArcadeVehicle,
  updateArcadeVehicle,
} from '../../dist/physics/arcade-vehicle-physics.js';
import {
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../../dist/physics/vehicle-profiles.js';

export {
  AWD_VEHICLE_PROFILE,
  BIKE1_VEHICLE_PROFILE,
  BIKE2_VEHICLE_PROFILE,
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

export function createTestBike(
  guide,
  height,
  surfaces,
  s,
  l = 0,
  speed = 45,
  profile = BIKE1_VEHICLE_PROFILE,
) {
  return createArcadeVehicle(profile, guide, height, surfaces, s, l, speed);
}

export function updateTestVehicle(guide, height, surfaces, vehicle, input, dt) {
  updateArcadeVehicle(guide, height, surfaces, vehicle, input, dt);
}
