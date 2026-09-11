import {
  ROAD_TORQUE_POLICY,
  TWO_WHEEL_TORQUE_POLICY,
  type TorqueProtectionPolicy,
} from '../physics/torque-protection.js';
import { type CompiledArcadeVehicleProfile, type VehicleProfileId } from '../physics/vehicle-profiles.js';
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
} from './production-vehicle-profiles.js';

export type VehiclePresentationFamily = 'CAR' | 'BIKE';

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
  readonly presentationFamily: VehiclePresentationFamily;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;
  readonly mobileLabel: string;
}

function entry(value: VehicleCatalogEntry): Readonly<VehicleCatalogEntry> {
  if (value.presentationFamily !== 'CAR' && value.presentationFamily !== 'BIKE') {
    throw new RangeError('vehicle presentation family must be CAR or BIKE');
  }
  return Object.freeze({
    ...value,
    identifier: value.identifier === null ? null : Object.freeze({ ...value.identifier }),
    selectedSpecification: Object.freeze([...value.selectedSpecification]),
    physicsAnchor: Object.freeze({ ...value.physicsAnchor }),
  });
}

export function compileVehicleCatalog(
  values: readonly VehicleCatalogEntry[],
): readonly Readonly<VehicleCatalogEntry>[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.profile.id)) throw new RangeError(`duplicate vehicle id: ${value.profile.id}`);
    ids.add(value.profile.id);
  }
  return Object.freeze(values.map(entry));
}

/** Product catalog. Metadata roles remain separate from compiled mechanical profiles. */
export const VEHICLE_CATALOG: readonly Readonly<VehicleCatalogEntry>[] = compileVehicleCatalog([
  {
    manufacturer: 'Ferrari',
    model: 'Testarossa',
    identifier: { officialLabel: 'Tipo F110', shortLabel: 'F110' },
    selectedSpecification: ['5-bolt wheels'],
    period: '1988½–1991',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    presentationFamily: 'CAR',
    profile: FERRARI_TESTAROSSA_VEHICLE_PROFILE,
    torqueProtection: ROAD_TORQUE_POLICY,
    mobileLabel: 'F110',
  },
  {
    manufacturer: 'Porsche',
    model: '911 Turbo 3.3',
    identifier: { officialLabel: 'Type 930', shortLabel: '930' },
    selectedSpecification: ['G50/50 5-speed'],
    period: '1989',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    presentationFamily: 'CAR',
    profile: PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE,
    torqueProtection: ROAD_TORQUE_POLICY,
    mobileLabel: '930',
  },
  {
    manufacturer: 'Chevrolet',
    model: 'Corvette',
    identifier: { officialLabel: 'C4', shortLabel: 'C4' },
    selectedSpecification: ['L98', 'ZF 6-speed', 'pre-facelift'],
    period: '1989–1990',
    physicsAnchor: { modelYear: '1989', market: 'US' },
    presentationFamily: 'CAR',
    profile: CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE,
    torqueProtection: ROAD_TORQUE_POLICY,
    mobileLabel: 'C4',
  },
  {
    manufacturer: 'Volkswagen',
    model: 'Golf GTI 16V',
    identifier: { officialLabel: 'Mk2', shortLabel: 'Mk2' },
    selectedSpecification: ['small bumpers'],
    period: '1986–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    presentationFamily: 'CAR',
    profile: VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE,
    torqueProtection: ROAD_TORQUE_POLICY,
    mobileLabel: 'GTI',
  },
  {
    manufacturer: 'Lancia',
    model: 'Delta HF Integrale',
    identifier: null,
    selectedSpecification: ['8V', '185 PS'],
    period: '1988–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    presentationFamily: 'CAR',
    profile: LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE,
    torqueProtection: ROAD_TORQUE_POLICY,
    mobileLabel: 'DELTA',
  },
  {
    manufacturer: 'Honda',
    model: 'VFR750R',
    identifier: { officialLabel: 'RC30', shortLabel: 'RC30' },
    selectedSpecification: [],
    period: '1987–1990',
    physicsAnchor: { modelYear: '1988', market: 'ROW full-power' },
    presentationFamily: 'BIKE',
    profile: HONDA_VFR750R_VEHICLE_PROFILE,
    torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    mobileLabel: 'RC30',
  },
  {
    manufacturer: 'BMW',
    model: 'R 80 G/S Paris-Dakar',
    identifier: null,
    selectedSpecification: [],
    period: '1984–1987',
    physicsAnchor: { modelYear: '1985', market: 'European/ROW' },
    presentationFamily: 'BIKE',
    profile: BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE,
    torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    mobileLabel: 'R80',
  },
  {
    manufacturer: 'Harley-Davidson',
    model: 'FXRT Sport Glide',
    identifier: { officialLabel: 'FXRT', shortLabel: 'FXRT' },
    selectedSpecification: ['Evolution 1340'],
    period: '1984–1992',
    physicsAnchor: { modelYear: '1988', market: 'US' },
    presentationFamily: 'BIKE',
    profile: HARLEY_DAVIDSON_FXRT_VEHICLE_PROFILE,
    torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    mobileLabel: 'FXRT',
  },
  {
    manufacturer: 'Vespa',
    model: 'PX 200 E Arcobaleno',
    identifier: { officialLabel: 'VSX1T', shortLabel: 'VSX1T' },
    selectedSpecification: ['200 cc full-power'],
    period: '1983–1997',
    physicsAnchor: { modelYear: '1985', market: 'Italian/European' },
    presentationFamily: 'BIKE',
    profile: VESPA_PX200E_ARCOBALENO_VEHICLE_PROFILE,
    torqueProtection: TWO_WHEEL_TORQUE_POLICY,
    mobileLabel: 'PX200',
  },
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
  const needsIdentifier = identifier !== null && !entryValue.model.split(/\s+/u).includes(identifier.shortLabel);
  const identified = needsIdentifier ? `${base} (${identifier.shortLabel})` : base;
  const specification =
    entryValue.selectedSpecification.length > 0 ? ` — ${entryValue.selectedSpecification.join(', ')}` : '';
  return `${identified}${specification} (${entryValue.period})`;
}
