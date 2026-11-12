import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions, loadVehicleSpriteSets } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { compileVehicleListingDocument } from '../../src/vehicle/definition-document.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';
import { routeSectionS } from '../../src/course/course-route.js';
import { createContactLog } from '../../src/race/contact-log.js';
import {
  advanceContactResponse,
  beginContactResponse,
  createContactResponse,
} from '../../src/race/contact-response.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = await readDeliveredContent();
const sounds = await loadEngineSounds(content);
const definitions = await loadVehicleDefinitions(content, sounds);
const sprites = await loadVehicleSpriteSets(content);
const materials = await loadSurfaceMaterials(content);
const freePlay = await loadFreePlayRules(content);
const course = await loadDeliveredCourse(content, 'tsukuba', materials);
const original = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
const idle = { steering: 0, throttle: false, brake: false };
const throttle = { ...idle, throttle: true };

async function run(enabled = true, rivals = 0, source = original) {
  const listing = compileVehicleListingDocument(
    { ...source.listing, ...(enabled ? { contactResponse: 'explode' } : {}) },
    'contact-response fixture',
    sprites,
    sounds,
  );
  assert.ok(listing.ok);
  const entry = { ...source, listing: listing.value.source };
  const vehicles = definitions.vehicles.map((v) => (v === source ? entry : v));
  const scene = createCourseScene(course.entry, course.gates, vehicles);
  const prepared = await prepareRun(
    content,
    { vehicles, driving: definitions.driving, materials, freePlay },
    course,
    null,
    {
      mode: 'FREE_PLAY',
      vehicleId: entry.compiledVehicle.id,
      color: null,
      lapCount: 1,
      rivalCount: rivals,
      rivalPool: formPool(freePlay, entry).id,
      traffic: 'OFF',
    },
  );
  const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
  race.start();
  while (race.outcome.status === 'READY') race.advance(idle);
  return { race, scene, actor: race.player.actor };
}

function place(scene, actor, s, l, yawOffset = 0, speed = 0) {
  const { vehicle, model } = actor;
  const surface = supportedTargetSurface(scene.world, s, l);
  const height = model.compiledVehicle.desiredCgHeight;
  Object.assign(vehicle, {
    x: surface.point.x + surface.normal.x * height,
    y: surface.point.y + surface.normal.y * height,
    z: surface.point.z + surface.normal.z * height,
    yaw: Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z) + yawOffset,
    pitch: surface.gradeAngle,
    yawRate: 0,
    pitchRate: 0,
    velocityX: surface.tangent.x * speed,
    velocityY: surface.tangent.y * speed,
    velocityZ: surface.tangent.z * speed,
    frontWheelOmega: speed / model.compiledVehicle.frontStation.rollingRadius,
    rearWheelOmega: speed / model.compiledVehicle.rearStation.rollingRadius,
  });
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
}

function touchWall(scene, actor) {
  const s = actor.vehicle.course.s + 10;
  const occurrence = scene.runtime.route.at(s);
  const nativeS = routeSectionS(occurrence, s);
  const wall = occurrence.section.barriers.find((b) => b.keep === 1 && nativeS >= b.start && nativeS <= b.end);
  assert.ok(wall);
  place(
    scene,
    actor,
    s,
    wall.lateralAt(nativeS) - occurrence.lateralOrigin + actor.model.compiledVehicle.frontAxle - 0.6,
    -Math.PI / 2,
  );
}

test('listing admits only the explicit explosion policy and omission preserves the existing listing', () => {
  const admitted = compileVehicleListingDocument(original.listing, 'listing', sprites, sounds);
  assert.ok(admitted.ok);
  assert.deepEqual(admitted.value.source, original.listing);
  for (const contactResponse of [false, null, 'normal', {}, 1])
    assert.equal(
      compileVehicleListingDocument({ ...original.listing, contactResponse }, 'listing', sprites, sounds).ok,
      false,
    );
});

test('stationary solid contact explodes once, blocks controls and manual escape, then safely recovers without gate credit', async () => {
  const { race, scene, actor } = await run();
  touchWall(scene, actor);
  race.advance(throttle);
  const initial = race.observe().player.contactResponse;
  assert.equal(initial.phase, 'exploding');
  assert.equal(initial.sequence, 1);
  const crossings = race.player.crossingSeconds.length;
  const clock = race.clock.elapsedSeconds;
  const start = actor.vehicle.course.s;
  for (let i = 0; i < 161; i++) {
    race.recoverPlayer();
    race.advance(throttle);
    assert.equal(actor.contactResponse.sequence, 1);
    // Let go and braked, whatever the input: the wall pushes it off, but nothing drives it.
    const { control } = race.observe().player;
    assert.equal(control.throttle, 0);
    assert.ok(control.brake > 0);
    assert.ok(actor.vehicle.speed < 2, `${actor.vehicle.speed} m/s`);
  }
  assert.ok(Math.abs(actor.vehicle.course.s - start) < 1);
  assert.equal(actor.contactResponse.phase, 'recovering');
  let recovered = false;
  for (let i = 0; i < 25; i++) {
    const step = race.advance(idle);
    if (step.recovered) {
      recovered = true;
      assert.equal(actor.vehicle.speed, 0);
      assert.equal(actor.recovery.lastReason, 'explosion');
      assert.equal(race.events.length, 0);
      break;
    }
  }
  assert.ok(recovered);
  assert.equal(actor.contactResponse.phase, 'protected');
  assert.equal(race.player.crossingSeconds.length, crossings);
  assert.ok(race.clock.elapsedSeconds > clock + 2);
  for (let i = 0; i < 90; i++) race.advance(idle);
  assert.equal(actor.contactResponse.sequence, 1);
  assert.equal(actor.contactResponse.phase, 'driving');
  touchWall(scene, actor);
  race.advance(idle);
  assert.equal(actor.contactResponse.sequence, 2);
  assert.equal((await run()).actor.contactResponse.sequence, 0);
});

test('a contact at speed keeps the motion: it slides on braked by its physics, then recovers at rest', async () => {
  const { race, scene, actor } = await run();
  const s = actor.vehicle.course.s + 20;
  const occurrence = scene.runtime.route.at(s);
  const nativeS = routeSectionS(occurrence, s);
  const wall = occurrence.section.barriers.find((b) => b.keep === 1 && nativeS >= b.start && nativeS <= b.end);
  // Along the road at 25 m/s, its side a few centimetres into the left wall.
  const half = actor.model.compiledVehicle.footprint / 2;
  place(scene, actor, s, wall.lateralAt(nativeS) - occurrence.lateralOrigin + half - 0.05, 0, 25);
  race.advance(throttle);
  assert.equal(actor.contactResponse.phase, 'exploding');
  assert.ok(actor.vehicle.speed > 20, `${actor.vehicle.speed} m/s at the contact`);
  const from = actor.vehicle.course.s;
  const speeds = [actor.vehicle.speed];
  for (let i = 0; i < 160; i++) {
    race.advance(throttle);
    speeds.push(actor.vehicle.speed);
  }
  // Braked by its own tires: it slows throughout and slides on along the road.
  assert.ok(speeds.every((v, k) => k === 0 || v <= speeds[k - 1] + 0.05));
  assert.ok(speeds.at(-1) < speeds[0] - 10);
  assert.ok(actor.vehicle.course.s - from > 20, `${actor.vehicle.course.s - from} m`);
  let recovered = false;
  for (let i = 0; i < 25 && !recovered; i++) recovered = race.advance(idle).recovered;
  assert.ok(recovered);
  assert.equal(actor.vehicle.speed, 0);
  assert.equal(actor.contactResponse.phase, 'protected');
});

test('another vehicle triggers at zero speed; ordinary vehicles retain physical contact', async () => {
  const { race, scene, actor } = await run(true, 1);
  const other = race.rivals[0].actor;
  place(scene, actor, other.vehicle.course.s, other.vehicle.course.l);
  race.advance(idle);
  assert.ok(race.playerContacts.starts.some((s) => s.counterpart === 'vehicle'));
  assert.equal(actor.contactResponse.sequence, 1);
  const normal = await run(false);
  touchWall(normal.scene, normal.actor);
  for (let i = 0; i < 20; i++) normal.race.advance(idle);
  assert.equal(normal.actor.contactResponse.sequence, 0);
  assert.equal(normal.actor.contactResponse.phase, 'driving');
  assert.equal(normal.actor.recovery.recoveries, 0);
});

test('every solid counterpart uses the same response, occupied recovery waits, and protected contacts do not replay', async () => {
  const { actor } = await run();
  for (const counterpart of ['vehicle', 'wall', 'object', 'movable']) {
    const state = createContactResponse('explode');
    const log = createContactLog('player', () => beginContactResponse(state, actor.vehicle, () => 0));
    for (let i = 0; i < 400; i++) {
      log.start('player', counterpart, 0);
      advanceContactResponse(state, SIM_DT, () => false);
    }
    assert.equal(state.sequence, 1);
    assert.equal(state.phase, 'recovering');
    assert.equal(
      advanceContactResponse(state, SIM_DT, () => true),
      true,
    );
    for (let i = 0; i < 30; i++) {
      log.start('player', counterpart, 0);
      advanceContactResponse(state, SIM_DT, () => false);
    }
    assert.equal(state.sequence, 1);
    assert.equal(state.phase, 'protected');
  }
});

test('the delivered two-speed Lotus explodes on a stationary wall contact, recovers once and resets on a fresh run', async () => {
  const lotus = definitions.vehicles.find((v) => v.compiledVehicle.id === 'LOTUS_79_SPECIAL');
  assert.equal(lotus.listing.contactResponse, 'explode');
  assert.equal(lotus.compiledVehicle.powertrain.gearRatios.length, 2);
  const { race, scene, actor } = await run(true, 0, lotus);
  touchWall(scene, actor);
  race.advance(idle);
  assert.equal(actor.contactResponse.sequence, 1);
  assert.equal(actor.contactResponse.phase, 'exploding');
  // Pushed off the wall, braked: it moves slowly, not driven.
  assert.ok(actor.vehicle.speed < 2, `${actor.vehicle.speed} m/s`);
  const gates = race.player.crossingSeconds.length;
  for (let tick = 0; tick < 240; tick++) race.advance(idle);
  assert.equal(actor.contactResponse.sequence, 1);
  assert.equal(actor.contactResponse.phase, 'driving');
  assert.equal(actor.recovery.lastReason, 'explosion');
  assert.equal(race.player.crossingSeconds.length, gates);
  assert.equal((await run(true, 0, lotus)).actor.contactResponse.sequence, 0);
  for (const id of ['NSR500_1987', 'YZR500_0W98', 'MCLAREN_MP4_4', 'FERRARI_640']) {
    const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === id);
    assert.equal(entry.listing.contactResponse, undefined);
    const normal = await run(false, 0, entry);
    touchWall(normal.scene, normal.actor);
    normal.race.advance(idle);
    assert.equal(normal.actor.contactResponse.sequence, 0);
  }
});
