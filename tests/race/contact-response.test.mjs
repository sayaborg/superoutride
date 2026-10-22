import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadVehicleDefinitions, loadVehicleSpriteLibrary } from '../../src/content/vehicle-catalog.js';
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
const sprites = await loadVehicleSpriteLibrary(content);
const materials = await loadSurfaceMaterials(content);
const freePlay = await loadFreePlayRules(content);
const course = await loadDeliveredCourse(content, 'tsukuba', materials);
const original = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
const idle = { steering: 0, throttle: false, brake: false };
const throttle = { ...idle, throttle: true };

async function run(enabled = true, rivals = 0) {
  const listing = compileVehicleListingDocument(
    { ...original.listing, ...(enabled ? { contactResponse: 'explode' } : {}) },
    'contact-response fixture',
    sprites,
    sounds,
  );
  assert.ok(listing.ok);
  const entry = { ...original, listing: listing.value.source };
  const vehicles = definitions.vehicles.map((v) => (v === original ? entry : v));
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

function place(scene, actor, s, l, yawOffset = 0) {
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
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    frontWheelOmega: 0,
    rearWheelOmega: 0,
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
  assert.equal(actor.vehicle.speed, 0);
  const position = { x: actor.vehicle.x, y: actor.vehicle.y, z: actor.vehicle.z };
  const crossings = race.player.crossingSeconds.length;
  const clock = race.clock.elapsedSeconds;
  for (let i = 0; i < 125; i++) {
    race.recoverPlayer();
    race.advance(throttle);
    assert.equal(actor.contactResponse.sequence, 1);
    assert.equal(actor.vehicle.speed, 0);
    assert.deepEqual({ x: actor.vehicle.x, y: actor.vehicle.y, z: actor.vehicle.z }, position);
  }
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
    const log = createContactLog('player', () => beginContactResponse(state, actor.vehicle));
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
