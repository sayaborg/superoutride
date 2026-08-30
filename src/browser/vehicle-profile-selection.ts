import {
  BIKE_VEHICLE_PROFILE,
  FR_VEHICLE_PROFILE,
  MR_VEHICLE_PROFILE,
  RR_VEHICLE_PROFILE,
  type CompiledArcadeVehicleProfile,
  type VehicleProfileId,
} from '../physics/vehicle-profiles.js';

export interface BrowserVehicleProfileSelection {
  readonly code: 'KeyQ' | 'KeyW' | 'KeyE' | 'KeyR';
  readonly keyLabel: 'Q' | 'W' | 'E' | 'R';
  readonly profile: Readonly<CompiledArcadeVehicleProfile>;
}

export const BROWSER_VEHICLE_PROFILES: readonly BrowserVehicleProfileSelection[] = Object.freeze([
  Object.freeze({ code: 'KeyQ', keyLabel: 'Q', profile: FR_VEHICLE_PROFILE }),
  Object.freeze({ code: 'KeyW', keyLabel: 'W', profile: MR_VEHICLE_PROFILE }),
  Object.freeze({ code: 'KeyE', keyLabel: 'E', profile: RR_VEHICLE_PROFILE }),
  Object.freeze({ code: 'KeyR', keyLabel: 'R', profile: BIKE_VEHICLE_PROFILE }),
]);

export function browserVehicleProfileForKey(
  code: string,
): Readonly<CompiledArcadeVehicleProfile> | null {
  return BROWSER_VEHICLE_PROFILES.find((selection) => selection.code === code)?.profile ?? null;
}

export function formatVehicleProfileSelector(activeId: VehicleProfileId): string {
  return BROWSER_VEHICLE_PROFILES
    .map(({ keyLabel, profile }) => `[${keyLabel}]${profile.id}${profile.id === activeId ? '*' : ''}`)
    .join(' ');
}
