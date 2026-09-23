import type { CourseObservations } from './observations.js';

type Rgb = readonly [number, number, number];
interface PaletteModel {
  palette: readonly Rgb[];
  tolerance: number;
}
interface MeasurementCalibration {
  camera: { focalLengthPixels: number; heightMeters: number; centerXPixels: number; horizonReferencePixels: number };
  horizon: PaletteModel & { top: number; bottom: number; columns: readonly number[] };
  road: PaletteModel & {
    left: number;
    right: number;
    maxGapPixels: number;
    minWidthPixels: number;
    rows: readonly number[];
  };
  hud: PaletteModel & {
    digitWidth: number;
    digitHeight: number;
    spacing: number;
    count: number;
    x: number;
    y: number;
    maxMismatchFraction: number;
    templates: Record<string, readonly string[]>;
  };
}
interface MeasurementRequest {
  format: 'superoutride.frame-measurement';
  version: 1;
  id: string;
  source: CourseObservations['source'];
  calibration: MeasurementCalibration;
  frames: { path: string; timeSeconds: number }[];
  environmentLabel: string;
}

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { options, jsonFile, requireInput, finite, atomicWrite, reportError } from './authoring-io.js';
import { readObservations } from './observations.js';

const integer = (n: unknown, p: string, min: number, max: number) => {
  finite(n, p, min, max);
  requireInput(Number.isInteger(n), p, 'Expected an integer');
  return n as number;
};
const median = (values: readonly number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return (v[Math.floor((v.length - 1) / 2)]! + v[Math.ceil((v.length - 1) / 2)]!) / 2;
};
function palette(value: unknown, p: string): asserts value is readonly Rgb[] {
  requireInput(
    Array.isArray(value) && value.length > 0 && value.length <= 256,
    p,
    'Supply 1–256 calibrated RGB colors',
  );
  for (const color of value) {
    requireInput(Array.isArray(color) && color.length === 3, p, 'Expected RGB');
    color.forEach((n) => integer(n, p, 0, 255));
  }
}
function quadratic(points: readonly { x: number; z: number }[]): [number, number, number] {
  // Solve x = a + b*z + c*z*z with deterministic partial pivoting.
  const rows = Array.from({ length: 3 }, (_, i) => [
    ...Array.from({ length: 3 }, (_, j) => points.reduce((v, p) => v + p.z ** (i + j), 0)),
    points.reduce((v, p) => v + p.x * p.z ** i, 0),
  ]);
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++) if (Math.abs(rows[j]![i]!) > Math.abs(rows[pivot]![i]!)) pivot = j;
    [rows[i], rows[pivot]] = [rows[pivot]!, rows[i]!];
    requireInput(Math.abs(rows[i]![i]!) > 1e-10, '/road/rows', 'Degenerate road projection');
    const d = rows[i]![i]!;
    for (let k = i; k < 4; k++) rows[i]![k]! /= d;
    for (let j = 0; j < 3; j++)
      if (j !== i) {
        const a = rows[j]![i]!;
        for (let k = i; k < 4; k++) rows[j]![k]! -= a * rows[i]![k]!;
      }
  }
  return rows.map((r) => r[3]!) as [number, number, number];
}
function measure(png: Pick<PNG, 'width' | 'height' | 'data'>, c: MeasurementCalibration) {
  const { width: w, height: h } = png,
    cam = c.camera,
    sky = c.horizon,
    road = c.road,
    hud = c.hud;
  requireInput(cam && sky && road && hud, '/calibration', 'Camera, horizon, road and HUD calibration are required');
  finite(cam.focalLengthPixels, '/camera/focalLengthPixels', 1, 100000);
  finite(cam.heightMeters, '/camera/heightMeters', 0.01, 100);
  finite(cam.centerXPixels, '/camera/centerXPixels', 0, w - 1);
  finite(cam.horizonReferencePixels, '/camera/horizonReferencePixels', 0, h - 1);
  for (const [key, model] of [
    ['horizon', sky],
    ['road', road],
    ['hud', hud],
  ] as const) {
    palette(model.palette, `/${key}/palette`);
    finite(model.tolerance, `/${key}/tolerance`, 0, 255);
  }
  const matches = (x: number, y: number, model: PaletteModel) => {
    const at = (y * w + x) * 4;
    return model.palette.some((rgb) => rgb.every((v, i) => Math.abs(png.data[at + i]! - v) <= model.tolerance));
  };
  integer(sky.top, '/horizon/top', 0, h - 2);
  integer(sky.bottom, '/horizon/bottom', sky.top + 1, h - 1);
  requireInput(
    Array.isArray(sky.columns) && sky.columns.length >= 1 && sky.columns.length <= w,
    '/horizon/columns',
    'Specify calibrated sky columns',
  );
  const edges = sky.columns.map((x) => {
    integer(x, '/horizon/columns', 0, w - 1);
    requireInput(matches(x, sky.top, sky), '/horizon', 'Top must be sky');
    let y = sky.top;
    while (y <= sky.bottom && matches(x, y, sky)) y++;
    requireInput(y <= sky.bottom, '/horizon', 'No sky edge in calibrated interval');
    return y;
  });
  const horizon = median(edges);
  integer(road.left, '/road/left', 0, w - 2);
  integer(road.right, '/road/right', road.left + 1, w - 1);
  integer(road.maxGapPixels, '/road/maxGapPixels', 0, w);
  integer(road.minWidthPixels, '/road/minWidthPixels', 2, w);
  requireInput(
    Array.isArray(road.rows) &&
      road.rows.length >= 3 &&
      road.rows.length <= h &&
      new Set(road.rows).size === road.rows.length,
    '/road/rows',
    'At least three distinct calibrated road scanlines are required',
  );
  const centers = road.rows.map((y) => {
    integer(y, '/road/rows', Math.floor(horizon) + 1, h - 1);
    const runs: { left: number; right: number }[] = [];
    let start: number | null = null,
      last: number | null = null;
    for (let x = road.left; x <= road.right; x++)
      if (matches(x, y, road)) {
        if (start !== null && x - last! > road.maxGapPixels + 1) {
          runs.push({ left: start, right: last! });
          start = null;
        }
        if (start === null) start = x;
        last = x;
      }
    if (start !== null) runs.push({ left: start, right: last! });
    const candidates = runs
      .filter((r) => r.right - r.left + 1 >= road.minWidthPixels)
      .map((r) => ({ ...r, center: (r.left + r.right) / 2 }))
      .sort((a, b) => Math.abs(a.center - cam.centerXPixels) - Math.abs(b.center - cam.centerXPixels));
    requireInput(
      candidates.length &&
        (!candidates[1] ||
          Math.abs(candidates[0]!.center - cam.centerXPixels) !== Math.abs(candidates[1].center - cam.centerXPixels)),
      '/road/rows',
      'Road run missing or ambiguous',
    );
    const r = candidates[0]!,
      z = (cam.focalLengthPixels * cam.heightMeters) / (y - horizon);
    return {
      y,
      ...r,
      z,
      x: ((r.center - cam.centerXPixels) * z) / cam.focalLengthPixels,
      widthMeters: ((r.right - r.left + 1) * z) / cam.focalLengthPixels,
    };
  });
  integer(hud.digitWidth, '/hud/digitWidth', 1, 64);
  integer(hud.digitHeight, '/hud/digitHeight', 1, 64);
  integer(hud.spacing, '/hud/spacing', 0, 64);
  integer(hud.count, '/hud/count', 1, 4);
  integer(hud.x, '/hud/x', 0, w - hud.count * hud.digitWidth - (hud.count - 1) * hud.spacing);
  integer(hud.y, '/hud/y', 0, h - hud.digitHeight);
  finite(hud.maxMismatchFraction, '/hud/maxMismatchFraction', 0, 0.49);
  requireInput(
    hud.templates && Object.keys(hud.templates).sort().join('') === '0123456789',
    '/hud/templates',
    'Provide all ten aligned binary digit templates',
  );
  for (const rows of Object.values(hud.templates))
    requireInput(
      Array.isArray(rows) &&
        rows.length === hud.digitHeight &&
        rows.every((r) => typeof r === 'string' && r.length === hud.digitWidth && /^[01]+$/.test(r)),
      '/hud/templates',
      'Template dimensions must match HUD cells',
    );
  let digits = '';
  const mismatches = [];
  for (let i = 0; i < hud.count; i++) {
    const bits = Array.from({ length: hud.digitHeight }, (_, y) =>
      Array.from({ length: hud.digitWidth }, (_, x) =>
        matches(hud.x + i * (hud.digitWidth + hud.spacing) + x, hud.y + y, hud) ? '1' : '0',
      ).join(''),
    ).join('');
    if (!bits.includes('1') && !digits) {
      mismatches.push(0);
      continue;
    }
    const scores = Object.entries(hud.templates)
      .map(([digit, rows]) => ({
        digit,
        error: [...rows.join('')].reduce((sum, b, j) => sum + Number(b !== bits[j]), 0) / bits.length,
      }))
      .sort((a, b) => a.error - b.error || a.digit.localeCompare(b.digit));
    requireInput(
      scores[0]!.error <= hud.maxMismatchFraction && scores[0]!.error < scores[1]!.error,
      '/hud',
      'HUD digit missing or ambiguous',
    );
    digits += scores[0]!.digit;
    mismatches.push(scores[0]!.error);
  }
  requireInput(digits.length, '/hud', 'HUD speed is blank');
  const [a, b, d] = quadratic(centers);
  return {
    horizonPixels: horizon,
    roadCenters: centers,
    speedKph: Number(digits),
    hudMismatchFractions: mismatches,
    curvaturePerMeter: (2 * d) / (1 + b * b) ** 1.5,
    grade: (cam.horizonReferencePixels - horizon) / cam.focalLengthPixels,
    roadWidthMeters: median(centers.map((p) => p.widthMeters)),
    fitResidualMeters: Math.sqrt(
      centers.reduce((v, p) => v + (p.x - a - b * p.z - d * p.z * p.z) ** 2, 0) / centers.length,
    ),
  };
}
const [file, ...args] = process.argv.slice(2);
try {
  requireInput(
    file,
    '/arguments',
    'Usage: node --import tsx tools/course/measure.ts request.json --out observations.json',
  );
  const opts = options(args, ['--out']);
  requireInput(opts.has('--out'), '/out', 'Observation output is required');
  const request = (await jsonFile(file)).value as MeasurementRequest;
  requireInput(
    request.format === 'superoutride.frame-measurement' && request.version === 1,
    '/format',
    'Expected frame-measurement v1',
  );
  requireInput(
    Array.isArray(request.frames) && request.frames.length >= 2 && request.frames.length <= 4096,
    '/frames',
    'Require 2–4096 calibrated PNG frames',
  );
  const measurements = [];
  let station = 0;
  for (const [i, frame] of request.frames.entries()) {
    finite(frame.timeSeconds, `/frames/${i}/timeSeconds`, 0);
    requireInput(!i || frame.timeSeconds > request.frames[i - 1]!.timeSeconds, '/frames', 'Frame times must increase');
    const bytes = await readFile(path.resolve(path.dirname(file), frame.path));
    requireInput(
      bytes.length >= 24 &&
        bytes.length <= 16 * 1024 * 1024 &&
        bytes.readUInt32BE(16) * bytes.readUInt32BE(20) <= 4194304,
      '/frames',
      'PNG exceeds measurement limits',
    );
    const value = measure(PNG.sync.read(bytes), request.calibration);
    if (i)
      station +=
        ((value.speedKph + measurements.at(-1)!.speedKph) / 2 / 3.6) *
        (frame.timeSeconds - request.frames[i - 1]!.timeSeconds);
    measurements.push({
      path: frame.path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      timeSeconds: frame.timeSeconds,
      s: station,
      ...value,
    });
  }
  const observations = readObservations({
    format: 'superoutride.course-observations',
    version: 1,
    id: request.id,
    source: request.source,
    calibration: { method: 'palette-scanlines/aligned-digit-mask/planar-pinhole-quadratic-v1', ...request.calibration },
    samples: measurements.map((m) => ({
      s: m.s,
      timeSeconds: m.timeSeconds,
      curvaturePerMeter: m.curvaturePerMeter,
      grade: m.grade,
      roadWidthMeters: m.roadWidthMeters,
      heightMeters: null,
    })),
    sceneryRows: [],
    environments: [{ s: 0, label: request.environmentLabel }],
    checkpoints: [],
    remasterDeviations: [
      'Planar pinhole road fitting assumes known camera height and attitude; horizon shift approximates grade. HUD speed integrates distance. Inspect residuals and annotate scenery, environments and checkpoints before fitting.',
    ],
    measurements,
  });
  await atomicWrite(opts.get('--out')!, JSON.stringify(observations, null, 2) + '\n');
  console.log(
    JSON.stringify({
      ok: true,
      output: path.resolve(opts.get('--out')!),
      frames: measurements.length,
      lengthMeters: station,
    }),
  );
} catch (error) {
  reportError(error);
}
