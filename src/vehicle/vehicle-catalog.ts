import type { VehicleAudioProfile } from '../audio/vehicle-audio-profile.js';
import { VEHICLE_SOUND_PROFILES } from './sound-profiles.js';
import { type CompiledVehicle, type VehicleId } from './physics/vehicle-definitions.js';
import {
  COMPILED_BMW_R80_GS_PARIS_DAKAR_VEHICLE,
  COMPILED_CHEVROLET_CORVETTE_C4_VEHICLE,
  COMPILED_FERRARI_TESTAROSSA_VEHICLE,
  COMPILED_HARLEY_DAVIDSON_FXRT_VEHICLE,
  COMPILED_HONDA_VFR750R_VEHICLE,
  COMPILED_LANCIA_DELTA_HF_INTEGRALE_VEHICLE,
  COMPILED_PORSCHE_911_TURBO_3_3_VEHICLE,
  COMPILED_VESPA_PX200E_ARCOBALENO_VEHICLE,
  COMPILED_VOLKSWAGEN_GOLF_GTI_16V_VEHICLE,
} from './production-vehicle-definitions.js';

const TWO_WHEEL_SUPPORT_RESERVE = 0.08;

export type VehicleVisualFamily = 'CAR' | 'BIKE';

interface VehicleIdentifier {
  readonly officialLabel: string;
  readonly shortLabel: string;
}

export interface VehicleCatalogEntry {
  readonly sound: VehicleAudioProfile;
  readonly manufacturer: string;
  readonly model: string;
  readonly identifier: VehicleIdentifier | null;
  readonly selectedSpecification: readonly string[];
  readonly period: string;
  readonly physicsAnchor: Readonly<{ modelYear: string; market: string }>;
  readonly compiledVehicle: Readonly<CompiledVehicle>;
  readonly visualFamily: VehicleVisualFamily;
  readonly supportReserve: number | null;
  readonly mobileLabel: string;
}

function entry(value: VehicleCatalogEntry): Readonly<VehicleCatalogEntry> {
  if (value.visualFamily !== 'CAR' && value.visualFamily !== 'BIKE') {
    throw new RangeError('vehicle visual family must be CAR or BIKE');
  }
  return Object.freeze({
    ...value,
    identifier: value.identifier === null ? null : Object.freeze({ ...value.identifier }),
    selectedSpecification: Object.freeze([...value.selectedSpecification]),
    physicsAnchor: Object.freeze({ ...value.physicsAnchor }),
  });
}

function compileVehicleCatalog(values: readonly VehicleCatalogEntry[]): readonly Readonly<VehicleCatalogEntry>[] {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.compiledVehicle.id)) throw new RangeError(`duplicate vehicle id: ${value.compiledVehicle.id}`);
    ids.add(value.compiledVehicle.id);
  }
  return Object.freeze(values.map(entry));
}

/** Product catalog. Metadata roles remain separate from compiled vehicles. */
export const VEHICLE_CATALOG: readonly Readonly<VehicleCatalogEntry>[] = compileVehicleCatalog([
  {
    sound: VEHICLE_SOUND_PROFILES['TESTAROSSA'],
    manufacturer: 'Ferrari',
    model: 'Testarossa',
    identifier: { officialLabel: 'Tipo F110', shortLabel: 'F110' },
    selectedSpecification: ['5-bolt wheels'],
    period: '1988½–1991',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    visualFamily: 'CAR',
    compiledVehicle: COMPILED_FERRARI_TESTAROSSA_VEHICLE,
    supportReserve: null,
    mobileLabel: 'F110',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['911_TURBO_3_3'],
    manufacturer: 'Porsche',
    model: '911 Turbo 3.3',
    identifier: { officialLabel: 'Type 930', shortLabel: '930' },
    selectedSpecification: ['G50/50 5-speed'],
    period: '1989',
    physicsAnchor: { modelYear: '1989', market: 'European/ROW' },
    visualFamily: 'CAR',
    compiledVehicle: COMPILED_PORSCHE_911_TURBO_3_3_VEHICLE,
    supportReserve: null,
    mobileLabel: '930',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['CORVETTE_C4'],
    manufacturer: 'Chevrolet',
    model: 'Corvette',
    identifier: { officialLabel: 'C4', shortLabel: 'C4' },
    selectedSpecification: ['L98', 'ZF 6-speed', 'pre-facelift'],
    period: '1989–1990',
    physicsAnchor: { modelYear: '1989', market: 'US' },
    visualFamily: 'CAR',
    compiledVehicle: COMPILED_CHEVROLET_CORVETTE_C4_VEHICLE,
    supportReserve: null,
    mobileLabel: 'C4',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['GOLF_GTI_16V'],
    manufacturer: 'Volkswagen',
    model: 'Golf GTI 16V',
    identifier: { officialLabel: 'Mk2', shortLabel: 'Mk2' },
    selectedSpecification: ['small bumpers'],
    period: '1986–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    visualFamily: 'CAR',
    compiledVehicle: COMPILED_VOLKSWAGEN_GOLF_GTI_16V_VEHICLE,
    supportReserve: null,
    mobileLabel: 'GTI',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['DELTA_HF_INTEGRALE'],
    manufacturer: 'Lancia',
    model: 'Delta HF Integrale',
    identifier: null,
    selectedSpecification: ['8V', '185 PS'],
    period: '1988–1989',
    physicsAnchor: { modelYear: '1988', market: 'European/ROW' },
    visualFamily: 'CAR',
    compiledVehicle: COMPILED_LANCIA_DELTA_HF_INTEGRALE_VEHICLE,
    supportReserve: null,
    mobileLabel: 'DELTA',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['VFR750R'],
    manufacturer: 'Honda',
    model: 'VFR750R',
    identifier: { officialLabel: 'RC30', shortLabel: 'RC30' },
    selectedSpecification: [],
    period: '1987–1990',
    physicsAnchor: { modelYear: '1988', market: 'ROW full-power' },
    visualFamily: 'BIKE',
    compiledVehicle: COMPILED_HONDA_VFR750R_VEHICLE,
    supportReserve: TWO_WHEEL_SUPPORT_RESERVE,
    mobileLabel: 'RC30',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['R80_GS_PARIS_DAKAR'],
    manufacturer: 'BMW',
    model: 'R 80 G/S Paris-Dakar',
    identifier: null,
    selectedSpecification: [],
    period: '1984–1987',
    physicsAnchor: { modelYear: '1985', market: 'European/ROW' },
    visualFamily: 'BIKE',
    compiledVehicle: COMPILED_BMW_R80_GS_PARIS_DAKAR_VEHICLE,
    supportReserve: TWO_WHEEL_SUPPORT_RESERVE,
    mobileLabel: 'R80',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['FXRT_SPORT_GLIDE'],
    manufacturer: 'Harley-Davidson',
    model: 'FXRT Sport Glide',
    identifier: { officialLabel: 'FXRT', shortLabel: 'FXRT' },
    selectedSpecification: ['Evolution 1340'],
    period: '1984–1992',
    physicsAnchor: { modelYear: '1988', market: 'US' },
    visualFamily: 'BIKE',
    compiledVehicle: COMPILED_HARLEY_DAVIDSON_FXRT_VEHICLE,
    supportReserve: TWO_WHEEL_SUPPORT_RESERVE,
    mobileLabel: 'FXRT',
  },
  {
    sound: VEHICLE_SOUND_PROFILES['PX200E_ARCOBALENO'],
    manufacturer: 'Vespa',
    model: 'PX 200 E Arcobaleno',
    identifier: { officialLabel: 'VSX1T', shortLabel: 'VSX1T' },
    selectedSpecification: ['200 cc full-power'],
    period: '1983–1997',
    physicsAnchor: { modelYear: '1985', market: 'Italian/European' },
    visualFamily: 'BIKE',
    compiledVehicle: COMPILED_VESPA_PX200E_ARCOBALENO_VEHICLE,
    supportReserve: TWO_WHEEL_SUPPORT_RESERVE,
    mobileLabel: 'PX200',
  },
]);

export const DEFAULT_VEHICLE_CATALOG_ENTRY = VEHICLE_CATALOG[0]!;

export function vehicleCatalogEntryForId(id: VehicleId): Readonly<VehicleCatalogEntry> {
  const result = VEHICLE_CATALOG.find((candidate) => candidate.compiledVehicle.id === id);
  if (result === undefined) throw new RangeError(`unknown vehicle id: ${id}`);
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
