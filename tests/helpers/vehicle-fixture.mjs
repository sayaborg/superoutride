import {
  createArcadeVehicle,
  updateArcadeVehicle,
} from '../../dist/physics/arcade-vehicle-physics.js';
import {
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  HONDA_VFR750R_VEHICLE_PROFILE,
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
  CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
} from '../../dist/physics/vehicle-profiles.js';

export {
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  HONDA_VFR750R_VEHICLE_PROFILE,
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
  CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE,
  compileArcadeVehicleProfile,
};

export function createTestCar(
  guide,
  height,
  surfaces,
  s,
  l = 0,
  speed = 45,
  profile = FERRARI_TESTAROSSA_VEHICLE_PROFILE,
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
  profile = HONDA_VFR750R_VEHICLE_PROFILE,
) {
  return createArcadeVehicle(profile, guide, height, surfaces, s, l, speed);
}

export function updateTestVehicle(guide, height, surfaces, vehicle, input, dt) {
  updateArcadeVehicle(guide, height, surfaces, vehicle, input, dt);
}
