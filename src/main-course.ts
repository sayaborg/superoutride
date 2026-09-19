import { createBrowserDrivingShell } from './browser/driving-shell.js';
import { selectBrowserCourseMode } from './browser/course-mode-selection.js';
import { mustGet } from './browser/dom.js';
import { readCourseDocument } from './course/course-document.js';
import { compileCourseDocument } from './compiler/compiled-course.js';
import { advanceVehicleWithRecovery, RECOVERY_PROFILE } from './gameplay/recovery.js';
import type { DrivingInput } from './input/driving-input.js';
import { deriveVehicleSpriteFamily } from './render/vehicle-presentation.js';
import { createCourseScene } from './runtime/course-scene.js';

const canvas = mustGet<HTMLCanvasElement>('game');
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.textContent = 'Loading course…';
canvas.insertAdjacentElement('afterend', status);

async function fetchBytes(url: URL): Promise<Uint8Array> {
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
  const scene = createCourseScene(compiled.value.entry);
  const shell = createBrowserDrivingShell(scene.world, 0);
  const lifecycle = shell.mountControls({
    world: () => scene.world,
    recoveryProfile: RECOVERY_PROFILE,
    resync: () => {
      scene.recoverAtEntry(shell.vehicle, shell.recovery);
      scene.observeStep(shell, shell.vehicle, true);
    },
  });
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  status.remove();
  shell.start(
    (dt) => {
      input = shell.inputManager.sample();
      const previous = { x: shell.vehicle.x, z: shell.vehicle.z };
      const recovered = advanceVehicleWithRecovery(scene.world, shell.vehicle, {
        state: shell.recovery,
        input,
        dt,
        profile: RECOVERY_PROFILE,
      });
      const entryRecovered = scene.recoverAtEntry(shell.vehicle, shell.recovery);
      scene.observeStep(shell, previous, recovered !== null || entryRecovered);
      lifecycle.update(dt, recovered !== null || entryRecovered);
    },
    () => {
      const result = scene.render(
        shell.framebuffer,
        shell.vehicle,
        lifecycle.camera,
        deriveVehicleSpriteFamily(shell.presentation),
      );
      shell.present(mode, input, lifecycle.camera, result.playerScreenY);
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
