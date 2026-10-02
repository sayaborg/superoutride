import { browserContent } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { DEFAULT_RESULT_DELAY_SECONDS, mountResultDelayControls } from './result-delay-controls.js';
import { mountCameraControls } from './camera-controls.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { browserCourses, selectBrowserCourse, type BrowserCourseId } from './course-selection.js';
import { mountMobileCourseSelector } from './mobile-selector-controls.js';
import { mustGet } from './dom.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { loadEngineSounds } from '../content/engine-sound-catalog.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { loadSeriesCatalog } from '../content/series-catalog.js';
import { createRunState } from './run-state.js';
import { assembleRun, type Run, type RunPage, type RunRequest } from './run-assembly.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords } from '../audio/surface-sounds.js';
import { loadSurfaceSounds } from '../content/surface-sound-catalog.js';
import { loadAudioSettings } from '../content/audio-catalog.js';
import { browserStorage, openPlayerRecord } from './player-record.js';
import { loadTextTiles } from '../content/text-tiles-catalog.js';
import { createTextLayer } from '../view/text-layer.js';

/** Session parameters a course selection resets; other URL data is kept. */
const SESSION_PARAMETERS = ['mode', 'vehicle', 'rivals', 'laps', 'pool', 'autostart'] as const;

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
    const courses = browserCourses(content.manifest);
    const series = await loadSeriesCatalog(content, vehicles);
    const player = openPlayerRecord(browserStorage());
    const displaySettings = createDisplaySettings();
    const textLayer = createTextLayer(await loadTextTiles(content));
    const raceSprites = createRaceSprites(vehicles);
    // The one run; the page's frame callbacks drive it.
    let run: Run | null = null;
    const shell = createBrowserDrivingShell(
      courses,
      vehicles,
      surfaceSounds,
      await loadAudioSettings(content),
      player,
      {
        tick: () => run?.tick(),
        render: () => run?.render(),
      },
    );
    const raceStatus = document.createElement('output');
    raceStatus.setAttribute('role', 'status');
    raceStatus.setAttribute('aria-label', 'Session status');
    raceStatus.setAttribute('aria-live', 'off');
    raceStatus.className = 'course-status';
    canvas.insertAdjacentElement('afterend', raceStatus);
    // The camera definition in use: the product's until a DEV adjustment replaces it.
    let cameraDefinition = CAMERA_DEFINITION;
    const performanceHud = createCoursePerformanceHud(canvas);
    // RESULT (today, finishing the run state) follows GOAL or GAME OVER after the DEV delay, counted in fixed steps
    // while the loop, the field, rendering and sound continue.
    let resultDelaySeconds = DEFAULT_RESULT_DELAY_SECONDS;
    // The one run state drives the shell; it is running only while a run is loaded and nothing else holds.
    const runState = createRunState(window, document, shell.setRunning, (facts) => run?.controls.show(facts));
    mountResultDelayControls(resultDelaySeconds, (seconds) => (resultDelaySeconds = seconds));
    mountCameraControls((definition) => (cameraDefinition = definition));
    mountStripControls(displaySettings.stripMethod, (value) => {
      displaySettings.setStripMethod(value);
      run?.render();
    });

    const page: RunPage = {
      content,
      materials,
      series,
      vehicles,
      driving,
      player,
      displaySettings,
      raceSprites,
      textLayer,
      shell,
      canvas,
      raceStatus,
      performanceHud,
      runState,
      cameraDefinition: () => cameraDefinition,
      resultDelaySeconds: () => resultDelaySeconds,
      drawSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
      request: (next) => void request(next),
    };

    // The page holds one course: a request disposes of the current run before loading the next. One assembly runs at
    // a time; a request made while one runs is ignored. A failure leaves no run, shows its reason and offers Retry
    // and every course selection.
    let assembling = false;
    // The loaded run's course; null while no run is loaded.
    let loadedCourse: BrowserCourseId | null = null;
    const request = async (next: RunRequest) => {
      if (assembling) return;
      assembling = true;
      courseSelector.setActive(next.courseId);
      run?.dispose();
      run = null;
      loadedCourse = null;
      runState.unload();
      raceStatus.textContent = '';
      status.replaceChildren('Loading course…');
      status.hidden = false;
      try {
        run = await assembleRun(page, next);
        loadedCourse = next.courseId;
        status.hidden = true;
        runState.load();
        if (next.autostart) run.controls.begin();
      } catch (error) {
        console.error('Course could not start', error);
        const retry = document.createElement('button');
        retry.textContent = 'Retry';
        retry.onclick = () => void request(next);
        status.replaceChildren(
          `Course could not start: ${error instanceof Error ? error.message : String(error)} `,
          retry,
        );
      } finally {
        assembling = false;
      }
    };
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
    const initial = selectBrowserCourse(courses, parameters.get('course'));
    // Selecting the loaded course does nothing; any other course, or any course after a failure, starts a new run with
    // default Session settings.
    const courseSelector = mountMobileCourseSelector(
      mustGet<HTMLElement>('course-selector-buttons'),
      courses,
      initial.id,
      (target) => {
        if (assembling || target.id === loadedCourse) return;
        const next = new URLSearchParams(parameters);
        for (const key of SESSION_PARAMETERS) next.delete(key);
        void request({ courseId: target.id, parameters: next, autostart: false });
      },
    );
    runState.begin();
    await request({ courseId: initial.id, parameters, autostart: parameters.get('autostart') === '1' });
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
