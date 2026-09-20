import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { selectBrowserCourseMode } from './browser/course-mode-selection.js';
import { mustGet } from './browser/dom.js';
import { readCourseDocument } from './course/course-document.js';
import { courseGroundPreflight, readCourseGround } from './compiler/course-ground.js';
import { compileCourseDocument } from './compiler/compiled-course.js';
import { RECOVERY_PROFILE } from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { VEHICLE_CATALOG } from './vehicle/vehicle-catalog.js';
import { createCourseRace } from './runtime/course-race.js';
import { createCoursePerformanceHud } from './browser/course-performance-hud.js';
import { resolveCourseSession } from './runtime/course-session.js';
import { readCourseReference } from './runtime/course-reference.js';
import { browserSessionVehicle } from './browser/session-vehicle.js';
import { readBrowserSessionSettings, mountCourseSessionControls } from './browser/course-session-controls.js';
import { createCourseScene } from './runtime/course-scene.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.textContent = 'Loading course…';
canvas.insertAdjacentElement('afterend', status);

async function fetchBytes(url: URL): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Course request failed (${response.status}): ${url.pathname}`);
  return new Uint8Array(await response.arrayBuffer());
}

try {
  const root = new URL('./content/', import.meta.url);
  const mode = selectBrowserCourseMode(new URLSearchParams(location.search).get('mode')).query;
  const bytes = await fetchBytes(new URL(`courses/${mode}.course.json`, root));
  const source = readCourseDocument(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (!source.ok) throw new Error(JSON.stringify(source.diagnostics));
  const images = await Promise.all(
    [...new Set(source.value.assets.map((asset) => asset.sha256))].map(async (sha256) => ({
      sha256,
      bytes: await fetchBytes(new URL(`images/${sha256}.json`, root)),
    })),
  );
  const compiled = await compileCourseDocument(source.value, images);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const groundManifest = await fetchBytes(new URL(`ground/${mode}.json`, root));
  const { manifest } = courseGroundPreflight(
    compiled.value,
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(groundManifest)),
  );
  const ground = await readCourseGround(
    compiled.value,
    manifest,
    await fetchBytes(new URL(`ground/${mode}.bin`, root)),
  );
  const course = compiled.value;
  if (!course.rules) throw new RangeError('Playable courses require saved Session rules');
  const parameters = new URLSearchParams(location.search);
  const settings = readBrowserSessionSettings(parameters, course.rules.classic);
  const preset = readBrowserSessionSettings(new URLSearchParams(), course.rules.classic);
  const entry = VEHICLE_CATALOG.find((v) => v.profile.id === settings.vehicleId)!;
  const vehicle = browserSessionVehicle(entry);
  const budgets = settings.countdown
    ? await readCourseReference(
        course,
        vehicle,
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            await fetchBytes(new URL('reference/' + mode + '.json', root)),
          ),
        ),
      )
    : null;
  const session = resolveCourseSession(course, settings, vehicle, budgets);
  const scene = createCourseScene(course.entry, ground);
  const slot = session.grid[0]!;
  const shell = createBrowserDrivingShell(scene.world, slot.l, {
    s: slot.anchor.s,
    initialSpeed: session.initialSpeed,
    vehicle,
  });
  const race = createCourseRace({
    session,
    player: shell,
    playerSession: scene.session,
    createSession: scene.createActorSession,
    rival: vehicle,
  });
  const raceStatus = document.createElement('output');
  raceStatus.setAttribute('role', 'status');
  raceStatus.setAttribute('aria-label', 'Session status');
  raceStatus.setAttribute('aria-live', 'off');
  raceStatus.className = 'course-status';
  canvas.insertAdjacentElement('afterend', raceStatus);
  const lifecycle = shell.mountControls({
    world: () => scene.world,
    recoveryProfile: RECOVERY_PROFILE,
    configurationLocked: true,
    canRecover: () => race.clock.status === 'RUNNING' && !manualPause && !document.hidden,
    recoveryL: () => race.recoveryL,
    resync: () => {
      scene.recoverAtEntry(shell.vehicle, shell.recovery);
      race.resyncPlayer();
    },
  });
  const performanceHud = createCoursePerformanceHud(canvas, scene.metrics, scene.groundMetrics);
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  let manualPause = false;
  const tick = (dt: number) => {
    const started = performance.now();
    input = shell.inputManager.sample();
    lifecycle.update(dt, race.advance(input, dt));
    performanceHud.step(performance.now() - started);
  };
  const render = () => {
    const started = performance.now(),
      observations = race.observe(lifecycle.camera);
    const result = scene.render(
      shell.framebuffer,
      shell.vehicle,
      lifecycle.camera,
      deriveVehicleSpriteFamily(shell.presentation),
      observations.sprites,
    );
    shell.present(mode, input, lifecycle.camera, result.playerScreenY, observations.rivals);
    raceStatus.textContent = race.label();
    performanceHud.frame(started);
    if (race.clock.status === 'GOAL' || race.clock.status === 'GAME_OVER') {
      controls.complete();
      shell.stop();
      shell.inputManager.setSuspended(true);
    }
  };
  const suspend = () => {
    shell.stop();
    shell.inputManager.setSuspended(true);
  };
  const controls = mountCourseSessionControls(canvas, settings, preset, course.rules.maxLaps, {
    start: () => {
      shell.inputManager.setSuspended(true);
      shell.inputManager.setSuspended(false);
      race.start();
    },
    pause: (paused) => {
      manualPause = paused;
      if (paused) {
        suspend();
        raceStatus.textContent = 'PAUSED';
      } else shell.start(tick, render);
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (!manualPause && (race.clock.status === 'RUNNING' || race.clock.status === 'READY'))
      shell.start(tick, render);
  });
  status.remove();
  shell.start(tick, render);
  if (parameters.get('autostart') === '1') controls.begin();
} catch (error) {
  console.error('Course could not start', error);
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => location.reload();
  status.append(retry);
}
