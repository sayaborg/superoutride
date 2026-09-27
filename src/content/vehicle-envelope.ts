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
import { sessionVehicleSha256, type SessionVehicle } from './session-vehicle.js';
import { SHA256_TEXT } from '../core/content-digest.js';

export interface VehicleEnvelope {
  readonly maximumSpeed: number;
  readonly rows: readonly {
    readonly speed: number;
    readonly acceleration: number;
    readonly braking: number;
    readonly lateral: number;
    readonly steeringGain: number;
  }[];
}

export const RIVAL_ENVELOPE_FORMAT = Object.freeze({ format: 'superoutride.rival-envelope', version: 1 } as const);

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
      readString(data.vehicleSha256, '/vehicleSha256', SHA256_TEXT) === digest,
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
