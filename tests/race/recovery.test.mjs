import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { normalizeCoursePositions } from '../../tools/authoring/course-joints.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { formPool } from '../../src/race/free-play-field.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { routeSectionS } from '../../src/course/course-route.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';
import { RECOVERY_POLICY, createRecoveryState } from '../../src/race/recovery.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { createBodyContacts, createContactFaces } from '../../src/race/body-contacts.js';
import { createContactLog } from '../../src/race/contact-log.js';
import { createContactResponse } from '../../src/race/contact-response.js';
import { advancePresentVehicle, createPresentVehicle } from '../../src/race/present-vehicle.js';
import { driverSteering } from '../../src/vehicle/steering-rule.js';
import { SIM_DT } from '../../src/race/fixed-step.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const sounds = await loadEngineSounds(content);
const definitions = await loadVehicleDefinitions(content, sounds);
const freePlay = await loadFreePlayRules(content);
const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay };
const TESTAROSSA = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
const idle = { steering: 0, throttle: false, brake: false };
const throttle = { ...idle, throttle: true };
const braked = { ...idle, brake: true };

const LANE = 5;
const RUNOFF = 8;
/**
 * Sector 2's hole in its right runoff, lanes keeping their material: none from 1 m to 7 m right of its right lane, from
 * 100 m to 104 m into its straight, opening from 4 m right of the lane 4 m before and closing 4 m after, since the
 * material's edges are continuous.
 */
const HOLE = { open: 96, from: 100, to: 104, close: 108, near: 1, far: 7, middle: 4 };
/** Sector 2's invisible solid wall, its ends free: 3 m right of its right lane, from 20 m to 80 m into its straight. */
const WALL = { from: 20, to: 80, offset: 3 };

/**
 * A synthetic flat circuit of three Sections, each a 200 m straight and a 120° right arc of 80 m radius with two lanes
 * and 8 m of runoff each side. Sector 2 has a hole in its right runoff and a solid wall beside its right lane; Sector 3
 * is DIRT on its left half and SAND on its right.
 */
function ring() {
  const id = (k) => `sector-${k + 1}`;
  const strip = (k, start, end, left, right, material = 'ASPHALT') => ({
    kind: 'strip',
    start: { joint: `s${k}`, offset: start },
    end: end === null ? { joint: 'end', offset: 0 } : { joint: `s${k}`, offset: end },
    left,
    right,
    color: 12683,
    material,
  });
  const outerLeft = { lane: 'a', side: 'left', offset: -RUNOFF };
  const outerRight = { lane: 'b', side: 'right', offset: RUNOFF };
  const document = {
    format: 'superoutride.course',
    version: 61,
    name: 'RING',
    entry: id(0),
    maxLaps: 3,
    bearing: 0,
    sections: [0, 1, 2].map((k) => ({
      id: id(k),
      plan: [
        { kind: 'straight', id: `s${k}`, length: 200 },
        { kind: 'arc', id: `c${k}`, length: (80 * 2 * Math.PI) / 3, radius: 80, turn: 'right' },
      ],
      profile: [
        { at: { joint: `s${k}`, offset: 0 }, y: 0, curveLength: 0 },
        { at: { joint: 'end', offset: 0 }, y: 0, curveLength: 0 },
      ],
      lanes: [
        { kind: 'lane', id: 'a', width: LANE },
        { kind: 'lane', id: 'b', width: LANE },
      ],
      centerLane: 'a',
      centerLateral: -LANE / 2,
      boundaries:
        k === 1
          ? [
              ...['left', 'right'].map((side) => ({
                id: `hole-${side}`,
                knots: [
                  [HOLE.open, HOLE.middle],
                  [HOLE.from, side === 'left' ? HOLE.near : HOLE.far],
                  [HOLE.to, side === 'left' ? HOLE.near : HOLE.far],
                  [HOLE.close, HOLE.middle],
                ].map(([offset, lateral]) => ({
                  at: { joint: 's1', offset },
                  lateral: { lane: 'b', side: 'right', offset: lateral },
                })),
              })),
              {
                id: 'rail',
                knots: [WALL.from, WALL.to].map((offset) => ({
                  at: { joint: 's1', offset },
                  lateral: { lane: 'b', side: 'right', offset: WALL.offset },
                })),
              },
            ]
          : [],
      strips:
        k === 1
          ? [
              strip(k, 0, HOLE.open, outerLeft, outerRight),
              strip(k, HOLE.open, HOLE.close, outerLeft, { boundary: 'hole-left', offset: 0 }),
              strip(k, HOLE.open, HOLE.close, { boundary: 'hole-right', offset: 0 }, outerRight),
              strip(k, HOLE.close, null, outerLeft, outerRight),
            ]
          : k === 2
            ? [
                strip(k, 0, null, outerLeft, { lane: 'a', side: 'right', offset: 0 }, 'DIRT'),
                strip(k, 0, null, { lane: 'b', side: 'left', offset: 0 }, outerRight, 'SAND'),
              ]
            : [strip(k, 0, null, outerLeft, outerRight)],
      walls:
        k === 1
          ? [
              {
                boundary: 'rail',
                start: { joint: 's1', offset: WALL.from },
                end: { joint: 's1', offset: WALL.to },
                solid: { freeStart: 0.3, freeEnd: 0.3 },
                strips: [],
              },
            ]
          : [],
      openLimits: [],
      sprites: [],
      environments: [
        {
          at: { joint: `s${k}`, offset: 0 },
          name: 'RING',
          background: { image: 'tsukuba-sky', horizonY: 320, yawOrigin: 0 },
          transition: 0,
        },
      ],
      gates: [
        ...(k === 0
          ? [
              {
                kind: 'start',
                grid: Array.from({ length: 16 }, (_, slot) => ({
                  at: { joint: `s${k}`, offset: 150 - 6 * slot },
                  lateral: { lane: slot % 2 ? 'b' : 'a', side: 'center', offset: 0 },
                })),
                bikeGrid: null,
              },
            ]
          : []),
        k === 2
          ? { kind: 'finish', id: 'RING-FINISH', at: { joint: 'end', offset: 0 } }
          : { kind: 'checkpoint', id: `RING-CP${k + 1}`, at: { joint: 'end', offset: 0 } },
      ],
    })),
    links: [0, 1, 2].map((k) => ({
      id: `${id(k)}-to-${id((k + 1) % 3)}`,
      from: { section: id(k), lane: 'a' },
      to: id((k + 1) % 3),
    })),
  };
  return normalizeCoursePositions(document).document;
}

const template = content.manifest.files.find((file) => file.kind === 'course' && file.id === 'tsukuba');
// The ring is delivered alone, without measured products: its drivers drive its centre line.
const files = content.manifest.files.filter((file) => file.kind !== 'racing-line');
const delivered = {
  ...content,
  manifest: { ...content.manifest, files: [...files, { ...template, id: 'ring' }] },
  bytes: async (kind, id) =>
    kind === 'course' && id === 'ring' ? new TextEncoder().encode(JSON.stringify(ring())) : content.bytes(kind, id),
};
const course = await loadDeliveredCourse(delivered, 'ring', materials);

/** A FREE PLAY run on the ring with `rivals` rivals, through READY to GO. */
async function run({ rivals = 0, entry = TESTAROSSA, ready = idle } = {}) {
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  const prepared = await prepareRun(delivered, catalog, course, null, {
    mode: 'FREE_PLAY',
    vehicleId: entry.compiledVehicle.id,
    color: null,
    lapCount: 1,
    rivalCount: rivals,
    rivalPool: formPool(freePlay, entry).id,
    traffic: 'OFF',
  });
  const race = createCourseRace({ setup: prepared.resolve(0), runtime: scene.runtime });
  race.start();
  while (race.outcome.status === 'READY') race.advance(ready);
  return { race, scene, actor: race.player.actor };
}

/** Route station `offset` metres into Sector 2's straight. */
const sector2 = (scene, offset) =>
  scene.runtime.route.occurrences.find((o) => o.section.id === 'sector-2').start + offset;

/** Native lateral of a lane's centre and edges at the start of Sector 2 (lanes keep their widths throughout). */
const lane = (name) => ({ a: -LANE / 2, b: LANE / 2 })[name];

/**
 * Stand the present vehicle `body` at rest at route (s, l), yawed `yawOffset` from the road and pitched `pitch`, its
 * centre of gravity `drop` metres below its ride height, with speed `speed` along the road and `sideways` across it.
 */
function place(scene, body, s, l, { yawOffset = 0, pitch = 0, drop = 0, speed = 0, sideways = 0 } = {}) {
  const { vehicle, model } = body;
  // The ring is flat at height 0: the road's direction from its lane, the point wherever it is, material or none.
  const surface = supportedTargetSurface(scene.world, s, lane('a'));
  const point = scene.world.coordinates.toWorld(s, l, createPlanCoordinateSample());
  const height = model.compiledVehicle.desiredCgHeight - drop;
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z) + yawOffset;
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  Object.assign(vehicle, {
    x: point.x,
    y: height,
    z: point.z,
    yaw,
    pitch: surface.gradeAngle + pitch,
    yawRate: 0,
    pitchRate: 0,
    velocityX: surface.horizontalTangent.x * speed + right.x * sideways,
    velocityY: 0,
    velocityZ: surface.horizontalTangent.z * speed + right.z * sideways,
    frontWheelOmega: speed / model.compiledVehicle.frontStation.rollingRadius,
    rearWheelOmega: speed / model.compiledVehicle.rearStation.rollingRadius,
  });
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
  // Placed, it swept nothing to get there.
  body.previous.s = vehicle.course.s;
  body.previous.l = vehicle.course.l;
}

const speedOf = (vehicle) => Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);

/** The lane centres of the ring's two lanes, route laterals at route station `s` (lateral origin included). */
function laneCentres(scene, s) {
  const occurrence = scene.runtime.route.at(s);
  const at = routeSectionS(occurrence, s);
  return occurrence.section.lanes.elements
    .filter((element) => element.kind === 'lane')
    .map(({ lane }) => courseBoundaryAt(lane.center, at) - occurrence.lateralOrigin);
}

/**
 * Advance under `input` until a step recovers the player, at most `limit` steps: the steps taken, for each step that
 * did not recover whether it counts as stuck (drive reaching the wheels below the stuck speed), and the step's reason.
 */
function untilRecovered(race, actor, input, limit) {
  const counted = [];
  for (let step = 1; step <= limit; step++) {
    if (race.advance(input).recovered) return { step, counted, reason: actor.recovery.lastReason };
    const { vehicle } = actor;
    counted.push(vehicle.control.driveTorque > 0 && speedOf(vehicle) < RECOVERY_POLICY.stuckSpeed);
  }
  return { step: null, counted, reason: null };
}

/** Assert the recovery of a stuck vehicle: on the 44th consecutive step of drive below the stuck speed. */
function assertStuck({ step, counted, reason }) {
  assert.equal(reason, 'stuck');
  const run = counted.length - counted.lastIndexOf(false) - 1;
  assert.equal(run, RECOVERY_POLICY.holdSteps - 1, `recovered at step ${step} after ${run} counted steps`);
}

/** Assert the one recovery method: at rest, on the centre of the lane nearest where it was. */
function assertRecoveredAtRest(scene, actor, fromL) {
  const { vehicle } = actor;
  assert.equal(vehicle.speed, 0);
  assert.equal(vehicle.frontWheelOmega, 0);
  assert.equal(vehicle.rearWheelOmega, 0);
  const centres = laneCentres(scene, vehicle.course.s);
  const nearest = centres.reduce((a, b) => (Math.abs(b - fromL) < Math.abs(a - fromL) ? b : a));
  assert.ok(Math.abs(vehicle.course.l - nearest) < 1e-6, `${vehicle.course.l} for ${fromL}`);
}

test('a vehicle over material-free ground falls, and recovers once its CG is 3 m below the ground', async () => {
  const { race, scene, actor } = await run();
  const s = sector2(scene, (HOLE.from + HOLE.to) / 2);
  const l = lane('b') + LANE / 2 + HOLE.middle;
  place(scene, race.player.body, s, l);
  // The ring is flat at height 0: the centre of gravity's depth below the ground is -y.
  const depths = [];
  let reason = null;
  for (let i = 0; i < 120 && reason === null; i++)
    if (race.advance(idle).recovered) reason = actor.recovery.lastReason;
    else depths.push(-actor.vehicle.y);
  assert.equal(reason, 'fallen');
  // It fell through the ground and on, unrecovered while 3 m or less below it, and recovered in the step past it.
  assert.ok(depths.some((d) => d > 0 && d < 1));
  assert.ok(depths.every((d) => d <= RECOVERY_POLICY.fallDepth));
  assert.ok(depths.at(-1) > RECOVERY_POLICY.fallDepth - 0.2, `${depths.at(-1)}`);
  assertRecoveredAtRest(scene, actor, l);
  assert.ok(actor.vehicle.course.s < sector2(scene, HOLE.open));
});

test('a supported, upright vehicle over 3 m below the ground recovers, and one under 3 m does not', async () => {
  for (const [drop, recovers] of [
    [RECOVERY_POLICY.fallDepth + 0.6, true],
    [RECOVERY_POLICY.fallDepth - 0.6, false],
  ]) {
    const { race, scene, actor } = await run();
    const s = sector2(scene, 150);
    const { desiredCgHeight } = actor.model.compiledVehicle;
    // Its suspension reaches up to the ground: it is supported there.
    place(scene, race.player.body, s, lane('a'), { drop: drop + desiredCgHeight });
    const recovered = race.advance(idle).recovered;
    assert.equal(recovered, recovers, `${drop} m below`);
    if (recovers) {
      assert.equal(actor.recovery.lastReason, 'fallen');
      assertRecoveredAtRest(scene, actor, lane('a'));
    }
  }
});

test('a vehicle landed inverted below the ground recovers as overturned, before it counts as fallen', async () => {
  const { race, scene, actor } = await run();
  const s = sector2(scene, 150);
  place(scene, race.player.body, s, lane('a'), { pitch: Math.PI, drop: RECOVERY_POLICY.fallDepth + 2 });
  assert.equal(race.advance(idle).recovered, true);
  assert.equal(actor.recovery.lastReason, 'overturned');
  assertRecoveredAtRest(scene, actor, lane('a'));
});

test('a vehicle held while drive reaches its wheels recovers on the 44th counted step, whatever holds it', async () => {
  // Nose first against the left course limit, the solid wall's line and its free end, a fixed object.
  const holds = [
    { name: 'course limit', offset: 150, l: lane('a') - LANE / 2 - RUNOFF, yawOffset: -Math.PI / 2 },
    { name: 'wall line', offset: 50, l: lane('b') + LANE / 2 + WALL.offset, yawOffset: Math.PI / 2 },
    { name: 'wall end', offset: WALL.to, l: lane('b') + LANE / 2 + WALL.offset, yawOffset: Math.PI, along: true },
  ];
  for (const hold of holds) {
    const { race, scene, actor } = await run();
    const { frontAxle } = actor.model.compiledVehicle;
    // Its front axle a little short of the line, or of the free end along the road.
    const reach = frontAxle + 0.3;
    const s = sector2(scene, hold.offset) + (hold.along ? reach : 0);
    const l = hold.along ? hold.l : hold.l - Math.sign(hold.yawOffset) * reach;
    place(scene, race.player.body, s, l, { yawOffset: hold.yawOffset });
    const result = untilRecovered(race, actor, throttle, 600);
    assertStuck(result);
    assertRecoveredAtRest(scene, actor, l);
  }
});

test('two vehicles pushing head on both recover', async () => {
  const { scene } = await run();
  // Two present vehicles alone, nose to nose, both with the throttle open, through the race's own contacts and step.
  const prepared = await prepareRun(delivered, catalog, course, null, {
    mode: 'FREE_PLAY',
    vehicleId: TESTAROSSA.compiledVehicle.id,
    color: null,
    lapCount: 1,
    rivalCount: 0,
    rivalPool: formPool(freePlay, TESTAROSSA).id,
    traffic: 'OFF',
  });
  const setup = prepared.resolve(0);
  const { vehicle: entry } = setup.entries[0];
  const { model } = setup.mechanicsOf(entry);
  const steering = driverSteering(entry.drivingDefinition.compiledDriving.defaultSteering, model);
  const faces = createContactFaces(scene.runtime.readers.coordinates, setup.bodyContact);
  const contacts = createBodyContacts(faces, SIM_DT, createContactLog('A'));
  const s = sector2(scene, 150);
  scene.runtime.refresh(s - 50, s + 50);
  const bodies = ['A', 'B'].map((id) => {
    const vehicle = createVehicle(model, scene.runtime.readers, { s, l: lane('a'), initialSpeed: 0 });
    const actor = {
      vehicle,
      model,
      recovery: createRecoveryState(vehicle),
      contactResponse: createContactResponse(undefined),
    };
    return createPresentVehicle(id, actor, null, steering, (_, at) => ({ s: at, l: lane('a') }));
  });
  place(scene, bodies[0], s, lane('a'), { yawOffset: Math.PI });
  place(scene, bodies[1], s - model.compiledVehicle.footprint + 0.2, lane('a'));
  const reasons = [null, null];
  for (let i = 0; i < 300 && reasons.includes(null); i++) {
    faces.beginStep();
    contacts(bodies);
    for (const [k, body] of bodies.entries()) {
      advancePresentVehicle(scene.runtime.readers, body, throttle, body.step.steering);
      if (body.recovered) reasons[k] ??= body.actor.recovery.lastReason;
    }
  }
  assert.deepEqual(reasons, ['stuck', 'stuck']);
});

test('a vehicle at rest without throttle, braked, or sliding fast enough does not recover', async () => {
  // Let go at rest, and braked.
  for (const [input, l, yawOffset] of [
    [idle, lane('a'), 0],
    [braked, lane('a'), 0],
  ]) {
    const { race, scene, actor } = await run();
    place(scene, race.player.body, sector2(scene, 150), l, { yawOffset });
    const result = untilRecovered(race, actor, input, 300);
    assert.equal(result.step, null, `${JSON.stringify(input)} recovered: ${result.reason}`);
  }
  // Spinning across the road at speed with the throttle open, it slides on and drives away.
  const { race, scene, actor } = await run();
  place(scene, race.player.body, sector2(scene, 120), lane('a'), { yawOffset: 1.2, speed: 6, sideways: 4 });
  actor.vehicle.yawRate = 2.5;
  const result = untilRecovered(race, actor, { ...throttle, steering: 1 }, 300);
  assert.equal(result.step, null, `spinning recovered: ${result.reason}`);
});

test('an engine rising from idle, or too little throttle to rise, delivers no drive and counts no step', async (t) => {
  const NSR500 = definitions.vehicles.find((v) => v.compiledVehicle.id === 'NSR500_1987');
  // Sector 3 follows Sector 2's end; the Route loads it once a station there is resident.
  const sector3 = (scene, offset) => {
    const end = scene.runtime.route.occurrences.find((o) => o.section.id === 'sector-2').end;
    scene.runtime.refresh(end, end + offset);
    return scene.runtime.route.occurrences.find((o) => o.section.id === 'sector-3').start + offset;
  };
  for (const [material, l] of [
    ['DIRT', lane('a')],
    ['SAND', lane('b')],
  ]) {
    const { race, scene, actor } = await run({ entry: NSR500 });
    place(scene, race.player.body, sector3(scene, 100), l);
    let rising = 0,
      steps = 0;
    while (speedOf(actor.vehicle) < RECOVERY_POLICY.stuckSpeed) {
      race.advance(throttle);
      steps++;
      const drives = actor.vehicle.control.driveTorque > 0;
      if (!drives) rising++;
      // A step without drive is never counted.
      assert.ok(drives || actor.recovery.stuckSteps === 0, `${material}: step ${steps} counted without drive`);
      assert.equal(actor.recovery.recoveries, 0, `${material}: recovered at step ${steps}`);
    }
    t.diagnostic(`NSR500 on ${material}: ${steps} steps to ${RECOVERY_POLICY.stuckSpeed} m/s, ${rising} rising`);
  }
  // At 0.2 the opening stays below the idle-holding opening: the engine idles and nothing reaches the wheels.
  const { race, scene, actor } = await run({ entry: NSR500 });
  place(scene, race.player.body, sector2(scene, 150), lane('a'));
  for (let i = 0; i < 300; i++) {
    race.advance({ ...idle, throttle: 0.2 });
    assert.equal(actor.recovery.stuckSteps, 0);
  }
  assert.equal(actor.recovery.recoveries, 0);
});

test('READY does not count throttle, and the slowest vehicle starts from the grid without recovering', async (t) => {
  let slowest = { id: null, steps: 0 };
  for (const entry of definitions.vehicles)
    for (const ready of [idle, throttle]) {
      const { race, actor } = await run({ entry, ready });
      assert.equal(actor.recovery.stuckSteps, 0, `${entry.compiledVehicle.id}: READY counted`);
      // From GO with the throttle open, it moves faster than the stuck speed before 44 steps below it pass.
      let steps = 0;
      while (speedOf(actor.vehicle) < RECOVERY_POLICY.stuckSpeed && actor.recovery.recoveries === 0) {
        race.advance(throttle);
        steps++;
      }
      assert.equal(actor.recovery.recoveries, 0, `${entry.compiledVehicle.id} recovered at the start`);
      if (steps > slowest.steps) slowest = { id: entry.compiledVehicle.id, steps };
    }
  t.diagnostic(`slowest start: ${slowest.id}, ${slowest.steps} steps of ${RECOVERY_POLICY.holdSteps}`);
});

test('a recovered driver drives on from the lane nearest where it was', async () => {
  // A racing line driver takes the line from that lane's centre; a lane driver takes that lane as its own.
  for (const keepsLane of [false, true]) {
    const { race, scene } = await run({ rivals: 1 });
    const rival = race.rivals[0];
    const driving = rival.body.driving;
    if (keepsLane) {
      driving.intent.lane = 0;
      driving.intent.at = rival.actor.vehicle.course.s;
      driving.intent.offset = undefined;
      rival.body.driving = { ...driving, offset: null, target: (s) => race.forks.targetL(s, driving.intent) };
    }
    const s = sector2(scene, 150);
    const fromL = lane('b') + 1;
    place(scene, rival.body, s, fromL, { drop: RECOVERY_POLICY.fallDepth + 1 });
    race.advance(idle);
    assert.equal(rival.actor.recovery.lastReason, 'fallen');
    assertRecoveredAtRest(scene, rival.actor, fromL);
    const recovered = rival.actor.vehicle.course;
    // Its driver drives on in the next step from where it was placed.
    race.advance(idle);
    const target = rival.body.driving.target(recovered.s);
    assert.ok(Math.abs(target - recovered.l) < 1e-6, `heads for ${target}, not the lane centre ${recovered.l}`);
    if (keepsLane) assert.equal(rival.body.driving.intent.lane, 1);
    else assert.ok(rival.body.driving.offset !== null);
  }
});
