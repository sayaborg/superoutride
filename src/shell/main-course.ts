import { browserContent } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { DEFAULT_RESULT_DELAY_SECONDS, mountResultDelayControls } from './result-delay-controls.js';
import { mountCameraControls } from './camera-controls.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { browserCourses } from './course-selection.js';
import { mustGet } from './dom.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { loadEngineSounds } from '../content/engine-sound-catalog.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { loadSeriesCatalog } from '../content/series-catalog.js';
import { createScreenHost } from './screen-host.js';
import { createRunScreen, createRunScreenState } from './run-screen.js';
import { createLoadFailedScreen, createLoadingScreen } from './loading-screen.js';
import { createSelectionFlow } from './selection-flow.js';
import { assembleRun, type Run, type RunPage } from './run-assembly.js';
import { readUrlRunRequest, type RunRequest } from './run-request.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords } from '../audio/surface-sounds.js';
import { loadSurfaceSounds } from '../content/surface-sound-catalog.js';
import { loadAudioSettings } from '../content/audio-catalog.js';
import { browserStorage, openPlayerRecord } from './player-record.js';
import { loadTextTiles } from '../content/text-tiles-catalog.js';
import { loadCourseIndex } from '../content/course-index.js';
import { createTextLayer } from '../view/text-layer.js';

/**
 * The one composition root: it creates the page lifetime once, then assembles one run at a time in the page. The URL
 * is read once, here; selections inside the page never rewrite it.
 */
async function startPage(): Promise<void> {
  const canvas = mustGet<HTMLCanvasElement>('game');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading course…';
  canvas.insertAdjacentElement('afterend', status);

  try {
    // The page lifetime: delivered content, catalogs, settings and browser devices are created once.
    const content = await browserContent();
    const materials = await loadSurfaceMaterials(content);
    const materialIds = materials.source.materials.map((material) => material.id);
    const surfaceSounds = {
      materialIds,
      surfaces: resolveSurfaceSoundRecords(await loadSurfaceSounds(content), materialIds),
    };
    const definitions = await loadVehicleDefinitions(content, await loadEngineSounds(content));
    const { vehicles, driving } = definitions;
    const parameters = new URLSearchParams(location.search);
    // `dev=1` is read here only. Without it no DEV panel, DEV HUD or DEV control is built.
    const dev = parameters.get('dev') === '1';
    if (dev) {
      const template = mustGet<HTMLTemplateElement>('dev-panel-template');
      template.replaceWith(template.content.cloneNode(true));
    }
    const courseIndex = await loadCourseIndex(content);
    const courses = browserCourses(courseIndex);
    const series = await loadSeriesCatalog(content, vehicles);
    const player = openPlayerRecord(browserStorage());
    const displaySettings = createDisplaySettings();
    const textLayer = createTextLayer(await loadTextTiles(content));
    const raceSprites = createRaceSprites(vehicles);
    // The one run, which the current run screen shows.
    let run: Run | null = null;
    const shell = createBrowserDrivingShell(vehicles, surfaceSounds, await loadAudioSettings(content), player);
    const present = () => shell.present();
    const loading = createLoadingScreen(shell.framebuffer, textLayer, present);
    // The one owner of the current screen; it runs the frame loop while the page is visible.
    const host = createScreenHost(window, document, shell, loading);
    const raceStatus = document.createElement('output');
    raceStatus.setAttribute('role', 'status');
    raceStatus.setAttribute('aria-label', 'Session status');
    raceStatus.setAttribute('aria-live', 'off');
    raceStatus.className = 'course-status';
    canvas.insertAdjacentElement('afterend', raceStatus);
    // The camera definition in use: the product's until a DEV adjustment replaces it.
    let cameraDefinition = CAMERA_DEFINITION;
    const performanceHud = dev ? createCoursePerformanceHud(canvas) : null;
    // RESULT follows GOAL or GAME OVER after the DEV delay, counted in fixed steps while the loop, the field,
    // rendering and sound continue.
    let resultDelaySeconds = DEFAULT_RESULT_DELAY_SECONDS;
    if (dev) {
      mountResultDelayControls(resultDelaySeconds, (seconds) => (resultDelaySeconds = seconds));
      mountCameraControls((definition) => (cameraDefinition = definition));
      // The frame loop redraws the current screen with the new method at the next frame, paused or not.
      mountStripControls(displaySettings.stripMethod, (value) => displaySettings.setStripMethod(value));
    }

    const page: RunPage = {
      content,
      materials,
      series,
      vehicles,
      driving,
      displaySettings,
      raceSprites,
      shell,
      raceStatus,
      performanceHud,
      dev,
      courses,
      cameraDefinition: () => cameraDefinition,
      resultDelaySeconds: () => resultDelaySeconds,
      drawSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
    };

    // The page holds one course: a request disposes of the current run before loading the next, which starts at once.
    // One assembly runs at a time; a request made while one runs is ignored. A failure leaves no run and shows LOAD
    // FAILED.
    let assembling = false;
    // A run that could not be requested or assembled shows LOAD FAILED with RETRY and BACK, and its reason with Retry
    // outside the frame.
    const fail = (error: unknown, retryRun: () => void, back: () => void) => {
      console.error('Course could not start', error);
      const leave = () => {
        status.hidden = true;
        back();
      };
      host.show(createLoadFailedScreen(shell.framebuffer, textLayer, present, { retry: retryRun, back: leave }));
      const retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.onclick = retryRun;
      status.replaceChildren(
        `Course could not start: ${error instanceof Error ? error.message : String(error)} `,
        retry,
      );
      status.hidden = false;
    };
    // Leaving a run for a selection screen ends it.
    const leave = (show: () => void) => {
      run?.dispose();
      run = null;
      raceStatus.textContent = '';
      show();
    };
    // `back` leaves LOAD FAILED: to the screen that requested the run, by default TITLE.
    const request = async (next: RunRequest, back = () => flow.title()) => {
      if (assembling) return;
      assembling = true;
      run?.dispose();
      run = null;
      host.show(loading);
      raceStatus.textContent = '';
      status.replaceChildren('Loading course…');
      status.hidden = false;
      try {
        const state = createRunScreenState(() => host.refresh());
        const assembled = await assembleRun(page, next, state);
        run = assembled;
        status.hidden = true;
        host.show(
          createRunScreen(state, assembled, shell.framebuffer, textLayer, {
            retry: () => void request(next, back),
            changeVehicle: () => leave(() => flow.vehicle(next)),
            select: () => leave(() => flow.select(next)),
            title: () => leave(() => flow.title()),
          }),
        );
      } catch (error) {
        fail(error, () => void request(next, back), back);
      } finally {
        assembling = false;
      }
    };
    if (dev) {
      const devPanel = mustGet<HTMLDetailsElement>('dev-panel');
      // Keys typed in DEV controls never reach driving input.
      devPanel.addEventListener('keydown', (event) => {
        event.stopPropagation();
      });
      devPanel.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Escape') {
            devPanel.open = false;
            devPanel.querySelector<HTMLElement>('summary')?.focus();
          }
        },
        true,
      );
    }
    // The selection screens request runs that start at once; LOAD FAILED's BACK returns to the last of them.
    const flow = createSelectionFlow(
      { courses: courseIndex, series, vehicles, player, dev },
      {
        frame: shell.framebuffer,
        text: textLayer,
        present,
        show: (screen) => host.show(screen),
        activate: () => shell.activate(),
        setMasterVolume: (percent) => shell.setMasterVolume(percent),
        run: (next, back) => void request(next, back),
      },
    );
    // A URL that names a delivered course starts that run at once; an invalid URL request fails like an assembly.
    // Otherwise the page starts at TITLE.
    const named = courses.find((course) => course.id === parameters.get('course')) ?? null;
    const urlRequest = (courseId: string) => {
      try {
        void request(readUrlRunRequest(parameters, courseId, series.courseSettings(courseId), vehicles, player));
      } catch (error) {
        fail(
          error,
          () => urlRequest(courseId),
          () => flow.title(),
        );
      }
    };
    if (named) urlRequest(named.id);
    else {
      status.hidden = true;
      flow.title();
    }
  } catch (error) {
    console.error('Course could not start', error);
    status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => location.reload();
    status.append(retry);
  }
}

await startPage();
