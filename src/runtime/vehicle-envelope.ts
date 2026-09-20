import { contentDigest } from '../core/content-digest.js';
import type { SessionVehicle } from '../gameplay/session-configuration.js';
import type { VehicleEnvelope } from '../gameplay/envelope-driver.js';

/** Admit only the measured rows needed by driving; offline measurement traces stay outside the live graph. */
export async function readVehicleEnvelope(vehicle: SessionVehicle, input: unknown): Promise<VehicleEnvelope> {
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new TypeError('Envelope must contain records');
    return value as Record<string, unknown>;
  };
  const source = record(input),
    envelope = record(source.envelope);
  const digest = await contentDigest(new TextEncoder().encode(JSON.stringify(vehicle)));
  if (source.vehicleSha256 !== digest) throw new RangeError('Stale envelope vehicle/calibration/assist identity');
  const number = (value: unknown, positive = true): number => {
    if (typeof value !== 'number') throw new TypeError('Envelope values must be numbers');
    if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0))
      throw new RangeError('Envelope values are outside their domain');
    return value;
  };
  const maximumSpeed = number(envelope.maximumSpeed);
  if (!Array.isArray(envelope.rows)) throw new TypeError('Envelope rows must be an array');
  if (envelope.rows.length < 2) throw new RangeError('Envelope requires at least two measured rows');
  let previous = -1;
  const rows = envelope.rows.map((value) => {
    const row = record(value),
      speed = number(row.speed, false);
    if (speed <= previous || speed > maximumSpeed)
      throw new RangeError('Envelope speeds must increase within maximum speed');
    previous = speed;
    return Object.freeze({
      speed,
      acceleration: number(row.acceleration, false),
      braking: number(row.braking),
      lateral: number(row.lateral),
      steeringGain: number(row.steeringGain),
    });
  });
  if (previous !== maximumSpeed) throw new RangeError('Envelope must cover its maximum speed');
  return Object.freeze({ maximumSpeed, rows: Object.freeze(rows) });
}
