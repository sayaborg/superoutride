/** Exact-trace comparison across builds; timings are host diagnostics, not frame-rate certification. */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runHotPathProbe(buildPath = 'dist') {
  const load = (path) => import(pathToFileURL(resolve(buildPath, path)).href);
  const { VEHICLE_CATALOG } = await load('vehicle/vehicle-catalog.js');
  const { compileRasterPath } = await load('core/course.js');
  const { compileGuidePath } = await load('core/guide-curve.js');
  const { HeightProfile } = await load('visual/height-profile.js');
  const { SurfaceMap } = await load('physics/surface-map.js');
  const { createArcadeVehicle, updateArcadeVehicle } = await load('physics/arcade-vehicle-physics.js');
  const { solveWheelOmega } = await load('physics/tire-wheel.js');
  if (![2, 4].includes(createArcadeVehicle.length)) throw new Error('unknown vehicle constructor contract');
  const spawnProbeVehicle = (entry) =>
    createArcadeVehicle.length === 4
      ? createArcadeVehicle(
          entry.profile,
          guide,
          height,
          surface,
          500,
          0,
          15,
          undefined,
          undefined,
          entry.torqueProtection,
        )
      : createArcadeVehicle(
          entry.profile,
          { guide, height, surfaces: surface },
          {
            s: 500,
            l: 0,
            initialSpeed: 15,
            torqueProtection: entry.torqueProtection,
          },
        );
  const guide = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 10000 },
    ]),
    { lMax: 1000, mMin: 0.25, dCam: 5 },
  );
  const height = new HeightProfile(10000, [
    { s: 0, y: 0 },
    { s: 10000, y: 0 },
  ]);
  const surface = new SurfaceMap(10000, [
    { sStart: 0, name: 'equivalence', bands: [{ lMin: -1000, lMax: 1000, type: 'ASPHALT' }] },
  ]);
  const hash = createHash('sha256');
  const record = (value) => hash.update(JSON.stringify(value));
  let randomState = 0x723410;
  const random = () => (randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const started = performance.now();
  for (const entry of VEHICLE_CATALOG) {
    for (let i = 0; i < 128; i++) {
      record(
        solveWheelOmega({
          omegaPrevious: (random() - 0.5) * 600,
          inertia: 0.1 + random() * 10,
          rollingRadius: 0.1 + random(),
          longitudinalVelocity: (random() - 0.5) * 160,
          lateralVelocity: (random() - 0.5) * 100,
          normalLoad: i % 8 === 0 ? 0 : random() * 20000,
          gripFactor: i % 9 === 0 ? 0 : random() * 3,
          rollingResistance: random() * 0.04,
          driveTorque: (random() - 0.5) * 5000,
          brakeTorque: random() * 5000,
          dt: 1 / [60, 120, 240][i % 3],
          tire: entry.profile.frontStation.tire,
        }),
      );
    }
    for (const hz of [60, 120, 240])
      for (const turning of [false, true]) {
        const v = spawnProbeVehicle(entry);
        for (let tick = 0; tick < hz * 2; tick++) {
          const t = tick / hz;
          updateArcadeVehicle(
            guide,
            height,
            surface,
            v,
            { steering: turning ? 0.35 * Math.sin(4 * t) : 0, throttle: t < 0.7 ? 1 : 0, brake: t >= 1 ? 1 : 0 },
            1 / hz,
          );
          record(
            Object.fromEntries(
              Object.entries(Object.getOwnPropertyDescriptors(v))
                .filter(([key, d]) => 'value' in d && !['profile', 'torqueProtection'].includes(key))
                .map(([key, d]) => [key, d.value]),
            ),
          );
        }
      }
  }
  return {
    sha256: hash.digest('hex'),
    milliseconds: performance.now() - started,
    wheelCases: VEHICLE_CATALOG.length * 128,
    rates: [60, 120, 240],
    vehicles: VEHICLE_CATALOG.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await runHotPathProbe(process.argv[2] ?? 'dist')));
}
