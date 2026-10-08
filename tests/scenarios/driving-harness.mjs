import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { prepareSession } from '../../src/race/session-preparation.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { formPool } from '../../src/race/free-play-field.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import {
  compileEnvelopeDriver,
  createEnvelopeDriverWorkspace,
  sampleEnvelopeDrivingInput,
} from '../../src/race/envelope-driver.js';
import { createCameraRig, resetCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createDisplaySettings, STRIP_RENDER_METHODS } from '../../src/view/display-settings.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { routeS, routeSectionS } from '../../src/course/course-route.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { readFileSync } from 'node:fs';
import { admitSeriesClass, compileSeriesCatalog, loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { SESSION_RULE_LIMITS } from '../../src/course/session-rules.js';

/** The player's position as `P<rank>/<competitors present>`, from the race's standing. */
const playerPosition = (race) => `P${race.standing.rank}/${race.standing.count}`;

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));

const idle = { steering: 0, throttle: false, brake: false };
// The player's vehicle, its delivered envelope and the Session driver that drives it: an ARCADE class's first vehicle,
// TESTAROSSA otherwise.
const playerVehicle = async (id) => {
  const { envelope } = await content.json('envelope', id);
  return {
    entry: definitions.vehicles.find((v) => v.compiledVehicle.id === id),
    envelope,
    driver: compileEnvelopeDriver(envelope, 0.75, envelope.maximumSpeed, true),
  };
};
// Sessions are prepared from the delivered catalogs as in the browser.
const freePlay = await loadFreePlayRules(content);
const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay };

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

// The delivered series, for scenarios that run a course's product ARCADE settings (RIBBON COAST's traffic).
const productSeries = await loadSeriesCatalog(content, definitions.vehicles);

export async function loadScenarioCourse(stem) {
  return { course: await loadDeliveredCourse(content, stem, materials) };
}

/** The ARCADE class a scenario names: `class` of the test series, or of the delivered series `series`. */
function scenarioClass(course, { series, class: classId }) {
  const settings = series
    ? productSeries.seriesClass(series, classId)
    : scenarioSeries.seriesClass('scenario-rules', classId);
  assert.ok(settings && settings.course === course.id, `No class ${classId} on ${course.id}`);
  return requireLoaded(
    admitSeriesClass(settings, course, series ? `${series}.series.json` : SCENARIO_SERIES_PATH.pathname),
  );
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
  const roads = courseRoadsAt(occurrence.section.lanes, s);
  if (!roads.length) return null;
  return {
    left: Math.min(...roads.map((r) => r.left)) - occurrence.lateralOrigin,
    right: Math.max(...roads.map((r) => r.right)) - occurrence.lateralOrigin,
  };
}

/**
 * Fresh product assembly per replay, through the browser's path from a request to a Session (`prepareSession`); only
 * the series, initial conditions and input policy differ from the browser.
 */
export async function runScenario({ course }, scenario) {
  // ARCADE takes its class of the test series, or of the delivered series `scenario.series`.
  const arcade = scenario.mode === 'ARCADE' ? scenarioClass(course, scenario) : null;
  const { entry, envelope, driver } = await playerVehicle(arcade ? arcade.vehicles[0] : 'TESTAROSSA');
  const settings = createDisplaySettings();
  const scene = createCourseScene(
    course.entry,
    course.gates,
    definitions.vehicles,
    { camera: CAMERA_DEFINITION, footprint: entry.compiledVehicle.footprint },
    settings,
  );
  // ARCADE takes its class's settings; TIME TRIAL and FREE PLAY take the scenario's.
  const mode = scenario.mode ?? 'FREE_PLAY';
  const request =
    mode === 'ARCADE'
      ? { mode, vehicleId: entry.compiledVehicle.id, color: null }
      : mode === 'TIME_TRIAL'
        ? { mode, vehicleId: entry.compiledVehicle.id, color: null, lapCount: scenario.laps ?? 1 }
        : {
            mode,
            vehicleId: entry.compiledVehicle.id,
            color: null,
            lapCount: scenario.laps ?? 1,
            rivalCount: scenario.rivals ?? 0,
            rivalPool: formPool(freePlay, entry).id,
            traffic: 'OFF',
          };
  const initialSpeed =
    scenario.policy === 'reverse' ? -20 : scenario.policy === 'departure' || scenario.policy === 'limit' ? 30 : 0;
  const prepared = await prepareSession(content, catalog, course, arcade, request, initialSpeed);
  const session = prepared.resolve(scenario.seed ?? 0);
  const slot = session.entries[0].slot;
  // The race builds every competitor, the player included; the harness reads their state for evidence.
  // The player's Session driver drives toward the scenario's target exit at every fork.
  const race = createCourseRace({
    session,
    runtime: scene.runtime,
    playerExit: () => {
      assert.ok(Number.isInteger(scenario.exit), `${scenario.name}: a fork needs the scenario's target exit`);
      return scenario.exit;
    },
  });
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
    /** The first tick a wall or course limit pushed the player, and its farthest lateral from the road centre line. */
    limitContact: null,
    /** The first tick a wall or course limit pushed each rival or traffic vehicle that it pushed. */
    otherContacts: {},
    /** The recoveries of each rival or traffic vehicle that recovered. */
    otherRecoveries: {},
    farthestL: 0,
    recoveries: [],
    choices: [],
    frames: 0,
    stoppedRivals: [],
  };
  // Scripted laterals leave the player's driver: the closed policy keeps approaching the opposite road at the fork
  // after a rival locks its choice, until it recovers; the cones policy keeps to its row of objects.
  const closedRoad = (s) => {
    const occurrence = scene.runtime.route.at(s);
    const fork = occurrence?.section.fork;
    if (scenario.policy !== 'closed' || !fork || actor.recovery.recoveries !== 0) return null;
    const lane = fork.exits.at(-1).link.from.lane;
    const nativeS = routeSectionS(occurrence, s);
    const road = courseRoadsAt(occurrence.section.lanes, nativeS).find((r) => r.lanes.includes(lane));
    if (!road) return null;
    return (road.left + road.right) / 2 - occurrence.lateralOrigin;
  };
  // The cones policy's row, from the course's authored objects: the movable objects of the first Section on the Route
  // that has any, at the lateral of its first one, as route stations and a route lateral.
  let coneRow = null;
  const findConeRow = (s) => {
    const occurrence = scene.runtime.route.at(s);
    const first = occurrence?.section.objects.find((object) => object.movable);
    if (!first) return;
    const row = occurrence.section.objects.filter((object) => object.movable && object.l === first.l);
    coneRow = {
      start: routeS(occurrence, row[0].s),
      end: routeS(occurrence, row.at(-1).s),
      l: first.l - occurrence.lateralOrigin,
      count: row.length,
    };
  };
  // From its approach distance before the row until the player has passed every object it knocked, landed.
  const CONE_APPROACH = 120;
  const inConeStretch = (s) =>
    s >= coneRow.start - CONE_APPROACH &&
    (s <= coneRow.end || race.observe().knocked.some((k) => k.state !== 'landed' || k.s >= s));
  const scripted = (s) => {
    if (scenario.policy === 'cones') {
      if (!coneRow) findConeRow(s);
      return coneRow && inConeStretch(s) ? () => coneRow.l : null;
    }
    return closedRoad(s) === null ? null : (station) => closedRoad(station) ?? closedRoad(s);
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
      sprites([...observed.rivals, ...observed.traffic], camera, scene.world.coordinates),
      [observed.player, ...observed.rivals, ...observed.traffic],
      observed.knocked,
    );
    evidence.frames++;
  };
  race.start();
  // The clock's first deadline: the initial time budget, in seconds from GO.
  const initialDeadline = race.clock.deadlineSeconds;
  let tick = 0;
  // Scenario seconds count from GO; READY runs through the same product start first.
  const maxTicks = Math.ceil((READY_SECONDS + scenario.seconds) / SIM_DT);
  const accepted = new Set();
  const stoppedTicks = competitors.map(() => 0);
  const progress = competitors.map(() => ({ next: -Infinity, finishes: 0 }));
  // Session-rule evidence (ARCADE and TIME TRIAL scenarios): the ending, what holds after it, appearances and
  // departures, and the gate crossings of other competitors.
  const rules = scenario.mode ? { appeared: [], departed: [], crossings: [] } : null;
  // Traffic evidence: each traffic vehicle's appearance and departure ticks, and the most present at once.
  const traffic = { appeared: [], departed: 0, maxPresent: 0 };
  let trafficIds = new Set();
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
    // Toward a course limit for a while, then back to the reference line.
    else if (scenario.policy === 'limit' && race.clock.elapsedSeconds < scenario.steerSeconds)
      input = { ...idle, steering: scenario.steering, throttle: true };
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
    else {
      // The player's Session driver drives, unless the policy scripts the lateral here.
      const lateral = scripted(vehicle.course.s);
      input = lateral
        ? sampleEnvelopeDrivingInput(scene.world, vehicle, driver, lateral, workspace, scene.runtime.window)
        : null;
    }
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
    camera = updateCamera(rig, scene.world, race.observe().player, CAMERA_DEFINITION, entry.compiledVehicle.footprint);
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
    const presentTraffic = new Set(race.traffic.map((t) => t.id));
    for (const t of race.traffic) {
      finiteState(t.vehicle, t.id);
      if (!trafficIds.has(t.id))
        traffic.appeared.push({ id: t.id, tick, s: t.vehicle.course.s, playerS: vehicle.course.s });
      digest.update(JSON.stringify([t.id, t.vehicle, t.step.state]));
    }
    for (const id of trafficIds) if (!presentTraffic.has(id)) traffic.departed++;
    trafficIds = presentTraffic;
    traffic.maxPresent = Math.max(traffic.maxPresent, presentTraffic.size);
    assert.ok(
      presentTraffic.size <= SESSION_RULE_LIMITS.traffic,
      'more traffic vehicles at once than the Session rules allow',
    );
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
    evidence.farthestL = Math.max(evidence.farthestL, Math.abs(vehicle.course.l));
    for (const id of step.barriers)
      if (id === race.player.id) evidence.limitContact ??= tick;
      else evidence.otherContacts[id] ??= tick;
    for (const v of [
      ...race.rivals.map((c) => ({ id: c.id, recovery: c.actor.recovery })),
      ...race.traffic.map((t) => ({ id: t.id, recovery: t.step.state })),
    ])
      if (v.recovery.recoveries > 0) evidence.otherRecoveries[v.id] = v.recovery.recoveries;
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
        assert.equal(race.standing.count, counted.length, 'position counts absent competitors');
      if (ended && !ending) {
        assert.equal(race.outcome.endSeconds, race.clock.elapsedSeconds, 'race time did not stop at the ending');
        ending = {
          tick,
          seconds: race.outcome.endSeconds,
          position: playerPosition(race),
          progress: competitors.map((c) => [c.progress.s, c.progress.acceptedFinishCount]),
          playerS: vehicle.course.s,
          rivalS: race.rivals.map((c) => c.actor.vehicle.course.s),
        };
      } else if (ending) {
        // After the ending race time, progress, events, presence and the position hold while the field moves.
        assert.equal(race.clock.elapsedSeconds, ending.seconds, 'race time moved after the ending');
        assert.deepEqual(
          competitors.map((c) => [c.progress.s, c.progress.acceptedFinishCount]),
          ending.progress,
          'progress moved after the ending',
        );
        assert.equal(race.events.length, 0, 'events after the ending');
        assert.equal(playerPosition(race), ending.position, 'position changed after the ending');
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
    if (coneRow && inConeStretch(vehicle.course.s) && vehicle.course.s > coneRow.start)
      evidence.coneSpeed = Math.min(
        evidence.coneSpeed ?? Infinity,
        Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed),
      );
    if (
      ended ||
      ((scenario.policy === 'reverse' ||
        scenario.policy === 'departure' ||
        (scenario.policy === 'closed' && !scenario.finish)) &&
        evidence.recoveries.length)
    )
      break;
  }
  // A departure or a run into a course limit succeeds by lasting its time on the course.
  const held = scenario.policy === 'departure' || scenario.policy === 'limit';
  if (!held) assert.ok(tick < maxTicks, `${scenario.name}: did not reach its outcome: ${JSON.stringify(evidence)}`);
  if (scenario.policy === 'reverse') assert.ok(evidence.outsideEntry, 'never backed beyond the entry');
  if (scenario.policy === 'cones') {
    // The player knocked every object of the row, kept to it over the landed ones without being held or recovered,
    // and finished. Evidence: how many it knocked, where they landed (Section stations and laterals) and its least
    // speed from the row's first object on.
    const knocked = race.observe().knocked;
    assert.ok(coneRow, 'the course has no movable object');
    assert.equal(knocked.length, coneRow.count, 'did not knock every object of the row');
    assert.ok(
      knocked.every((k) => k.state === 'landed'),
      'an object never landed',
    );
    assert.equal(race.outcome.status, 'GOAL');
    const range = (values) => [Math.min(...values), Math.max(...values)].map((v) => Math.round(v * 100) / 100);
    evidence.knocked = {
      count: knocked.length,
      landedS: range(knocked.map((k) => k.at.s)),
      landedL: range(knocked.map((k) => k.at.l)),
    };
  }
  if (held) {
    assert.equal(evidence.recoveries.length, 0, 'a course limit let the player leave the course');
    assert.ok(!evidence.outsideDomain, 'left the coordinate domain');
    assert.notEqual(evidence.limitContact, null, 'never reached a course limit');
  }
  if (scenario.policy === 'limit') {
    const bounds = pavementBounds(scene, vehicle);
    assert.ok(vehicle.course.l > bounds.left && vehicle.course.l < bounds.right, 'did not return to the road');
    assert.ok(Math.hypot(vehicle.longitudinalSpeed, vehicle.lateralSpeed) > 20, 'did not drive on after the limit');
  }
  if (scenario.policy === 'reverse') {
    assert.ok(evidence.outsideDomain, 'never left the coordinate domain');
    assert.equal(evidence.recoveries.at(-1)?.reason, 'outside-domain');
    assert.ok(vehicle.course.inDomain, 'recovery did not restore domain membership');
  }
  if (scenario.policy === 'departure')
    assert.ok(scenario.steering < 0 ? evidence.leftRoad : evidence.rightRoad, 'never departed the requested side');
  if (scenario.policy === 'closed') {
    assert.ok(
      evidence.recoveries.some((r) => r.reason === 'wrong-course'),
      'never entered the closed road',
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
  // Rivals and traffic, which only their drivers drive, never recover and no wall or course limit pushes them.
  assert.deepEqual(evidence.otherRecoveries, {}, 'a rival or traffic vehicle recovered');
  assert.deepEqual(evidence.otherContacts, {}, 'a wall or course limit pushed a rival or traffic vehicle');
  // Unless its policy sends it off the road, the player neither recovers nor meets a wall or course limit.
  if (!['reverse', 'departure', 'limit', 'closed'].includes(scenario.policy)) {
    assert.equal(evidence.recoveries.length, 0, 'ordinary driving recovered');
    assert.equal(evidence.limitContact, null, 'ordinary driving met a wall or course limit');
  }
  // A finish policy reaches GOAL unless its Session rules expect another outcome or leave it open.
  if (scenario.policy === 'finish' && (!scenario.expect || scenario.expect.outcome === 'GOAL')) {
    assert.equal(race.outcome.status, 'GOAL');
    assert.equal(race.player.progress.acceptedFinishCount, session.configuration.lapCount);
    if (course.entry.fork)
      assert.equal(race.forks.choice(scene.runtime.route.occurrences[0]), course.entry.fork.exits[scenario.exit].link);
  }
  if (rules) {
    const { expect } = scenario;
    if (expect.outcome) {
      assert.equal(race.outcome.status, expect.outcome);
      assert.equal(race.outcome.cause, expect.cause ?? null);
    }
    assert.ok(ending, `${scenario.name}: never ended`);
    if (scenario.mode === 'TIME_TRIAL') {
      assert.equal(race.rivals.length, 0, 'TIME TRIAL has rivals');
      assert.equal(slot, course.gates.grid.at(-1), 'TIME TRIAL does not start from the last grid slot');
      assert.equal(race.clock.deadlineSeconds, null, 'TIME TRIAL has a clock');
    }
    if (expect.position) assert.equal(ending.position, expect.position);
    // An ARCADE class runs its own vehicle and laps, with the time limit from that vehicle's delivered reference times
    // on the course and its series' margin.
    if (expect.ownClass) {
      const { vehicles, laps, series } = arcade;
      const reference = await content.json('reference-times', `${course.id}/${vehicles[0]}`);
      assert.equal(session.entries[0].vehicle.vehicleDefinition.compiledVehicle.id, vehicles[0]);
      assert.equal(session.configuration.lapCount, laps);
      assert.equal(race.player.progress.acceptedFinishCount, laps);
      assert.equal(initialDeadline, Math.ceil(1000 * series.timeMargin * reference.initialSeconds) / 1000);
      evidence.ownClass = { vehicle: vehicles[0], laps, initialDeadline };
    }
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
      position: ending.position,
      pastFinish: Number(pastFinish.toFixed(3)),
      playerSpeed: Number(playerSpeed.toFixed(3)),
      rivalTravel: rivalTravel.map((d) => Number(d.toFixed(3))),
      appeared: rules.appeared.map(({ id, tick: at, stage, s, playerS }) => ({ id, tick: at, stage, s, playerS })),
      departed: rules.departed,
    };
  }
  if (scenario.expect?.traffic) {
    assert.ok(traffic.appeared.length > 0, 'no traffic appeared');
    assert.ok(traffic.departed > 0, 'no traffic left the view');
    evidence.traffic = {
      appeared: traffic.appeared.length,
      departed: traffic.departed,
      maxPresent: traffic.maxPresent,
      first: traffic.appeared[0],
    };
  }
  return {
    ...evidence,
    ticks: tick + 1,
    finishes: competitors.map((c) => c.progress.acceptedFinishCount),
    digest: digest.digest('hex'),
  };
}
