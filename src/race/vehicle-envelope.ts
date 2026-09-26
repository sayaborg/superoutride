import {
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import type { SessionVehicle } from './session-configuration.js';
import type { VehicleEnvelope } from './envelope-driver.js';
import { sessionVehicleSha256 } from './session-vehicle.js';

export const RIVAL_ENVELOPE_FORMAT = Object.freeze({ format: 'superoutride.rival-envelope', version: 1 } as const);
const SHA256 = { pattern: /^[a-f0-9]{64}$/, patternMessage: 'Expected lowercase SHA-256' };

/** Admit the delivered rival envelope: only the measured rows needed by driving, for this Session vehicle. */
export async function readVehicleEnvelope(
  vehicle: SessionVehicle,
  input: unknown,
  document = '',
): Promise<AdmissionResult<VehicleEnvelope>> {
  const digest = await sessionVehicleSha256(vehicle);
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'vehicleSha256', 'envelope'],
      RIVAL_ENVELOPE_FORMAT.format,
      RIVAL_ENVELOPE_FORMAT.version,
    );
    requireAdmission(
      readString(data.vehicleSha256, '/vehicleSha256', SHA256) === digest,
      'invalid_value',
      '/vehicleSha256',
      'Stale envelope vehicle/calibration/assist identity',
    );
    const envelope = readRecord(data.envelope, '/envelope', ['maximumSpeed', 'rows']);
    const maximumSpeed = readNumber(envelope.maximumSpeed, '/envelope/maximumSpeed', { min: 0, exclusiveMin: true });
    let previous = -1;
    const rows = readArray(
      envelope.rows,
      '/envelope/rows',
      (value, at) => {
        const row = readRecord(value, at, ['speed', 'acceleration', 'braking', 'lateral', 'steeringGain']);
        const positive = (key: string) => readNumber(row[key], `${at}/${key}`, { min: 0, exclusiveMin: true });
        const speed = readNumber(row.speed, `${at}/speed`, { min: 0 });
        requireAdmission(
          speed > previous && speed <= maximumSpeed,
          'invalid_value',
          `${at}/speed`,
          'Envelope speeds must increase within maximum speed',
        );
        previous = speed;
        return Object.freeze({
          speed,
          acceleration: readNumber(row.acceleration, `${at}/acceleration`, { min: 0 }),
          braking: positive('braking'),
          lateral: positive('lateral'),
          steeringGain: positive('steeringGain'),
        });
      },
      { min: 2 },
    );
    requireAdmission(
      previous === maximumSpeed,
      'invalid_value',
      '/envelope/rows',
      'Envelope must cover its maximum speed',
    );
    return Object.freeze({ maximumSpeed, rows });
  });
}
