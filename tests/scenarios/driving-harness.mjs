import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createCourseRace } from '../../src/race/course-race.js';
import { prepareRun } from '../../src/race/run-preparation.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { formPool } from '../../src/race/free-play-field.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { createCameraRig, resetCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { DEFAULT_CAMERAS } from '../../src/shell/player-record.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createRaceSprites } from '../../src/view/race-sprites.js';
import { createTirePuffs, PUFF_LIMIT } from '../../src/view/tire-puffs.js';
import { loadPuffs } from '../../src/content/puff-catalog.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { READY_SECONDS } from '../../src/race/start-phase.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { routeSectionS } from '../../src/course/course-route.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { readFileSync } from 'node:fs';
import { admitSeriesClass, compileSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { requireLoaded } from '../../src/content/content-load-error.js';
import { RUN_RULE_LIMITS } from '../../src/course/run-rules.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { supportedTargetSurface, publishVehicleRenderY } from '../../src/vehicle/physics/vehicle-physics.js';
import { initializePlanCoordinateObservation } from '../../src/vehicle/physics/vehicle-state.js';

/** The player's position as `P<rank>/<competitors present>`, from the race's standing. */
const playerPosition = (race) => `P${race.standing.rank}/${race.standing.count}`;

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);
const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
const puffDocument = await loadPuffs(
  content,
  materials.source.materials.map((material) => material.id),
);

const idle = { steering: 0, throttle: false, brake: false };
// The player's vehicle: a RACE class's first vehicle, or the FREE PLAY scenario's selection.
const playerVehicle = (id) => ({ entry: definitions.vehicles.find((v) => v.compiledVehicle.id === id) });
// Runs are prepared from the delivered catalogs as in the browser.
const freePlay = await loadFreePlayRules(content);
const catalog = { vehicles: definitions.vehicles, driving: definitions.driving, materials, freePlay };

const screenPictures = await loadScreenPictures(content);
const music = await loadMusic(content, TEXT_COLUMNS);

// The test-only series (never delivered) gives TSUKUBA RACE settings that exercise run rules with the build's
// time budgets and pace schedules.
const SCENARIO_SERIES_PATH = new URL('./run-rules.series.json', import.meta.url);
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
    ['tsukuba'],
    definitions.vehicles,
    screenPictures,
    music,
  ),
);

export async function loadScenarioCourse(stem) {
  return { course: await loadDeliveredCourse(content, stem, materials) };
}

/** One test per course: its scenarios, each replayed once more from the same fixed inputs. */
export function scenarioTests(courses) {
  for (const [stem, scenarios] of Object.entries(courses))
    test(`${stem}: deterministic driving scenarios`, async (t) => {
      const loaded = await loadScenarioCourse(stem);
      for (const scenario of scenarios)
        await t.test(scenario.name, async () => {
          const result = await runScenario(loaded, scenario);
          assert.deepEqual(await runScenario(loaded, scenario), result, 'fixed-input replay diverged');
          t.diagnostic(`${scenario.name}: ${JSON.stringify(result)}`);
        });
    });
}

/** The RACE or TIME ATTACK class a scenario names: `class` of the test series. */
function scenarioClass(course, { class: classId }) {
  const settings = scenarioSeries.seriesClass('scenario-rules', classId);
  assert.ok(settings && settings.course === course.id, `No class ${classId} on ${course.id}`);
  return requireLoaded(admitSeriesClass(settings, course, definitions.vehicles, SCENARIO_SERIES_PATH.pathname));
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

/**
 * The closed course limits at a route station, as route laterals: each side's limit where that side's limit runs, else
 * null.
 */
function closedLimitsAt(scene, s) {
  const occurrence = scene.runtime.route.at(s);
  if (!occurrence) return { left: null, right: null };
  const nativeS = routeSectionS(occurrence, s);
  const at = (keep) => {
    const line = occurrence.section.barriers.find((b) => b.keep === keep && nativeS >= b.start && nativeS <= b.end);
    return line ? line.lateralAt(nativeS) - occurrence.lateralOrigin : null;
  };
  return { left: at(1), right: at(-1) };
}

/**
 * How far a contact station reaches past a closed course limit, in metres (negative inside), with each contact's load
 * and material: the stations stand on the body's forward axis, their laterals from the road heading at the vehicle.
 */
function limitReach(scene, vehicle, compiledVehicle) {
  const { s, l } = vehicle.course;
  const limits = closedLimitsAt(scene, s);
  const heading = scene.world.coordinates.toWorld(s, l, { x: 0, z: 0, s: 0, l: 0, heading: 0 }).heading;
  const across = Math.sin(vehicle.yaw - heading);
  const contacts = [
    { l: l + across * compiledVehicle.frontAxle, tire: vehicle.tires.front },
    { l: l - across * compiledVehicle.rearAxle, tire: vehicle.tires.rear },
  ];
  const past = (c) =>
    Math.max(
      limits.left === null ? -Infinity : limits.left - c.l,
      limits.right === null ? -Infinity : c.l - limits.right,
    );
  return {
    past: Math.max(...contacts.map(past)),
    front: { load: contacts[0].tire.load, surface: contacts[0].tire.surface },
    rear: { load: contacts[1].tire.load, surface: contacts[1].tire.surface },
  };
}

/**
 * Stands the player still at a route station, turned a quarter turn toward the left course limit, its centre where its
 * front contact station reaches `reach` metres past the limit.
 */
function placeBroadside(scene, vehicle, model, s, reach) {
  const p = model.compiledVehicle;
  const limit = closedLimitsAt(scene, s).left;
  assert.notEqual(limit, null, 'no closed left course limit at the broadside station');
  const l = limit + p.frontAxle - reach;
  const surface = supportedTargetSurface(scene.world, s, l);
  vehicle.x = surface.point.x + surface.normal.x * p.desiredCgHeight;
  vehicle.y = surface.point.y + surface.normal.y * p.desiredCgHeight;
  vehicle.z = surface.point.z + surface.normal.z * p.desiredCgHeight;
  vehicle.yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z) - Math.PI / 2;
  vehicle.pitch = 0;
  vehicle.yawRate = vehicle.pitchRate = 0;
  vehicle.velocityX = vehicle.velocityY = vehicle.velocityZ = 0;
  vehicle.frontWheelOmega = vehicle.rearWheelOmega = 0;
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
}

/**
 * Lifts the player above the road at a route station, its centre `height` metres above its ride height, level with the
 * road and moving along it at `speed` with its wheels rolling.
 */
function placeAirborne(scene, vehicle, model, s, height, speed) {
  const p = model.compiledVehicle;
  const surface = supportedTargetSurface(scene.world, s, vehicle.course.l);
  const lift = p.desiredCgHeight + height;
  vehicle.x = surface.point.x + surface.normal.x * lift;
  vehicle.y = surface.point.y + surface.normal.y * lift;
  vehicle.z = surface.point.z + surface.normal.z * lift;
  vehicle.yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  vehicle.pitch = surface.gradeAngle;
  vehicle.yawRate = vehicle.pitchRate = 0;
  vehicle.velocityX = surface.tangent.x * speed;
  vehicle.velocityY = surface.tangent.y * speed;
  vehicle.velocityZ = surface.tangent.z * speed;
  vehicle.frontWheelOmega = speed / p.frontStation.rollingRadius;
  vehicle.rearWheelOmega = speed / p.rearStation.rollingRadius;
  vehicle.course = initializePlanCoordinateObservation(scene.world.coordinates, vehicle.x, vehicle.z, s);
  publishVehicleRenderY(vehicle, model);
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
 * Fresh product assembly per replay, through the browser's path from a request to a run (`prepareRun`); only
 * the series, initial conditions and input policy differ from the browser.
 */
export async function runScenario({ course }, scenario) {
  // RACE and TIME ATTACK take their class of the test series.
  const runClass = scenario.mode === 'RACE' || scenario.mode === 'TIME_ATTACK' ? scenarioClass(course, scenario) : null;
  const { entry } = playerVehicle(runClass ? runClass.vehicles[0] : (scenario.vehicleId ?? 'TESTAROSSA'));
  assert.ok(entry, `${scenario.name}: missing selected vehicle`);
  const scene = createCourseScene(course.entry, course.gates, definitions.vehicles);
  // RACE and TIME ATTACK take their class's settings; FREE PLAY takes the scenario's.
  const mode = scenario.mode ?? 'FREE_PLAY';
  const request =
    mode !== 'FREE_PLAY'
      ? { mode, vehicleId: entry.compiledVehicle.id, color: null }
      : {
          mode,
          vehicleId: entry.compiledVehicle.id,
          color: null,
          lapCount: 1,
          rivalCount: scenario.rivals ?? 0,
          rivalPool: formPool(freePlay, entry).id,
          traffic: 'OFF',
        };
  const initialSpeed = scenario.policy === 'limit' ? 30 : 0;
  const prepared = await prepareRun(content, catalog, course, runClass, request, initialSpeed);
  const setup = prepared.resolve(scenario.seed ?? 0);
  // The player's run driver, whose speed cap and braking give the takeover's runout.
  const driver = setup.driverOf(setup.entries[0].vehicle);
  const slot = setup.entries[0].slot;
  // The race builds every competitor, the player included; the harness reads their state for evidence.
  // The player's run driver drives toward the scenario's target exit at every fork.
  const race = createCourseRace({
    setup,
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
  // The tire puffs advance every fixed step as the run's do, and are drawn with the other vehicles.
  const puffs = createTirePuffs(puffDocument, definitions.vehicles);
  const digest = createHash('sha256');
  const evidence = {
    outsideDomain: false,
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
    /** The most tire puffs alive at once. */
    maxPuffs: 0,
  };
  let camera;
  // Display and camera read only the race's borrowed competitor observations, as the browser does.
  const render = () => {
    const observed = race.observe();
    scene.render(
      target,
      {
        vehicle: observed.player,
        set: observed.player.brakeLampOn ? visual.on : visual.off,
        reach: entry.compiledVehicle.reach,
      },
      camera,
      sprites([...observed.rivals, ...observed.traffic], camera, scene.world),
      puffs.sprites(scene.world.coordinates),
      observed.knocked,
    );
    evidence.frames++;
  };
  race.start();
  // The broadside policy stands the player against the course limit before READY, which holds it there until GO.
  if (scenario.policy === 'broadside')
    placeBroadside(scene, vehicle, actor.model, vehicle.course.s + scenario.ahead, scenario.reach);
  // The airborne policy lifts the player above the road before READY, which holds it there until GO.
  if (scenario.policy === 'airborne')
    placeAirborne(scene, vehicle, actor.model, vehicle.course.s + scenario.ahead, scenario.height, scenario.speed);
  let tick = 0;
  // Scenario seconds count from GO; READY runs through the same product start first.
  const maxTicks = Math.ceil((READY_SECONDS + scenario.seconds) / SIM_DT);
  const accepted = new Set();
  const progress = competitors.map(() => ({ next: -Infinity, finishes: 0 }));
  // Run-rule evidence (RACE and TIME ATTACK scenarios that run to their ending): the ending, what holds after it,
  // appearances and departures. A bounded scenario drives a stretch only.
  const rules = scenario.mode && !scenario.bounded ? { appeared: [], departed: [] } : null;
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
    // A step that starts in READY holds the player; its contacts are observed from the first free step on.
    const heldStep = race.outcome.status === 'READY';
    const shiftBefore = vehicle.powertrain.shift.sequence;
    let input;
    if (race.outcome.status === 'READY') input = idle;
    else if (scenario.policy === 'broadside') input = { ...idle, brake: true };
    // The throttle open from GO, so the driven wheels spin up in the air.
    else if (scenario.policy === 'airborne') input = { ...idle, throttle: true };
    // Toward a course limit for a while, then back to the reference line.
    else if (scenario.policy === 'limit' && race.clock.elapsedSeconds < scenario.steerSeconds)
      input = { ...idle, steering: scenario.steering, throttle: true };
    // The player's run driver drives.
    else input = null;
    const step = race.advance(input);
    // A run without a finish ends when the player ends it: here once it has completed its laps.
    if (scenario.endAfterLaps && race.player.progress.acceptedFinishCount >= scenario.endAfterLaps && race.endable)
      race.end();
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
    camera = updateCamera(
      rig,
      scene.world,
      race.observe().player,
      CAMERA_DEFINITION,
      DEFAULT_CAMERAS[entry.listing.form],
    );
    finiteState(camera, 'camera');
    {
      const observed = race.observe();
      puffs.advance([observed.player, ...observed.rivals, ...observed.traffic], camera, scene);
      assert.ok(puffs.count <= PUFF_LIMIT, 'more puffs than the limit');
      evidence.maxPuffs = Math.max(evidence.maxPuffs, puffs.count);
    }
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
    assert.ok(presentTraffic.size <= RUN_RULE_LIMITS.traffic, 'more traffic vehicles at once than the run rules allow');
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
    // How far the player's contacts reach past a closed course limit, at the farthest, and the support they read there;
    // a broadside stand keeps both contacts loaded on ground from its first step on.
    if (scenario.policy === 'broadside' && !heldStep) {
      const reach = limitReach(scene, vehicle, actor.model.compiledVehicle);
      if (reach.past > (evidence.limitReach?.past ?? -Infinity)) evidence.limitReach = { tick, ...reach };
      evidence.unsupportedTicks =
        (evidence.unsupportedTicks ?? 0) +
        (reach.front.load > 0 && reach.rear.load > 0 && reach.front.surface && reach.rear.surface ? 0 : 1);
    }
    // In the air the driven wheels spin up the engine, which no shift may follow: the flight's steps, the engine's
    // highest speed over redline and the shifts in it.
    if (scenario.policy === 'airborne' && !heldStep && !vehicle.supported) {
      evidence.airborneTicks = (evidence.airborneTicks ?? 0) + 1;
      const redline = vehicle.powertrain.engineRpm / actor.model.compiledVehicle.powertrain.redlineRpm;
      evidence.airborneRedline = Math.max(evidence.airborneRedline ?? 0, Number(redline.toFixed(3)));
      evidence.airShifts = (evidence.airShifts ?? 0) + (vehicle.powertrain.shift.sequence === shiftBefore ? 0 : 1);
    }
    const ended = ['GOAL', 'GAME_OVER', 'ENDED'].includes(race.outcome.status);
    if (rules) {
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
      // A competitor out of the run is neither observed nor counted in the position.
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
    if (ended) break;
  }
  // A run into a course limit succeeds by lasting its time on the course.
  const held = scenario.policy === 'limit' || scenario.policy === 'broadside';
  if (!held && !scenario.bounded)
    assert.ok(tick < maxTicks, `${scenario.name}: did not reach its outcome: ${JSON.stringify(evidence)}`);
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
  if (scenario.policy === 'broadside') {
    assert.ok(evidence.limitReach.past > 0, 'no contact reached past the course limit');
    assert.equal(evidence.unsupportedTicks, 0, 'a contact lost its support behind the course limit');
  }
  if (scenario.policy === 'airborne') {
    // The gear held while the spinning wheels took the engine past redline in the air: shifts read the vehicle's speed.
    assert.equal(evidence.airShifts, 0, 'a gear changed in the air');
    assert.ok(evidence.airborneRedline > 1, 'the engine never passed redline in the air');
  }
  // Rivals and traffic, which only their drivers drive, never recover and no wall or course limit pushes them.
  assert.deepEqual(evidence.otherRecoveries, {}, 'a rival or traffic vehicle recovered');
  assert.deepEqual(evidence.otherContacts, {}, 'a wall or course limit pushed a rival or traffic vehicle');
  // Unless its policy sends it off the road, the player neither recovers nor meets a wall or course limit.
  if (!['limit', 'broadside'].includes(scenario.policy)) {
    assert.equal(evidence.recoveries.length, 0, 'ordinary driving recovered');
    assert.equal(evidence.limitContact, null, 'ordinary driving met a wall or course limit');
  }
  // A finish policy reaches GOAL unless its run rules expect another outcome or leave it open.
  if (scenario.policy === 'finish' && !scenario.bounded && scenario.expect.outcome === 'GOAL') {
    assert.equal(race.outcome.status, 'GOAL');
    assert.equal(race.player.progress.acceptedFinishCount, setup.configuration.lapCount);
  }
  if (rules) {
    const { expect } = scenario;
    if (expect.outcome) {
      assert.equal(race.outcome.status, expect.outcome);
      assert.equal(race.outcome.cause, null);
    }
    assert.ok(ending, `${scenario.name}: never ended`);
    if (scenario.mode === 'TIME_ATTACK') {
      assert.equal(race.rivals.length, 0, 'TIME ATTACK has rivals');
      assert.equal(race.traffic.length, 0, 'TIME ATTACK has traffic');
      assert.equal(
        slot,
        courseStartGrid(course.gates, entry.listing.form === 'bike').at(-1),
        'TIME ATTACK does not start from the last grid slot',
      );
      assert.equal(race.clock.deadlineSeconds, null, 'TIME ATTACK has a clock');
    }
    // A run without a finish laps on: its laps' finish lines never finished it, and its best lap is its completed laps'.
    if (scenario.endAfterLaps) {
      assert.equal(race.lapCount, null, 'a run without a finish has a lap count');
      assert.equal(race.player.finishGateId, null, 'a run without a finish finished');
      assert.equal(race.player.progress.acceptedFinishCount, scenario.endAfterLaps);
      assert.equal(race.lap, scenario.endAfterLaps + 1);
      assert.ok(race.player.bestLapSeconds !== null && race.player.bestLapSeconds <= race.player.lastLapSeconds);
      evidence.bestLapSeconds = race.player.bestLapSeconds;
    }
    if (expect.position) assert.equal(ending.position, expect.position);
    // The takeover stops the finished player on its runout: its speed cap² / (2a) at the run driver's a.
    const runout = driver.speedCap ** 2 / (2 * driver.braking);
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
