import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadCourse, loadCourseGround } from '../../tools/course/authoring-io.ts';
import { readVehicleSprites } from '../../tools/course/read-vehicle-sprites.ts';
import { createCourseScene } from '../../src/shell/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { browserSessionVehicle } from '../../src/shell/session-vehicle.js';
import { VEHICLE_CATALOG } from '../../src/vehicle/vehicle-catalog.js';
import { createArcadeVehicle } from '../../src/vehicle/physics/arcade-vehicle-physics.js';
import { createRecoveryState } from '../../src/race/recovery.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../src/race/envelope-driver.js';
import { createCameraRig, resetCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createDisplaySettings, BAND_RENDER_METHODS } from '../../src/view/display-settings.js';
import { SIM_DT } from '../../src/shell/frame-loop.js';
import { courseBoundaryAt } from '../../src/course/course-regions.js';
import { routeSectionS } from '../../src/course/course-route.js';

const idle = { steering: 0, throttle: false, brake: false };
const entry = VEHICLE_CATALOG.find((v) => v.profile.id === 'TESTAROSSA');
const configuration = browserSessionVehicle(entry);
const assets = await readVehicleSprites();
const { envelope } = JSON.parse(
  await readFile(new URL('../../dist/content/envelopes/TESTAROSSA.json', import.meta.url)),
);
const driver = compileEnvelopeDriver(envelope, 0.75, envelope.maximumSpeed);

export async function loadScenarioCourse(stem) {
  const { course } = await loadCourse(new URL(`../../content/courses/${stem}.course.json`, import.meta.url).pathname);
  return { course, ground: await loadCourseGround(course) };
}

// Every numeric leaf in live state, including nested wheel/control telemetry and derived getters.
// Immutable configuration is not live state; its admission belongs to the compiler.
function finiteState(value, path = '', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is not finite: ${value}`);
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (['profile', 'steeringCalibration', 'tireFrictionCalibration', 'torqueProtection'].includes(key)) continue;
      finiteState(child, `${path}.${key}`, seen);
    }
  }
}

function pavementBounds(scene, vehicle) {
  const occurrence = scene.runtime.route.at(vehicle.course.s);
  if (!occurrence) return null;
  const s = routeSectionS(occurrence, vehicle.course.s);
  const regions = occurrence.section.regionPartition.regions.filter(
    (r) => r.role === 'pavement' && r.start.s <= s && s <= r.end.s,
  );
  if (!regions.length) return null;
  return {
    left: Math.min(...regions.map((r) => courseBoundaryAt(r.left, s))) - occurrence.lateralOrigin,
    right: Math.max(...regions.map((r) => courseBoundaryAt(r.right, s))) - occurrence.lateralOrigin,
  };
}

/** Fresh product assembly per replay; only initial conditions and input policy differ from the browser. */
export function runScenario({ course, ground }, scenario) {
  const settings = createDisplaySettings();
  const scene = createCourseScene(course.entry, ground, assets, course.rules, settings);
  const session = resolveCourseSession(
    course,
    { mode: 'CUSTOM', rivalCount: scenario.rivals ?? 0, lapCount: scenario.laps ?? 1, countdown: false },
    configuration,
    envelope,
  );
  const slot = session.grid[0];
  const vehicle = createArcadeVehicle(entry.profile, scene.world, {
    ...configuration,
    s: slot.at.s,
    l: slot.l,
    initialSpeed: scenario.policy === 'reverse' ? -20 : scenario.policy === 'departure' ? 30 : 0,
  });
  const actor = { vehicle, recovery: createRecoveryState(vehicle) };
  const race = createCourseRace({
    session,
    player: actor,
    runtime: scene.runtime,
  });
  const competitors = [race.player, ...race.rivals];
  const rig = createCameraRig();
  const target = new SoftwareSurface(320, 240);
  const sprites = createRaceSprites(assets, configuration);
  const workspace = createEnvelopeDriverWorkspace();
  const digest = createHash('sha256');
  const evidence = {
    outsideEntry: false,
    outsideDomain: false,
    leftRoad: false,
    rightRoad: false,
    recoveries: [],
    choices: [],
    frames: 0,
    stoppedRivals: [],
  };
  const lane = (s) => {
    const occurrence = scene.runtime.route.at(s);
    const fork = occurrence?.section.fork;
    if (scenario.policy === 'closed' && fork && actor.recovery.recoveries === 0) {
      // Deliberately keep approaching the opposite road after a rival locks its choice.
      const road = fork.regions.at(-1).link.from.carriageway;
      const nativeS = routeSectionS(occurrence, s);
      const regions = road.regions.filter((r) => r.start.s <= nativeS && nativeS <= r.end.s);
      if (regions.length)
        return (
          (Math.min(...regions.map((r) => courseBoundaryAt(r.left, nativeS))) +
            Math.max(...regions.map((r) => courseBoundaryAt(r.right, nativeS)))) /
            2 -
          occurrence.lateralOrigin
        );
    }
    return race.forks.targetL(s, scenario.side ?? slot.l);
  };
  const entryPose = scene.world.coordinates.toWorld(0, 0, { x: 0, z: 0, s: 0, l: 0, heading: 0 });
  let camera;
  const render = () => {
    settings.setBandMethod(BAND_RENDER_METHODS[evidence.frames % BAND_RENDER_METHODS.length]);
    scene.render(target, vehicle, camera, configuration.kind, sprites(race.observe().rivals, camera));
    evidence.frames++;
  };
  race.start();
  let tick = 0;
  const maxTicks = Math.ceil(scenario.seconds / SIM_DT);
  const accepted = new Set();
  const stoppedTicks = competitors.map(() => 0);
  const progress = competitors.map(() => ({ next: -Infinity, finishes: 0 }));
  for (; tick < maxTicks; tick++) {
    const previous = competitors.map((c) => ({ s: c.actor.vehicle.course.s, recoveries: c.actor.recovery.recoveries }));
    let input;
    if (scenario.policy === 'reverse') input = idle;
    else if (scenario.policy === 'departure') input = { ...idle, steering: scenario.side, throttle: true };
    else if (scenario.waitForStop && evidence.recoveries.length && evidence.stoppedRivals.length < race.rivals.length)
      input = { ...idle, brake: true };
    else if (scenario.policy === 'closed' && tick * SIM_DT < 3) input = idle;
    else
      input = sampleEnvelopeDrivingInput(
        scene.world.coordinates,
        vehicle,
        driver,
        lane,
        workspace,
        scene.runtime.route,
      );
    const step = race.advance(input, SIM_DT);
    if (step.recovered) {
      resetCameraRig(rig);
      assert.equal(race.events.length, 0, 'recovery granted crossing credit');
      assert.equal(
        race.forks.legalTarget(vehicle.course.s, vehicle.course.l),
        null,
        'recovery left player on a closed road',
      );
    }
    for (const event of race.events) {
      const key = `${event.lap}:${event.landmark.id}`;
      assert.ok(!accepted.has(key), `crossing accepted twice: ${key}`);
      accepted.add(key);
    }
    camera = updateCamera(rig, scene.world, vehicle, CURRENT_CAMERA_PROFILE, SIM_DT);
    finiteState(camera, 'camera');
    for (const [index, c] of competitors.entries()) {
      const v = c.actor.vehicle;
      finiteState(v, c.id);
      finiteState(c.actor.recovery, `${c.id}.recovery`);
      const recovered = c.actor.recovery.recoveries !== previous[index].recoveries;
      // Same one-step coverage ceiling as the scene (240 m/s); never a physics clamp.
      if (!recovered && Math.abs(v.course.s - previous[index].s) > 240 * SIM_DT)
        assert.fail(`${c.id}: route s jumped at tick ${tick}: ${previous[index].s} -> ${v.course.s}`);
      if (index > 0 && c.progress.status === 'FINISHED' && scene.runtime.route.terminal !== null) {
        assert.ok(v.course.s < scene.runtime.route.terminal, `${c.id}: passed the terminal`);
        assert.ok(v.course.inDomain, `${c.id}: finished rival left the domain`);
        assert.ok(!recovered, `${c.id}: finished rival recovered`);
        const speed = Math.hypot(v.longitudinalSpeed, v.lateralSpeed);
        stoppedTicks[index] = speed < 0.05 ? stoppedTicks[index] + 1 : 0;
        if (stoppedTicks[index] >= 2 / SIM_DT && !evidence.stoppedRivals.some((r) => r.id === c.id))
          evidence.stoppedRivals.push({ id: c.id, s: v.course.s, terminal: scene.runtime.route.terminal, speed });
      }
      const next = c.progress.next?.s ?? (c.progress.status === 'FINISHED' ? Infinity : progress[index].next);
      assert.ok(next >= progress[index].next, `${c.id}: accepted crossing regressed at tick ${tick}`);
      assert.ok(c.progress.acceptedFinishCount >= progress[index].finishes, `${c.id}: finish count regressed`);
      progress[index] = { next, finishes: c.progress.acceptedFinishCount };
      if (recovered && index === 0) evidence.recoveries.push({ tick, reason: c.actor.recovery.lastReason });
      // Trace checks determinism across every step, excluding wall-clock performance metrics and pixels.
      digest.update(
        JSON.stringify(
          [v, c.actor.recovery, c.progress.s, Number.isFinite(next) ? next : null, c.progress.acceptedFinishCount],
          (key, value) =>
            ['profile', 'steeringCalibration', 'tireFrictionCalibration', 'torqueProtection'].includes(key)
              ? undefined
              : value,
        ),
      );
    }
    for (const occurrence of scene.runtime.route.occurrences) {
      finiteState(
        {
          start: occurrence.start,
          end: occurrence.end,
          ordinal: occurrence.ordinal,
          lateralOrigin: occurrence.lateralOrigin,
          worldFromSection: occurrence.worldFromSection,
          sectionFromWorld: occurrence.sectionFromWorld,
        },
        'route',
      );
      if (occurrence.incoming && !evidence.choices.includes(occurrence.incoming.id))
        evidence.choices.push(occurrence.incoming.id);
    }
    digest.update(JSON.stringify(camera));
    evidence.outsideEntry ||=
      (vehicle.x - entryPose.x) * Math.sin(entryPose.heading) +
        (vehicle.z - entryPose.z) * Math.cos(entryPose.heading) <
      0;
    evidence.outsideDomain ||= !vehicle.course.inDomain;
    const bounds = pavementBounds(scene, vehicle);
    if (bounds) {
      evidence.leftRoad ||= vehicle.course.l < bounds.left;
      evidence.rightRoad ||= vehicle.course.l > bounds.right;
    }
    if (
      tick % 60 === 0 ||
      step.recovered ||
      race.clock.status === 'GOAL' ||
      (!vehicle.course.inDomain && tick % 6 === 0)
    )
      render();
    if (
      race.clock.status === 'GOAL' ||
      ((scenario.policy === 'reverse' ||
        scenario.policy === 'departure' ||
        (scenario.policy === 'closed' && !scenario.finish)) &&
        evidence.recoveries.length)
    )
      break;
  }
  assert.ok(tick < maxTicks, `${scenario.name}: did not reach its outcome: ${JSON.stringify(evidence)}`);
  if (scenario.policy === 'reverse') assert.ok(evidence.outsideEntry, 'never backed beyond the entry');
  if (scenario.policy === 'reverse' || scenario.policy === 'departure') {
    assert.ok(evidence.outsideDomain, 'never left the coordinate domain');
    assert.equal(evidence.recoveries.at(-1)?.reason, 'outside-domain');
    assert.ok(vehicle.course.inDomain, 'recovery did not restore domain membership');
  }
  if (scenario.policy === 'departure')
    assert.ok(scenario.side < 0 ? evidence.leftRoad : evidence.rightRoad, 'never departed the requested side');
  if (scenario.policy === 'closed')
    assert.ok(
      evidence.recoveries.some((r) => r.reason === 'wrong-course'),
      'never entered the closed Carriageway',
    );
  if (scenario.finish) {
    assert.equal(race.clock.status, 'GOAL');
    if (scenario.waitForStop)
      assert.equal(
        evidence.stoppedRivals.length,
        race.rivals.length,
        'finished rivals did not stop before player finish',
      );
  }
  if (scenario.policy === 'finish') {
    assert.equal(race.clock.status, 'GOAL');
    assert.equal(race.player.progress.acceptedFinishCount, scenario.laps ?? 1);
    assert.equal(evidence.recoveries.length, 0, 'ordinary driving recovered');
    if (course.entry.fork)
      assert.equal(
        race.forks.choice(course.entry.fork),
        course.entry.fork.regions[scenario.side < 0 ? 0 : course.entry.fork.regions.length - 1].link,
      );
  }
  return {
    ...evidence,
    ticks: tick + 1,
    finishes: competitors.map((c) => c.progress.acceptedFinishCount),
    digest: digest.digest('hex'),
  };
}
