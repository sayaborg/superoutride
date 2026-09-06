import { ROAD_TORQUE_POLICY, TWO_WHEEL_TORQUE_POLICY, type TorqueProtectionPolicy } from '../physics/torque-protection.js';
import {
  BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE,
  CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE,
  FERRARI_TESTAROSSA_VEHICLE_PROFILE,
  HARLEY_DAVIDSON_FXRT_VEHICLE_PROFILE,
  HONDA_VFR750R_VEHICLE_PROFILE,
  LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
  PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
  VESPA_PX200E_ARCOBALENO_VEHICLE_PROFILE,
  VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE,
  type CompiledArcadeVehicleProfile,
  type VehicleProfileId,
} from '../physics/vehicle-profiles.js';

export type VehicleSelectionKeyCode =
  | 'KeyQ' | 'KeyW' | 'KeyE' | 'KeyR' | 'KeyA' | 'KeyS' | 'KeyD' | 'KeyF' | 'KeyV';

export interface VehicleIdentifier {
  readonly officialLabel: string;
  readonly shortLabel: string;
}

export interface VehicleCatalogEntry {
  readonly manufacturer: string;
  readonly model: string;
  readonly identifier: VehicleIdentifier | null;
  readonly selectedSpecification: readonly string[];
  readonly period: string;
  readonly physicsAnchor: Readonly<{ modelYear: string; market: string }>;
  readonly profile: Readonly<CompiledArcadeVehicleProfile>;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  readonly keyCode: VehicleSelectionKeyCode;
  readonly keyLabel: string;
  readonly mobileLabel: string;
}

function entry(value: VehicleCatalogEntry): Readonly<VehicleCatalogEntry> {
  return Object.freeze({
    ...value,
    identifier: value.identifier === null ? null : Object.freeze({ ...value.identifier }),
    selectedSpecification: Object.freeze([...value.selectedSpecification]),
    physicsAnchor: Object.freeze({ ...value.physicsAnchor }),
  });
}

/** M9.8 product catalog. Metadata roles remain separate from compiled mechanical profiles. */
export const VEHICLE_CATALOG: readonly Readonly<VehicleCatalogEntry>[] = Object.freeze([
  entry({ manufacturer: 'Ferrari', model: 'Testarossa',
    identifier: { officialLabel: 'Tipo F110', shortLabel: 'F110' },
    selectedSpecification: ['5-bolt wheels'], period: '1988½–1991',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    profile: FERRARI_TESTAROSSA_VEHICLE_PROFILE, torqueProtection: ROAD_TORQUE_POLICY,
    keyCode: 'KeyQ', keyLabel: 'Q', mobileLabel: 'F110' }),
  entry({ manufacturer: 'Porsche', model: '911 Turbo 3.3',
    identifier: { officialLabel: 'Type 930', shortLabel: '930' },
    selectedSpecification: ['G50/50 5-speed'], period: '1989',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    profile: PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE, torqueProtection: ROAD_TORQUE_POLICY,
    keyCode: 'KeyW', keyLabel: 'W', mobileLabel: '930' }),
  entry({ manufacturer: 'Chevrolet', model: 'Corvette',
    identifier: { officialLabel: 'C4', shortLabel: 'C4' },
    selectedSpecification: ['L98', 'ZF 6-speed', 'pre-facelift'], period: '1989–1990',
    physicsAnchor: { modelYear: '1989', market: 'US' },
    profile: CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE, torqueProtection: ROAD_TORQUE_POLICY,
    keyCode: 'KeyE', keyLabel: 'E', mobileLabel: 'C4' }),
  entry({ manufacturer: 'Volkswagen', model: 'Golf GTI 16V',
    identifier: { officialLabel: 'Mk2', shortLabel: 'Mk2' },
    selectedSpecification: ['small bumpers'], period: '1986–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    profile: VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE, torqueProtection: ROAD_TORQUE_POLICY,
    keyCode: 'KeyR', keyLabel: 'R', mobileLabel: 'GTI' }),
  entry({ manufacturer: 'Lancia', model: 'Delta HF Integrale', identifier: null,
    selectedSpecification: ['8V', '185 PS'], period: '1988–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    profile: LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE, torqueProtection: ROAD_TORQUE_POLICY,
    keyCode: 'KeyA', keyLabel: 'A', mobileLabel: 'DELTA' }),
  entry({ manufacturer: 'Honda', model: 'VFR750R',
    identifier: { officialLabel: 'RC30', shortLabel: 'RC30' },
    selectedSpecification: [], period: '1987–1990',
    physicsAnchor: { modelYear: '1988', market: 'ROW full-power' },
    profile: HONDA_VFR750R_VEHICLE_PROFILE, torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    keyCode: 'KeyS', keyLabel: 'S', mobileLabel: 'RC30' }),
  entry({ manufacturer: 'BMW', model: 'R 80 G/S Paris-Dakar', identifier: null,
    selectedSpecification: [], period: '1984–1987',
    physicsAnchor: { modelYear: '1985', market: 'European/ROW' },
    profile: BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE, torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    keyCode: 'KeyD', keyLabel: 'D', mobileLabel: 'R80' }),
  entry({ manufacturer: 'Harley-Davidson', model: 'FXRT Sport Glide',
    identifier: { officialLabel: 'FXRT', shortLabel: 'FXRT' },
    selectedSpecification: ['Evolution 1340'], period: '1984–1992',
    physicsAnchor: { modelYear: '1988', market: 'US' },
    profile: HARLEY_DAVIDSON_FXRT_VEHICLE_PROFILE, torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    keyCode: 'KeyF', keyLabel: 'F', mobileLabel: 'FXRT' }),
  entry({ manufacturer: 'Vespa', model: 'PX 200 E Arcobaleno',
    identifier: { officialLabel: 'VSX1T', shortLabel: 'VSX1T' },
    selectedSpecification: ['200 cc full-power'], period: '1983–1997',
    physicsAnchor: { modelYear: '1985', market: 'Italian/European' },
    profile: VESPA_PX200E_ARCOBALENO_VEHICLE_PROFILE, torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    keyCode: 'KeyV', keyLabel: 'V', mobileLabel: 'PX200' }),
]);

export const DEFAULT_VEHICLE_CATALOG_ENTRY = VEHICLE_CATALOG[0]!;

export function vehicleCatalogEntryForId(id: VehicleProfileId): Readonly<VehicleCatalogEntry> {
  const result = VEHICLE_CATALOG.find((candidate) => candidate.profile.id === id);
  if (result === undefined) throw new RangeError(`unknown vehicle profile id: ${id}`);
  return result;
}

export function formatVehicleCatalogLine(entryValue: Readonly<VehicleCatalogEntry>): string {
  const base = `${entryValue.manufacturer} ${entryValue.model}`;
  const identifier = entryValue.identifier;
  const needsIdentifier = identifier !== null
    && !entryValue.model.split(/\s+/u).includes(identifier.shortLabel);
  const identified = needsIdentifier ? `${base} (${identifier.shortLabel})` : base;
  const specification = entryValue.selectedSpecification.length > 0
    ? ` — ${entryValue.selectedSpecification.join(', ')}`
    : '';
  return `${identified}${specification} (${entryValue.period})`;
}
