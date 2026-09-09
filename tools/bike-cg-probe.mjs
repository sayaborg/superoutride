/** Compare only authored CG height through the ordinary compiler and production solver. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileArcadeVehicleProfile } from '../dist/physics/vehicle-profiles.js';
import { runTerrainProbe } from './torque-protection-terrain-probe.mjs';

export async function compareBikeCg(baselinePath, ratios = [null, .3, .25, .2], rates = [120]) {
  const load = path => import(pathToFileURL(resolve(baselinePath, path)).href);
  const seeds = await load('vehicle/production-vehicle-profiles.js');
  const { VEHICLE_CATALOG } = await load('vehicle/vehicle-catalog.js');
  const rows = [];
  for (const entry of VEHICLE_CATALOG.filter(e => e.presentationFamily === 'BIKE')) {
    const seed = Object.entries(seeds).find(([key, value]) => key.endsWith('_AUTHORING') && value.id === entry.profile.id)[1];
    for (const ratio of ratios) {
      const h = ratio === null ? seed.desiredCgHeight : ratio * (seed.frontAxle + seed.rearAxle);
      const variant = { ...entry, profile: compileArcadeVehicleProfile({ ...seed, desiredCgHeight: h }) };
      for (const hz of rates) for (const grip of [1, .25]) for (const kind of ['brake', 'turnBrake', 'reversal']) {
        const result = runTerrainProbe(variant, { hz, grip, kind, speed: 30, seconds: 6 });
        delete result.rows;
        rows.push({ ratio, cgHeight: h, ...result });
      }
    }
  }
  return rows;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw new Error('usage: node tools/bike-cg-probe.mjs BASELINE_DIST OUT_JSON');
  const rows = await compareBikeCg(process.argv[2], [null, .3, .25, .2], [60, 120, 240]);
  await writeFile(process.argv[3], JSON.stringify({ node: process.version,
    scope: 'CG-only matched authoring, independent equilibrium starts; no recovery, force or state correction. Not global handling acceptance.', rows }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: rows.length, incomplete: rows.filter(r => !r.completed).length, overturned: rows.filter(r => r.overturned).length }));
}
