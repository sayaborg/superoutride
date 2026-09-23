import type { VehicleCatalogEntry } from '../../src/vehicle/vehicle-catalog.js';
import type { VehicleEnvelope } from '../../src/race/envelope-driver.js';

export function measureVehicleEnvelope(entry: Readonly<VehicleCatalogEntry>): VehicleEnvelope & {
  measurement: {
    version: number;
    dt: number;
    surface: string;
    convergenceSeconds: number;
    acceleration: { speed: number; value: number }[];
    braking: { speed: number; value: number }[];
  };
};
