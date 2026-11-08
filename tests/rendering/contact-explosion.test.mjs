import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadContactExplosion } from '../../src/content/contact-explosion-pictures.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { createRunVehicle } from '../../src/content/run-vehicle.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createCompetitorObservation, writeCompetitorObservation } from '../../src/race/competitor-observation.js';
import { CONTACT_EXPLOSION } from '../../src/race/contact-response.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createContactExplosionSprites, explosionShowsVehicle } from '../../src/view/contact-explosion-sprites.js';
import { debrisAt } from '../../src/view/explosion-debris.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = await readDeliveredContent();
const explosion = await loadContactExplosion(content);
const { script } = explosion;

test("the race's explosion timing is its delivered script's: debris cleared, vehicle back, frames a second", () => {
  assert.equal(CONTACT_EXPLOSION.framesASecond, script.framesASecond);
  assert.equal(CONTACT_EXPLOSION.blastFrames, script.debris.cleared);
  assert.equal(CONTACT_EXPLOSION.recoveryFrames, script.recovers);
  assert.equal(CONTACT_EXPLOSION.blastSeconds, script.debris.cleared / script.framesASecond);
  assert.equal(CONTACT_EXPLOSION.recoverySeconds, script.recovers / script.framesASecond);
});

/** A script whose debris is thrown at frame 0 (pieces 0 and 4) and cleared late, by the delivered rule. */
const thrownAtOnce = {
  ...script,
  debris: { ...script.debris, thrown: [0, 1000, 1001, 1002], cleared: 1003 },
};

test("debris moves by the original's integers: each step, its drag, its gravity and its bounce", () => {
  const words = new Uint16Array(24);
  // Piece 0 (damped) and piece 4 (its throw's second): x 0x4000, y 0x2000, z 0x8000.
  words.set([0x4000, 0x2000, 0x8000], 0);
  words.set([0x4000, 0x2000, 0x8000], 12);
  const pieces = [];
  // Thrown: x speed 0x1000 and place 8; y speed 0x0800, place 4 (the second's 0xA000 → speed −0x1800, place −12);
  // z speed 0x2000 + 0x1000 = 0x3000, place 12.
  assert.equal(debrisAt(thrownAtOnce, words, 0, pieces), 2);
  assert.deepEqual(
    pieces.slice(0, 2).map(({ piece, across, along, up }) => [piece, across, along, up]),
    [
      [0, 0, 0, 0],
      [4, 0, -1, 0],
    ],
  );
  // One frame: x 8 + 0x100 = 264, y 4 + 0x80 = 132, z 12 + 0x300 = 780; units shifted right 6.
  debrisAt(thrownAtOnce, words, 1, pieces);
  assert.deepEqual([pieces[0].across, pieces[0].along, pieces[0].up], [264 >> 6, 132 >> 6, 780 >> 6]);
  // By hand, frame by frame: x's speed loses its step shifted right 1, z's 0xD0 more; z falls back, bounces.
  const hand = (frames, damped) => {
    let [z, vz] = [12, 0x3000];
    for (let n = 0; n < frames; n++) {
      const d = vz >> 4;
      z = ((z + d) << 16) >> 16;
      vz = ((vz - (d >> 1) - 0xd0) << 16) >> 16;
      if (z < 0) {
        z = -z;
        if (damped) vz >>= 2;
        if (vz < 0) vz = -vz;
      }
    }
    return z >> 6;
  };
  // Pieces 0 and 4 are damped, 1 and 5 not: the second throw at frame 0 too throws piece 1, from the same words.
  const both = { ...thrownAtOnce, debris: { ...thrownAtOnce.debris, thrown: [0, 0, 1001, 1002] } };
  words.set([0x4000, 0x2000, 0x8000], 3);
  for (const frames of [10, 40, 80, 120]) {
    assert.equal(debrisAt(both, words, frames, pieces), 4);
    const up = (piece) => pieces.find((p) => p.piece === piece).up;
    assert.equal(up(0), hand(frames, true), `piece 0 at ${frames}`);
    assert.equal(up(1), hand(frames, false), `piece 1 at ${frames}`);
  }
  // A damped piece bounces lower than an undamped one.
  const highest = (damped) => Math.max(...Array.from({ length: 160 }, (_, n) => (n > 90 ? hand(n, damped) : 0)));
  assert.ok(highest(true) < highest(false));
  assert.equal(debrisAt(script, words, script.debris.cleared, pieces), 0);
});

test("a stopped vehicle's explosion draws by its script: vehicle, fireball and debris, then nothing", async () => {
  const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const materials = await loadSurfaceMaterials(content);
  const course = await loadDeliveredCourse(content, 'tsukuba', materials);
  const entry = definitions.vehicles[0];
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const model = createVehicleModel(createRunVehicle(entry, definitions.driving), SIM_DT);
  const vehicle = createVehicle(model, scene.world, { s: 30, l: 0, initialSpeed: 0 });
  const actor = createCompetitorObservation(
    'effect',
    entry.compiledVehicle.id,
    entry.listing.visuals.palette,
    entry.listing.form,
  );
  const response = { phase: 'exploding', seconds: 0, sequence: 1, seed: 0x12345678, yaw: vehicle.yaw };
  const at = (frame, phase = frame < script.debris.cleared ? 'exploding' : 'recovering') => {
    response.phase = phase;
    response.seconds = (frame + 0.5) / script.framesASecond;
    writeCompetitorObservation(actor, vehicle, { steering: 0, throttle: false, brake: false }, 0, response);
  };
  at(0);
  const camera = updateCamera(createCameraRig(), scene.world, actor, CAMERA_DEFINITION, 'FACING');
  const explosions = createContactExplosionSprites(explosion);
  const vehicles = createRaceSprites(definitions.vehicles, (r) => explosionShowsVehicle(script, r));
  const drawn = (frame) => {
    at(frame);
    const sprites = explosions([actor], scene.world.coordinates);
    return {
      vehicle: vehicles([actor], camera, scene.world).length,
      fireball: sprites.filter((s) => s.name.startsWith('explosion-')),
      debris: sprites.filter((s) => s.name.startsWith('debris-')),
    };
  };
  // Frames 0 to 19 the vehicle stands, its first debris thrown at 8 and 13.
  for (const frame of [0, 7])
    assert.deepEqual([drawn(frame).vehicle, drawn(frame).fireball.length, drawn(frame).debris.length], [1, 0, 0]);
  assert.equal(drawn(8).debris.length, 2);
  assert.equal(drawn(13).debris.length, 4);
  // Frame 20 the fireball takes its place at its base point, and frame 21 the vehicle again.
  const fire = drawn(20);
  assert.equal(fire.vehicle, 0);
  assert.equal(fire.fireball.length, 1);
  assert.equal(fire.fireball[0].asset, explosion.pictures.get('polepos2-explosion-3-45'));
  assert.equal(fire.fireball[0].y, actor.renderY);
  assert.equal(drawn(21).vehicle, 1);
  // From 128 neither, the debris to 161; cleared at 162 and none while recovering.
  const hidden = drawn(128);
  assert.deepEqual([hidden.vehicle, hidden.fireball.length, hidden.debris.length], [0, 0, 8]);
  assert.equal(drawn(161).debris.length, 8);
  const cleared = drawn(162);
  assert.deepEqual([cleared.vehicle, cleared.fireball.length, cleared.debris.length], [0, 0, 0]);
  // The same explosion draws the same debris; another word, other debris.
  const place = () => drawn(60).debris.map((s) => [s.x, s.y, s.z]);
  const first = place();
  assert.deepEqual(place(), first);
  // The debris keeps the heading at the contact as the vehicle turns while it slides.
  const yaw = vehicle.yaw;
  vehicle.yaw = yaw + Math.PI / 2;
  assert.deepEqual(place(), first);
  response.yaw = yaw + Math.PI / 2;
  assert.notDeepEqual(place(), first);
  vehicle.yaw = response.yaw = yaw;
  response.seed = 0x9abcdef0;
  assert.notDeepEqual(place(), first);
  // Protected, the vehicle drives on and draws as ever.
  response.phase = 'protected';
  response.seconds = 0.5;
  writeCompetitorObservation(actor, vehicle, { steering: 0, throttle: false, brake: false }, 0, response);
  assert.equal(explosions([actor], scene.world.coordinates).length, 0);
  assert.equal(vehicles([actor], camera, scene.world).length, 1);
  // The scene renders the fireball over the road.
  const target = createLogicalFrame();
  scene.render(target, null, camera, [], [], []);
  const road = target.pixels.slice();
  scene.render(target, null, camera, [], drawn(100).fireball, []);
  assert.ok(target.pixels.filter((pixel, i) => pixel !== road[i]).length > 100);
});
