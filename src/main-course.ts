import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { selectBrowserCourseMode } from './browser/course-mode-selection.js';
import { mustGet } from './browser/dom.js';
import { readCourseDocument } from './course/course-document.js';
import { courseGroundPreflight, readCourseGround } from './compiler/course-ground.js';
import { compileCourseDocument } from './compiler/compiled-course.js';
import { advanceVehicleWithRecovery, RECOVERY_PROFILE } from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY } from './vehicle/vehicle-catalog.js';
import { createCourseRace } from './runtime/course-race.js';
import { createCoursePerformanceHud } from './browser/course-performance-hud.js';
import { COURSE_PLAY_SETTINGS } from './runtime/course-driving-policy.js';
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
  const scene = createCourseScene(compiled.value.entry, ground);
  const racing = source.value.type !== 'LINEAR';
  const shell = createBrowserDrivingShell(scene.world, COURSE_PLAY_SETTINGS.playerL, {
    s: COURSE_PLAY_SETTINGS.playerS,
    initialSpeed: racing ? COURSE_PLAY_SETTINGS.standingSpeed : COURSE_PLAY_SETTINGS.touringSpeed,
  });
  const race = racing
    ? createCourseRace({
        course: compiled.value,
        player: shell,
        playerSession: scene.session,
        createSession: scene.createActorSession,
        rivalCount: COURSE_PLAY_SETTINGS.rivalCount,
        lapCount: COURSE_PLAY_SETTINGS.lapCount,
        rival: {
          profile: DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
          torqueProtection: DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
          kind: deriveVehicleSpriteFamily(DEFAULT_VEHICLE_CATALOG_ENTRY),
        },
      })
    : null;
  const raceStatus = race ? document.createElement('output') : null;
  if (raceStatus) {
    raceStatus.setAttribute('role', 'status');
    raceStatus.setAttribute('aria-live', 'off');
    raceStatus.className = 'course-status';
    canvas.insertAdjacentElement('afterend', raceStatus);
  }
  const lifecycle = shell.mountControls({
    world: () => scene.world,
    recoveryProfile: RECOVERY_PROFILE,
    recoveryL: race ? () => race.recoveryL : undefined,
    resync: () => {
      scene.recoverAtEntry(shell.vehicle, shell.recovery);
      if (race) race.resyncPlayer();
      else scene.observeStep(shell, shell.vehicle, true);
    },
  });
  const performanceHud = createCoursePerformanceHud(canvas, scene.metrics, scene.groundMetrics);
  const previous = { x: 0, z: 0 };
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  status.remove();
  shell.start(
    (dt) => {
      const started = performance.now();
      input = shell.inputManager.sample();
      if (race) {
        lifecycle.update(dt, race.advance(input, dt));
        performanceHud.step(performance.now() - started);
        return;
      }
      previous.x = shell.vehicle.x;
      previous.z = shell.vehicle.z;
      const recovered = advanceVehicleWithRecovery(scene.world, shell.vehicle, {
        state: shell.recovery,
        input,
        dt,
        profile: RECOVERY_PROFILE,
      });
      const entryRecovered = scene.recoverAtEntry(shell.vehicle, shell.recovery);
      const transition = scene.observeStep(shell, previous, recovered !== null || entryRecovered);
      lifecycle.update(dt, recovered !== null || entryRecovered || transition === 'recovered');
      performanceHud.step(performance.now() - started);
    },
    () => {
      const started = performance.now();
      const observations = race?.observe(lifecycle.camera);
      const result = scene.render(
        shell.framebuffer,
        shell.vehicle,
        lifecycle.camera,
        deriveVehicleSpriteFamily(shell.presentation),
        observations?.sprites,
      );
      shell.present(mode, input, lifecycle.camera, result.playerScreenY, observations?.rivals);
      if (raceStatus && race) raceStatus.textContent = race.label();
      performanceHud.frame(started);
    },
  );
} catch (error) {
  console.error('Course could not start', error);
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => location.reload();
  status.append(retry);
}
