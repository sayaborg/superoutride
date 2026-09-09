// Historical high-CG fixtures, retained under M9.28 document123 for causal regressions only.
import * as seeds from '../../dist/vehicle/production-vehicle-profiles.js';
import { compileArcadeVehicleProfile } from '../../dist/physics/vehicle-profiles.js';
const heights = Object.freeze({ VFR750R: .72, R80_GS_PARIS_DAKAR: .82, FXRT_SPORT_GLIDE: .68, PX200E_ARCOBALENO: .67 });
export function withM927BikeCg(profile) {
  if (!(profile.id in heights)) return profile;
  const seed = Object.entries(seeds).find(([key, value]) => key.endsWith('_AUTHORING') && value.id === profile.id)[1];
  return compileArcadeVehicleProfile({ ...seed, desiredCgHeight: heights[profile.id] });
}
export function withM927BikeCgEntry(entry) {
  return { ...entry, profile: withM927BikeCg(entry.profile) };
}
