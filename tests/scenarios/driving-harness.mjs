import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { resolveCourseSession } from '../../src/race/course-session.js';
import { formPool, rivalPoolPairs } from '../../src/race/free-play-field.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../src/race/envelope-driver.js';
import { createCameraRig, resetCameraRig, updateCamera } from '../../src/view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../../src/view/current-camera-profile.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createDisplaySettings, STRIP_RENDER_METHODS } from '../../src/view/display-settings.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { courseBoundaryAt, courseCarriagewayExists } from '../../src/course/course-boundaries.js';
import { routeSectionS } from '../../src/course/course-route.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { readFileSync } from 'node:fs';
import { admitSeriesCourse, compileSeriesCatalog } from '../../src/content/series-catalog.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { readCourseTimeBudgets } from '../../src/content/course-time-budgets.js';
import { readPaceSchedule } from '../../src/content/pace-schedule.js';
import { raceStatusText } from '../../src/shell/race-status-hud.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));

const idle = { steering: 0, throttle: false, brake: false };
const entry = definitions.vehicles.find((v) => v.compiledVehicle.id === 'TESTAROSSA');
const configuration = createSessionVehicle(entry, definitions.driving, materials);
const { envelope } = await content.json('envelope', 'TESTAROSSA');
const driver = compileEnvelopeDriver(envelope, 0.75, envelope.maximumSpeed);
// FREE PLAY rivals come from the player's form pool, as in the browser, each with its own vehicle and envelope.
const rivalPool = rivalPoolPairs(definitions.vehicles, formPool(entry));
const fieldVehicles = new Map();
for (const id of new Set(rivalPool.map((pair) => pair.vehicle))) {
  const vehicle = createSessionVehicle(
    definitions.vehicles.find((v) => v.compiledVehicle.id === id),
    definitions.driving,
    materials,
  );
  fieldVehicles.set(id, { vehicle, envelope: (await content.json('envelope', id)).envelope });
}

// The test-only series (never delivered) gives each RIBBON course ARCADE settings that exercise Session rules with the
// build's TESTAROSSA time budgets and pace schedules.
const SCENARIO_SERIES_PATH = new URL('./session-rules.series.json', import.meta.url);
const scenarioSeries = requireLoaded(
  compileSeriesCatalog(
    [
      {
        id: 'scenario-rules',
        path: SCENARIO_SERIES_PATH.pathname,
        value: JSON.parse(readFileSync(SCENARIO_SERIES_PATH, 'utf8')),
        sha256: '',
      },
    ],
    ['ribbon-coast', 'ribbon-fork', 'ribbon-ring'],
    definitions.vehicles,
  ),
);

export async function loadScenarioCourse(stem) {
  const course = await loadDeliveredCourse(content, stem, materials);
  const settings = scenarioSeries.courseSettings(stem);
  const arcade = settings && requireLoaded(admitSeriesCourse(settings, course, SCENARIO_SERIES_PATH.pathname));
  const product = async (kind, read) =>
    requireLoaded(await read(course, configuration, await content.json(kind, `${stem}/TESTAROSSA`), kind));
  return {
    course,
    arcade,
    budgets: arcade && (await product('budget', readCourseTimeBudgets)),
    paceSchedule: arcade && (await product('schedule', readPaceSchedule)),
  };
}

// Every numeric leaf in live state, including nested wheel/control telemetry and derived getters.
// Vehicle state holds live values only; the vehicle model is admitted by its compiler.
function finiteState(value, path = '', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} is not finite: ${value}`);
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const [key, child] of Object.entries(value)) finiteState(child, `${path}.${key}`, seen);
  }
}

function pavementBounds(scene, vehicle) {
  const occurrence = scene.runtime.route.at(vehicle.course.s);
  if (!occurrence) return null;
  const s = routeSectionS(occurrence, vehicle.course.s);
  const roads = occurrence.section.carriageways.filter((r) =>
    courseCarriagewayExists(r, s, occurrence.section.coordinates.domain.end),
  );
  if (!roads.length) return null;
  return {
    left: Math.min(...roads.map((r) => courseBoundaryAt(r.left, s))) - occurrence.lateralOrigin,
    right: Math.max(...roads.map((r) => courseBoundaryAt(r.right, s))) - occurrence.lateralOrigin,
  };
}

/** Fresh product assembly per replay; only initial conditions and input policy differ from the browser. */
export function runScenario({ course, arcade, budgets, paceSchedule }, scenario) {
  const settings = createDisplaySettings();
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles, settings);
  // ARCADE takes the test series' settings for the course; TIME TRIAL and FREE PLAY take the scenario's.
  const mode = scenario.mode ?? 'FREE_PLAY';
  const session = resolveCourseSession(
    course,
    mode === 'ARCADE' ? arcade : null,
    {
      mode,
      rivalCount: mode === 'ARCADE' ? arcade.entries.length - 1 : (scenario.rivals ?? 0),
      lapCount: mode === 'ARCADE' ? arcade.laps : (scenario.laps ?? 1),
      timeLimit: mode === 'ARCADE',
      initialSpeed: scenario.policy === 'reverse' ? -20 : scenario.policy === 'departure' ? 30 : 0,
      seed: scenario.seed ?? 0,
    },
    configuration,
    envelope,
    mode === 'ARCADE' ? budgets : null,
    {
      rivalPool,
      vehicleOf: (id) => fieldVehicles.get(id) ?? { vehicle: configuration, envelope },
      paceSchedule: mode === 'ARCADE' ? paceSchedule : undefined,
    },
  );
  const slot = session.entries[0].slot;
  // The race builds every competitor, the player included; the harness reads their state for evidence.
  const race = createCourseRace({ session, runtime: scene.runtime });
  const { actor } = race.player;
  const { vehicle } = actor;
  const competitors = [race.player, ...race.rivals];
  const rig = createCameraRig();
  const target = createLogicalFrame();
  const visual = createVehicleSprites(entry);
  const sprites = createRaceSprites(definitions.vehicles);
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
  // The player's intent: the scenario's lane off forks and its target exit index at every fork.
  const intent = {
    lane: scenario.lane ?? slot.l,
    exit: () => {
      assert.ok(Number.isInteger(scenario.exit), `${scenario.name}: a fork needs the scenario's target exit`);
      return scenario.exit;
    },
  };
  const lane = (s) => {
    const occurrence = scene.runtime.route.at(s);
    const fork = occurrence?.section.fork;
    if (scenario.policy === 'closed' && fork && actor.recovery.recoveries === 0) {
      // Deliberately keep approaching the opposite road after a rival locks its choice.
      const road = fork.exits.at(-1).link.from.carriageway;
      const nativeS = routeSectionS(occurrence, s);
      if (courseCarriagewayExists(road, nativeS, occurrence.section.coordinates.domain.end))
        return (
          (courseBoundaryAt(road.left, nativeS) + courseBoundaryAt(road.right, nativeS)) / 2 - occurrence.lateralOrigin
        );
    }
    return race.forks.targetL(s, intent);
  };
  const entryPose = scene.world.coordinates.toWorld(0, 0, { x: 0, z: 0, s: 0, l: 0, heading: 0 });
  let camera;
  // Display and camera read only the race's borrowed competitor observations, as the browser does.
  const render = () => {
    settings.setStripMethod(STRIP_RENDER_METHODS[evidence.frames % STRIP_RENDER_METHODS.length]);
    const observed = race.observe();
    scene.render(
      target,
      observed.player,
      camera,
      observed.player.brakeLampOn ? visual.on : visual.off,
      sprites(observed.rivals, camera),
    );
    evidence.frames++;
  };
  race.start();
  let tick = 0;
  // Scenario seconds count from GO; READY runs through the same product start first.
  const maxTicks = Math.ceil((READY_SECONDS + scenario.seconds) / SIM_DT);
  const accepted = new Set();
  const stoppedTicks = competitors.map(() => 0);
  const progress = competitors.map(() => ({ next: -Infinity, finishes: 0 }));
  // Session-rule evidence (ARCADE and TIME TRIAL scenarios): the ending, what holds after it, appearances and
  // departures, and the gate crossings of other competitors.
  const rules = scenario.mode ? { appeared: [], departed: [], crossings: [] } : null;
  const present = competitors.map((c) => c.present);
  let ending = null;
  for (; tick < maxTicks; tick++) {
    const previous = competitors.map((c) => ({
      actor: c.actor,
      s: c.actor.vehicle.course.s,
      recoveries: c.actor.recovery.recoveries,
    }));
    let input;
    if (race.outcome.status === 'READY') input = idle;
    else if (scenario.policy === 'reverse') input = idle;
    else if (scenario.policy === 'departure') input = { ...idle, steering: scenario.steering, throttle: true };
    else if (scenario.waitForStop && evidence.recoveries.length && evidence.stoppedRivals.length < race.rivals.length)
      input = { ...idle, brake: true };
    else if (scenario.policy === 'closed' && race.clock.elapsedSeconds < 3) input = idle;
    // After the appeared entry's last stage, the player brakes until the entry has left the view.
    else if (
      scenario.policy === 'appearance' &&
      race.stage > scenario.expect.appearance.last &&
      rules.appeared.length &&
      !rules.departed.length
    )
      input = { ...idle, brake: true };
    else
      input = sampleEnvelopeDrivingInput(
        scene.world.coordinates,
        vehicle,
        driver,
        lane,
        workspace,
        scene.runtime.window,
      );
    const step = race.advance(input);
    if (step.recovered) {
      resetCameraRig(rig);
      assert.ok(
        race.events.every((event) => event.competitorId !== race.player.id),
        'recovery granted crossing credit',
      );
      assert.equal(
        race.forks.legalTarget(vehicle.course.s, vehicle.course.l),
        null,
        'recovery left player on a closed road',
      );
    }
    for (const event of race.events) {
      if (event.competitorId !== race.player.id) continue;
      const key = `${event.lap}:${event.landmark.id}`;
      assert.ok(!accepted.has(key), `crossing accepted twice: ${key}`);
      accepted.add(key);
    }
    camera = updateCamera(rig, scene.world, race.observe().player, CURRENT_CAMERA_PROFILE);
    finiteState(camera, 'camera');
    for (const [index, c] of competitors.entries()) {
      const v = c.actor.vehicle;
      finiteState(v, c.id);
      finiteState(c.actor.recovery, `${c.id}.recovery`);
      const recovered = c.actor.recovery.recoveries !== previous[index].recoveries;
      // The loading coverage record's one-step ceiling; never a physics clamp. An appearing competitor's new actor
      // starts where it appears.
      if (
        c.actor === previous[index].actor &&
        !recovered &&
        Math.abs(v.course.s - previous[index].s) > scene.runtime.coverage.maximumStepMeters
      )
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
        JSON.stringify([
          v,
          c.actor.recovery,
          c.progress.s,
          Number.isFinite(next) ? next : null,
          c.progress.acceptedFinishCount,
        ]),
      );
    }
    // The resident occurrences, as rendered and sampled physically.
    for (const occurrence of scene.runtime.window.occurrences) {
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
    const ended = race.outcome.status === 'GOAL' || race.outcome.status === 'GAME_OVER';
    if (rules) {
      for (const event of race.events)
        if (event.competitorId !== race.player.id)
          rules.crossings.push({ id: event.competitorId, gate: event.landmark.id, seconds: event.timeSeconds });
      for (const [index, c] of competitors.entries()) {
        if (c.present === present[index]) continue;
        present[index] = c.present;
        if (c.present)
          rules.appeared.push({
            id: c.id,
            tick,
            stage: race.stage,
            s: c.actor.vehicle.course.s,
            playerS: vehicle.course.s,
          });
        else rules.departed.push({ id: c.id, tick, stage: race.stage });
      }
      // A competitor out of the Session is neither observed nor counted in the position.
      const counted = competitors.filter((c) => c.present);
      const observedIds = race.observe().rivals.map((o) => o.id);
      for (const c of race.rivals)
        if (!c.present) assert.ok(!observedIds.includes(c.id), `${c.id}: observed while absent`);
      if (race.outcome.status === 'RUNNING' || ended)
        assert.match(
          raceStatusText(race),
          new RegExp(`P\\d+/${counted.length} `),
          'position counts absent competitors',
        );
      if (ended && !ending) {
        assert.equal(race.outcome.endSeconds, race.clock.elapsedSeconds, 'race time did not stop at the ending');
        ending = {
          tick,
          status: raceStatusText(race),
          progress: competitors.map((c) => [c.progress.s, c.progress.acceptedFinishCount]),
          playerS: vehicle.course.s,
          rivalS: race.rivals.map((c) => c.actor.vehicle.course.s),
        };
      } else if (ending) {
        // After the ending race time, progress, events, presence and the position hold while the field moves.
        assert.equal(race.clock.elapsedSeconds, race.outcome.endSeconds, 'race time moved after the ending');
        assert.deepEqual(
          competitors.map((c) => [c.progress.s, c.progress.acceptedFinishCount]),
          ending.progress,
          'progress moved after the ending',
        );
        assert.equal(race.events.length, 0, 'events after the ending');
        assert.equal(raceStatusText(race), ending.status, 'status or position changed after the ending');
      }
    }
    if (
      tick % 60 === 0 ||
      step.recovered ||
      (ended && (!ending || ending.tick === tick)) ||
      (!vehicle.course.inDomain && tick % 6 === 0)
    )
      render();
    if (ending && tick - ending.tick < (scenario.afterEndingSeconds ?? 0) / SIM_DT) continue;
    if (
      ended ||
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
    assert.ok(scenario.steering < 0 ? evidence.leftRoad : evidence.rightRoad, 'never departed the requested side');
  if (scenario.policy === 'closed') {
    assert.ok(
      evidence.recoveries.some((r) => r.reason === 'wrong-course'),
      'never entered the closed Carriageway',
    );
    // The premise: with this seed the rival locks the opposite exit first; a hash change must not void it silently.
    assert.equal(
      race.forks.choice(scene.runtime.route.occurrences[0]),
      course.entry.fork.exits[scenario.rivalExit].link,
      `${scenario.name}: seed ${scenario.seed} no longer sends the rival to exit ${scenario.rivalExit}`,
    );
  }
  if (scenario.finish) {
    assert.equal(race.outcome.status, 'GOAL');
    if (scenario.waitForStop)
      assert.equal(
        evidence.stoppedRivals.length,
        race.rivals.length,
        'finished rivals did not stop before player finish',
      );
  }
  if (scenario.policy === 'finish') {
    assert.equal(race.outcome.status, 'GOAL');
    assert.equal(race.player.progress.acceptedFinishCount, scenario.laps ?? 1);
    assert.equal(evidence.recoveries.length, 0, 'ordinary driving recovered');
    if (course.entry.fork)
      assert.equal(race.forks.choice(scene.runtime.route.occurrences[0]), course.entry.fork.exits[scenario.exit].link);
  }
  if (rules) {
    const { expect } = scenario;
    assert.equal(race.outcome.status, expect.outcome);
    assert.equal(race.outcome.cause, expect.cause ?? null);
    assert.ok(ending, `${scenario.name}: never ended`);
    if (scenario.mode === 'TIME_TRIAL') {
      assert.equal(race.rivals.length, 0, 'TIME TRIAL has rivals');
      assert.equal(slot, course.gates.grid.at(-1), 'TIME TRIAL does not start from the last grid slot');
      assert.equal(race.clock.deadlineSeconds, null, 'TIME TRIAL has a clock');
    }
    if (expect.position) assert.match(ending.status, new RegExp(` · ${expect.position} · `));
    // The takeover stops the finished player on its runout: the admitted maximumSpeed² / (2a) at the Session driver's a.
    const runout = envelope.maximumSpeed ** 2 / (2 * Math.min(...envelope.rows.map((row) => row.braking)) * 0.75);
    const pastFinish = vehicle.course.s - ending.progress[0][0];
    const playerSpeed = Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed);
    if (expect.stop) {
      assert.ok(playerSpeed < 0.05, `player still moving ${playerSpeed} m/s after the ending`);
      assert.ok(pastFinish > 0 && pastFinish <= runout, `player stopped ${pastFinish} m past the finish`);
    }
    const rivalTravel = race.rivals.map((c, i) => c.actor.vehicle.course.s - ending.rivalS[i]);
    if (expect.rivalsDrive)
      assert.ok(
        rivalTravel.every((d) => d > 0),
        'the field stopped at the ending',
      );
    if (expect.rankGate) {
      const first = rules.crossings.find((c) => c.gate === expect.rankGate);
      assert.ok(first, 'no rival crossed the limited gate');
      assert.equal(race.outcome.endSeconds, first.seconds, 'race time did not stop at the failing crossing');
    }
    if (expect.appearance) {
      const { stage, distance, last } = expect.appearance;
      assert.equal(rules.appeared.length, 1, 'expected one appearance');
      const [appeared] = rules.appeared;
      assert.equal(appeared.stage, stage, 'appeared outside its first stage');
      assert.ok(Math.abs(appeared.s - (appeared.playerS + distance)) < 1e-6, 'appeared away from its ahead distance');
      assert.equal(rules.departed.length, 1, 'the appeared entry never left');
      assert.ok(rules.departed[0].stage > last, 'left before its last stage ended');
    }
    evidence.rules = {
      outcome: race.outcome.status,
      cause: race.outcome.cause,
      endSeconds: race.outcome.endSeconds,
      position: ending.status.split(' · ')[1],
      pastFinish: Number(pastFinish.toFixed(3)),
      playerSpeed: Number(playerSpeed.toFixed(3)),
      rivalTravel: rivalTravel.map((d) => Number(d.toFixed(3))),
      appeared: rules.appeared.map(({ id, tick: at, stage, s, playerS }) => ({ id, tick: at, stage, s, playerS })),
      departed: rules.departed,
    };
  }
  return {
    ...evidence,
    ticks: tick + 1,
    finishes: competitors.map((c) => c.progress.acceptedFinishCount),
    digest: digest.digest('hex'),
  };
}
