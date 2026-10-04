import {
  admit,
  readArray,
  readDocument,
  readEnum,
  readIdentified,
  readNumber,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import type { VehicleForm } from '../vehicle/definition-document.js';
import { MAXIMUM_VEHICLE_SPEED_KILOMETERS_PER_HOUR } from '../vehicle/physics/vehicle-definitions.js';
import type { ContentDelivery } from './content-manifest.js';
import { requireLoaded } from './content-load-error.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';

/** The single FREE PLAY document's identifier: its file name and manifest ID. */
export const FREE_PLAY_RULES_ID = 'default';

/** The TRAFFIC choice without traffic; every other level is the document's. */
export const NO_TRAFFIC = 'OFF';

/** A FREE PLAY rival pool: its ID and the vehicle forms it draws from. */
export interface RivalPoolRule {
  readonly id: string;
  readonly forms: readonly VehicleForm[];
}

/**
 * FREE PLAY's own rules, the same on every course: its rival pools, its TRAFFIC levels (after OFF, each a density in
 * vehicles per kilometre, drawn from every vehicle) and the one traffic speed in km/h.
 */
export interface FreePlayRules {
  readonly rivalPools: readonly RivalPoolRule[];
  readonly traffic: readonly { readonly id: string; readonly density: number }[];
  readonly trafficSpeedKilometersPerHour: number;
}

const FORMS: readonly VehicleForm[] = ['car', 'bike'];
const ID = { maxLength: 16, pattern: /^[A-Z][A-Z0-9_]*$/, patternMessage: 'Expected an uppercase ID' };

/**
 * Admit the `superoutride.free-play` version 1 document: rival pools with unique IDs and nonempty unique forms, where
 * each vehicle form has a pool of that form alone (its vehicles' default); TRAFFIC levels with unique IDs other than
 * OFF and densities within the Session rule ceiling; and the traffic speed within the vehicle speed bound.
 */
export function readFreePlayRules(value: unknown, document = ''): AdmissionResult<FreePlayRules> {
  return admit(document, () => {
    const data = readDocument(
      value,
      ['format', 'version', 'rivalPools', 'traffic', 'trafficSpeedKilometersPerHour'],
      'superoutride.free-play',
      1,
    );
    const rivalPools = readIdentified(data.rivalPools, '/rivalPools', (item, at) => {
      const pool = readRecord(item, at, ['id', 'forms']);
      const forms = readArray(pool.forms, `${at}/forms`, (form, path) => readEnum(form, FORMS, path), { min: 1 });
      requireAdmission(new Set(forms).size === forms.length, 'invalid_value', `${at}/forms`, 'Duplicate form');
      return Object.freeze({ id: readString(pool.id, `${at}/id`, ID), forms });
    });
    for (const form of FORMS)
      requireAdmission(
        rivalPools.some((pool) => pool.forms.length === 1 && pool.forms[0] === form),
        'invalid_value',
        '/rivalPools',
        `No pool of ${form} vehicles alone`,
      );
    const traffic = readIdentified(data.traffic, '/traffic', (item, at) => {
      const level = readRecord(item, at, ['id', 'density']);
      const id = readString(level.id, `${at}/id`, ID);
      requireAdmission(id !== NO_TRAFFIC, 'invalid_value', `${at}/id`, `${NO_TRAFFIC} is the level without traffic`);
      return Object.freeze({
        id,
        density: readNumber(level.density, `${at}/density`, {
          min: 0,
          exclusiveMin: true,
          max: SESSION_RULE_LIMITS.trafficDensity,
        }),
      });
    });
    return Object.freeze({
      rivalPools,
      traffic,
      trafficSpeedKilometersPerHour: readNumber(data.trafficSpeedKilometersPerHour, '/trafficSpeedKilometersPerHour', {
        min: 0,
        exclusiveMin: true,
        max: MAXIMUM_VEHICLE_SPEED_KILOMETERS_PER_HOUR,
      }),
    });
  });
}

/** Admit FREE PLAY's rules, from the build's file or delivery's manifest alike: one document, `default`. */
export function compileFreePlayRules(sources: readonly DocumentSource[]): AdmissionResult<FreePlayRules> {
  const single = admitSingleDocument(sources, FREE_PLAY_RULES_ID, 'FREE PLAY document');
  if (!single.ok) return single;
  return readFreePlayRules(single.value.value, single.value.path);
}

/** Transport verifies the saved bytes before admission; each composition loads the rules once. */
export async function loadFreePlayRules(content: ContentDelivery): Promise<FreePlayRules> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'free-play'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('free-play', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileFreePlayRules(sources));
}
