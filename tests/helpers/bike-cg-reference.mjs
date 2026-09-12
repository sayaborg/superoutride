// Fixed high-CG inputs preserve the original causal regressions independently of product defaults.
import { compileArcadeVehicleProfile } from '../../dist/physics/vehicle-profiles.js';
import {
  HONDA_VFR750R_VEHICLE_AUTHORING,
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_AUTHORING,
  HARLEY_DAVIDSON_FXRT_VEHICLE_AUTHORING,
  VESPA_PX200E_ARCOBALENO_VEHICLE_AUTHORING,
} from '../../dist/vehicle/production-vehicle-profiles.js';
const seeds = [
  HONDA_VFR750R_VEHICLE_AUTHORING,
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_AUTHORING,
  HARLEY_DAVIDSON_FXRT_VEHICLE_AUTHORING,
  VESPA_PX200E_ARCOBALENO_VEHICLE_AUTHORING,
];
const heights = Object.freeze({
  VFR750R: 0.72,
  R80_GS_PARIS_DAKAR: 0.82,
  FXRT_SPORT_GLIDE: 0.68,
  PX200E_ARCOBALENO: 0.67,
});
export function withHighBikeCg(profile) {
  if (!(profile.id in heights)) return profile;
  const seed = seeds.find((value) => value.id === profile.id);
  return compileArcadeVehicleProfile({ ...seed, desiredCgHeight: heights[profile.id] });
}
export function withHighBikeCgEntry(entry) {
  return { ...entry, profile: withHighBikeCg(entry.profile) };
}
