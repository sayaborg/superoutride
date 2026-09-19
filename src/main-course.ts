import { createBrowserDrivingShell } from './browser/driving-shell.js';
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
  const bytes = await fetchBytes(new URL('courses/linear.course.json', root));
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
  const lifecycle = shell.mountControls({ world: () => scene.world, recoveryProfile: RECOVERY_PROFILE });
  let input: DrivingInput = { steering: 0, throttle: false, brake: false };
  status.remove();
  shell.start(
    (dt) => {
      input = shell.inputManager.sample();
      const recovered = advanceVehicleWithRecovery(scene.world, shell.vehicle, {
        state: shell.recovery,
        input,
        dt,
        profile: RECOVERY_PROFILE,
      });
      lifecycle.update(dt, recovered !== null);
    },
    () => {
      const result = scene.render(
        shell.framebuffer,
        shell.vehicle,
        lifecycle.camera,
        deriveVehicleSpriteFamily(shell.presentation),
      );
      shell.present('trial', input, lifecycle.camera, result.playerScreenY);
    },
    true,
  );
} catch (error) {
  console.error('Course could not start', error);
  status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.onclick = () => location.reload();
  status.append(retry);
}
