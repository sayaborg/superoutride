import type { VehicleMetadata } from './definition-document.js';

export function formatVehicleCatalogLine(entryValue: VehicleMetadata): string {
  const base = `${entryValue.manufacturer} ${entryValue.model}`;
  const identifier = entryValue.identifier;
  const needsIdentifier = identifier !== null && !entryValue.model.split(/\s+/u).includes(identifier.shortLabel);
  const identified = needsIdentifier ? `${base} (${identifier.shortLabel})` : base;
  const specification =
    entryValue.selectedSpecification.length > 0 ? ` — ${entryValue.selectedSpecification.join(', ')}` : '';
  return `${identified}${specification} (${entryValue.period})`;
}
