import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { VehicleDocument } from '../../src/vehicle/definition-document.js';
import { compileVehicle } from '../../src/vehicle/physics/vehicle-definitions.js';

interface Datum<T> {
  value: T;
  status: 'unconfirmed-provisional' | 'sourced';
  source: string | null;
  note: string;
}
interface VehicleEvidence {
  id: string;
  published: {
    peakPowerKw: Datum<number>;
    peakPowerRpm: Datum<number>;
    peakTorqueNm: Datum<number>;
    peakTorqueRpm: Datum<number>;
    displacementCc: Datum<number>;
    cycle: Datum<number>;
    idleRpm: Datum<number>;
    redlineRpm: Datum<number>;
    gearRatios: Datum<number[]>;
    finalDriveRatio: Datum<number>;
  };
}

// Optional input roots support temporary authoring checks without editing production inputs.
const vehicleRoot = resolve(process.argv[2] ?? 'content/vehicles');
const evidenceRoot = resolve(process.argv[3] ?? 'tools/vehicle/data');
const failures: string[] = [];
const names = (await readdir(vehicleRoot)).filter((name) => name.endsWith('.json')).sort();
const evidenceNames = new Set((await readdir(evidenceRoot)).filter((name) => name.endsWith('.json')));
let passed = 0;
for (const name of names) {
  const before = failures.length;
  const fail = (message: string) => failures.push(`${name}: ${message}`);
  try {
    const document = JSON.parse(await readFile(resolve(vehicleRoot, name), 'utf8')) as VehicleDocument;
    const evidenceName = `${document.id}.json`;
    evidenceNames.delete(evidenceName);
    const evidence = JSON.parse(await readFile(resolve(evidenceRoot, evidenceName), 'utf8')) as VehicleEvidence;
    if (document.format !== 'superoutride.vehicle-definition' || document.version !== 3)
      fail('expected vehicle-definition version 3');
    if (evidence.id !== document.id) fail('evidence identity differs');
    for (const [key, datum] of Object.entries(evidence.published)) {
      if (
        !['unconfirmed-provisional', 'sourced'].includes(datum.status) ||
        (datum.status === 'sourced' && !datum.source?.trim())
      )
        fail(`${key}: requires a source or an explicit unconfirmed-provisional mark`);
    }
    const p = compileVehicle({ id: document.id, ...document.mechanics }).powertrain;
    const published = evidence.published;
    // Numerical roundoff only, not permission to change a published value (relative 1e-9).
    const equal = (a: number, b: number) =>
      Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    const compare = (label: string, actual: number, expected: number) => {
      if (!equal(actual, expected)) fail(`${label}: actual ${actual}, expected ${expected}`);
    };
    for (const key of ['displacementCc', 'cycle', 'idleRpm', 'redlineRpm', 'finalDriveRatio'] as const)
      compare(key, p[key], published[key].value);
    if (p.gearRatios.length !== published.gearRatios.value.length) fail('gearRatios: length differs');
    p.gearRatios.forEach((ratio, i) => compare(`gearRatios/${i}`, ratio, published.gearRatios.value[i] ?? NaN));
    const curve = p.torqueCurve;
    if (curve[0]!.rpm > p.idleRpm || curve.at(-1)!.rpm < p.redlineRpm)
      fail('curve does not cover idle through redline');
    const torquePeaks = curve.filter(
      (point) => point.torqueNewtonMeters === Math.max(...curve.map((point) => point.torqueNewtonMeters)),
    );
    compare('peak torque Nm', torquePeaks[0]!.torqueNewtonMeters, published.peakTorqueNm.value);
    if (torquePeaks.length !== 1) fail('peak torque RPM is not unique');
    compare('peak torque RPM', torquePeaks[0]!.rpm, published.peakTorqueRpm.value);

    const power = (rpm: number, torque: number) => (rpm * torque * 2 * Math.PI) / 60000;
    const candidates = curve.map((point) => ({ rpm: point.rpm, kw: power(point.rpm, point.torqueNewtonMeters) }));
    // T(r) is affine on each segment, so P(r) is quadratic. Include every interior stationary point.
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1]!,
        b = curve[i]!;
      const slope = (b.torqueNewtonMeters - a.torqueNewtonMeters) / (b.rpm - a.rpm);
      const intercept = a.torqueNewtonMeters - slope * a.rpm;
      const rpm = -intercept / (2 * slope);
      if (slope < 0 && rpm > a.rpm && rpm < b.rpm) candidates.push({ rpm, kw: power(rpm, slope * rpm + intercept) });
    }
    const maximum = candidates.reduce((a, b) => (a.kw >= b.kw ? a : b));
    compare('peak power kW', maximum.kw, published.peakPowerKw.value);
    compare('peak power RPM', maximum.rpm, published.peakPowerRpm.value);
    const authoredPeak = curve.find((point) => equal(point.rpm, published.peakPowerRpm.value));
    if (!authoredPeak) fail('missing authored peak-power point');
    else compare('power at authored peak kW', power(authoredPeak.rpm, authoredPeak.torqueNewtonMeters), maximum.kw);
    if (failures.length === before) {
      passed++;
      console.log(
        `PASS ${document.id}: ${torquePeaks[0]!.torqueNewtonMeters.toFixed(3)} Nm @ ${torquePeaks[0]!.rpm}; ${maximum.kw.toFixed(3)} kW @ ${maximum.rpm}; coverage and engine/gearing values match`,
      );
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
for (const name of evidenceNames) failures.push(`${name}: evidence has no vehicle definition`);
if (!names.length) failures.push('no vehicle definitions found');
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  `${passed}/${names.length} vehicles passed; ${failures.length} discrepancies. Source status is independent of value agreement.`,
);
process.exitCode = failures.length ? 1 : 0;
