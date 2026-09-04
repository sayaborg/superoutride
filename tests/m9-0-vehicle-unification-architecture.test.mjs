import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

test('M9.0 has one common solver and no retired vehicle solver import path', async () => {
  const common = await readFile(new URL('../src/physics/arcade-vehicle-physics.ts', import.meta.url), 'utf8');
  const sources = await Promise.all([
    'src/main-linear.ts',
    'src/main.ts',
    'src/main-circuit.ts',
    'src/gameplay/recovery.ts',
  ].map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));

  assert.doesNotMatch(common, /kind\s*===|kind\s*!==|case\s+['"](?:FR|MR|RR|AWD|BIKE1|BIKE2)|if\s*\([^)]*(?:FR|MR|RR|AWD|BIKE1|BIKE2)/);
  assert.doesNotMatch(common, /routeKind|CourseRouteKind|camera|screen/i);
  for (const source of sources) {
    assert.doesNotMatch(source, /physics\/(?:car-physics|motorcycle-physics)/);
  }
  for (const path of ['src/physics/car-physics.ts', 'src/physics/motorcycle-physics.ts']) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  }
  for (const path of ['dist/physics/car-physics.js', 'dist/physics/motorcycle-physics.js']) {
    await assert.rejects(access(new URL(`../${path}`, import.meta.url)));
  }
});

test('the complete derived ESM tree is cleaned before every build', async () => {
  const [packageJson, cleaner] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../tools/clean-dist.mjs', import.meta.url), 'utf8'),
  ]);
  const manifest = JSON.parse(packageJson);

  assert.match(manifest.scripts.build, /^node tools\/clean-dist\.mjs && tsc /);
  assert.match(cleaner, /new URL\(['"]\.\.\/dist\//);
  assert.match(cleaner, /recursive:\s*true/);
});

test('retired BIKE mechanics and compatibility authority are absent from general physics', async () => {
  const paths = [
    'src/physics/arcade-vehicle-physics.ts',
    'src/physics/vehicle-dynamics.ts',
    'src/physics/vehicle-profiles.ts',
  ];
  const combined = (await Promise.all(
    paths.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')),
  )).join('\n');

  assert.doesNotMatch(combined, /Quaternion|quaternion|crownRadius|riderKphi|riderKd|phiControlMax|omegaBody|rollInertia/);
  assert.doesNotMatch(combined, /compat|legacy.*(?:car|bike)|re-export/i);
  assert.doesNotMatch(combined, /\bABS\b|\bTCS\b|tractionControl|antiLock/i);
  assert.doesNotMatch(combined, /sprungRoll|bankAngle|deriveVehicleLean|sprite/i);
});

test('BIKE lean is a read-only render adapter with no route contact tire or force authority', async () => {
  const presentation = await readFile(
    new URL('../src/render/vehicle-presentation.ts', import.meta.url),
    'utf8',
  );
  assert.match(presentation, /yawRate/);
  assert.match(presentation, /longitudinalSpeed/);
  assert.doesNotMatch(presentation, /contact|tire|force|route|surface|updateArcadeVehicle/i);
});

test('canonical input stays device-independent while one common actuator owns response state', async () => {
  const [input, manager, pedalArbiter, steeringArbiter, actuator, dynamics] = await Promise.all([
    readFile(new URL('../src/input/driving-input.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/input/input-manager.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/input/pedal-input-arbiter.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/input/steering-input-arbiter.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/driving-actuator.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/physics/vehicle-dynamics.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(input, /steering:\s*number/);
  assert.match(input, /export type PedalRequest = boolean \| number/);
  assert.match(input, /throttle:\s*PedalRequest/);
  assert.match(input, /brake:\s*PedalRequest/);
  assert.match(input, /normalizedPedalRequest/);
  assert.match(input, /DrivingInputApplyMode = 'RATE_LIMITED' \| 'DIRECT'/);
  assert.doesNotMatch(input, /applyRate|releaseRate/);
  assert.doesNotMatch(input, /interface\s+DrivingActuatorState/);
  assert.match(manager, /PedalInputArbiter/);
  assert.match(manager, /SteeringInputArbiter/);
  assert.doesNotMatch(manager, /touchSteeringActive|digitalKeyboardSteering|digitalTouchSteering/);
  assert.match(pedalArbiter, /heldSources/);
  assert.match(pedalArbiter, /order/);
  assert.match(steeringArbiter, /ActiveSteeringSource/);
  assert.doesNotMatch(steeringArbiter, /camera|vehicle|route|physics|screen/i);
  assert.match(actuator, /interface DrivingActuatorState/);
  assert.match(actuator, /steering:\s*number/);
  assert.match(actuator, /throttle:\s*number/);
  assert.match(actuator, /brake:\s*number/);
  assert.doesNotMatch(actuator, /PedalInputArbiter|lastPressed|heldSources/);
  assert.doesNotMatch(dynamics, /requestedDriveTorque/);
});
