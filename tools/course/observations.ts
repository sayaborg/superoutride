export interface CourseObservations {
  format: 'superoutride.course-observations';
  version: 1;
  id: string;
  source: { kind: 'video' | 'analyzed-data'; location: string; edition: string };
  calibration: Record<string, unknown>;
  samples: {
    s: number;
    timeSeconds: number | null;
    curvaturePerMeter: number;
    grade: number;
    roadWidthMeters: number;
    heightMeters: number | null;
  }[];
  spriteRows: {
    startS: number;
    endS: number;
    spacingMeters: number;
    offsetMeters: number;
    groundOffsetMeters: number;
    side: 'left' | 'right';
    kind: string;
  }[];
  environments: { s: number; label: string }[];
  checkpoints: { s: number; name: string }[];
  remasterDeviations: string[];
  measurements: unknown[];
}

import { finite, requireInput } from './authoring-io.js';

/** Source-neutral offline observations; compiler/runtime never estimate these values. */
export function readObservations(value: unknown): CourseObservations {
  // Existing field and range checks admit the untrusted saved observation without changing its representation.
  const input = value as CourseObservations;
  const check = (condition: unknown, path: string, message: string) =>
    requireInput(condition, path, message, 'observation');
  check(
    input?.format === 'superoutride.course-observations' && input.version === 1,
    '/format',
    'Expected course-observations v1',
  );
  check(typeof input.id === 'string' && input.id.trim(), '/id', 'Observation ID is required');
  check(['video', 'analyzed-data'].includes(input.source?.kind), '/source/kind', 'Source is video or analyzed-data');
  for (const key of ['location', 'edition'] as const)
    check(
      typeof input.source[key] === 'string' && input.source[key].trim(),
      `/source/${key}`,
      'Source attribution is required',
    );
  check(
    input.calibration && typeof input.calibration === 'object' && !Array.isArray(input.calibration),
    '/calibration',
    'Record measurement method and calibration',
  );
  check(
    Array.isArray(input.samples) && input.samples.length >= 2 && input.samples.length <= 4096,
    '/samples',
    'Require 2–4096 station samples',
  );
  let previous = -1,
    previousTime = -1;
  for (const [i, s] of input.samples.entries()) {
    finite(s.s, `/samples/${i}/s`, 0, 100000);
    check(s.s >= previous, `/samples/${i}/s`, 'Station samples must be ordered');
    previous = s.s;
    for (const k of ['curvaturePerMeter', 'grade'] as const) finite(s[k], `/samples/${i}/${k}`);
    finite(s.roadWidthMeters, `/samples/${i}/roadWidthMeters`, 0.1, 2000);
    if (s.heightMeters !== null) finite(s.heightMeters, `/samples/${i}/heightMeters`, -10000, 10000);
    if (s.timeSeconds !== null) {
      finite(s.timeSeconds, `/samples/${i}/timeSeconds`, 0);
      check(s.timeSeconds > previousTime, `/samples/${i}/timeSeconds`, 'Frame times must strictly increase');
      previousTime = s.timeSeconds;
    }
  }
  check(
    input.samples[0]!.s === 0 && previous > 0,
    '/samples',
    'Observations span a positive distance from station zero',
  );
  const station = (s: unknown, p: string) => finite(s, p, 0, previous);
  for (const key of ['spriteRows', 'environments', 'checkpoints', 'remasterDeviations', 'measurements'] as const)
    check(Array.isArray(input[key]), `/${key}`, 'Expected an explicit array');
  for (const [i, row] of input.spriteRows.entries()) {
    const p = `/spriteRows/${i}`;
    station(row.startS, p + '/startS');
    station(row.endS, p + '/endS');
    check(row.endS > row.startS, p, 'Observed sprite row needs positive length');
    finite(row.spacingMeters, p + '/spacingMeters', 0.1, 100000);
    finite(row.offsetMeters, p + '/offsetMeters', 0, 1000);
    finite(row.groundOffsetMeters, p + '/groundOffsetMeters', -10000, 10000);
    check(
      ['left', 'right'].includes(row.side) && typeof row.kind === 'string' && row.kind.trim(),
      p,
      'Row needs a kind and side',
    );
  }
  for (const key of ['environments', 'checkpoints'] as const) {
    let at = -1;
    for (const [i, item] of (input[key] as readonly { s: number; label?: string; name?: string }[]).entries()) {
      station(item.s, `/${key}/${i}/s`);
      check(item.s > at, `/${key}/${i}/s`, 'Landmarks must strictly increase');
      at = item.s;
      check(
        typeof item[key === 'environments' ? 'label' : 'name'] === 'string',
        `/${key}/${i}`,
        'Landmark label is required',
      );
    }
  }
  check(input.environments[0]?.s === 0, '/environments', 'Environment profile starts at zero');
  check(
    input.remasterDeviations.every((s) => typeof s === 'string' && s.trim()),
    '/remasterDeviations',
    'Deviations are nonempty text',
  );
  return input;
}
