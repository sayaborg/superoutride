// Fixed high-CG inputs preserve the original causal regressions independently of product defaults.
import { compileArcadeVehicleProfile } from '../../dist/physics/vehicle-profiles.js';
import * as seeds from '../../dist/vehicle/production-vehicle-profiles.js';
const heights = Object.freeze({
  VFR750R: 0.72,
  R80_GS_PARIS_DAKAR: 0.82,
  FXRT_SPORT_GLIDE: 0.68,
  PX200E_ARCOBALENO: 0.67,
});
export function withHighBikeCg(profile) {
  if (!(profile.id in heights)) return profile;
  const seed = Object.entries(seeds).find(([key, value]) => key.endsWith('_AUTHORING') && value.id === profile.id)[1];
  return compileArcadeVehicleProfile({ ...seed, desiredCgHeight: heights[profile.id] });
}
export function withHighBikeCgEntry(entry) {
  return { ...entry, profile: withHighBikeCg(entry.profile) };
}
