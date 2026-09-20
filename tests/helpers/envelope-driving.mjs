import { readFileSync } from 'node:fs';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../dist/gameplay/envelope-driver.js';

const envelopes = new Map(),
  drivers = new Map(),
  workspaces = new WeakMap();
export function testEnvelope(id = 'TESTAROSSA') {
  if (!envelopes.has(id))
    envelopes.set(
      id,
      JSON.parse(readFileSync(new URL(`../../dist/content/envelopes/${id}.json`, import.meta.url))).envelope,
    );
  return envelopes.get(id);
}
/** Existing geometry/contact fixtures retain a bounded cruise input; this is not production policy. */
export function driveMeasuredVehicle(guide, vehicle, targetL = 0) {
  const id = vehicle.profile?.id ?? 'TESTAROSSA';
  if (!drivers.has(id)) drivers.set(id, compileEnvelopeDriver(testEnvelope(id), 0.75, 56));
  if (!workspaces.has(vehicle)) workspaces.set(vehicle, createEnvelopeDriverWorkspace());
  return sampleEnvelopeDrivingInput(guide, vehicle, drivers.get(id), targetL, workspaces.get(vehicle));
}
