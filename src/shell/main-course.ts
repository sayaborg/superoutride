import { createAudioTimingHud } from './audio-timing-hud.js';
import { browserContent, isWorkbenchRun } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { createDisplaySettings } from '../view/display-settings.js';
import { mountStripControls } from './strip-controls.js';
import { DEFAULT_RESULT_DELAY_SECONDS, mountResultDelayControls } from './result-delay-controls.js';
import { mountCameraControls } from './camera-controls.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { createBrowserDrivingShell } from './driving-shell.js';
import { mustGet } from './dom.js';
import { loadVehicleDefinitions } from '../content/vehicle-catalog.js';
import { loadEngineSounds } from '../content/engine-sound-catalog.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { loadSeriesCatalog } from '../content/series-catalog.js';
import { loadScreenPictures, TITLE_LOGO } from '../content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../content/free-play-rules.js';
import { createScreenHost, TRANSITION_STEPS } from './screen-host.js';
import { createMenuMusic } from './menu-music.js';
import { attractClasses, createAttractDemo } from './attract-demo.js';
import { createPreRaceScreen, preRaceCardOf } from './prerace-screen.js';
import { createCourseMap } from '../view/course-map.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../content/session-vehicle.js';
import { SIM_DT } from '../race/fixed-step.js';
import { createRunScreen, createRunScreenState } from './run-screen.js';
import { createLoadFailedScreen } from './loading-screen.js';
import { createSelectionFlow } from './selection-flow.js';
import { assembleRun, createDemoCourses, type Run, type RunPage } from './run-assembly.js';
import { readUrlRunRequest, type RunRequest } from './run-request.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords } from '../audio/surface-sounds.js';
import { loadSurfaceSounds } from '../content/surface-sound-catalog.js';
import { loadAudioSettings } from '../content/audio-catalog.js';
import { browserStorage, openPlayerRecord } from './player-record.js';
import { loadTextTiles } from '../content/text-tiles-catalog.js';
import { loadCourseIndex } from '../content/course-index.js';
import { createTextLayer, TEXT_COLUMNS } from '../view/text-layer.js';
import { loadMusic } from '../content/recording-catalog.js';
import { loadWallSounds } from '../content/wall-sound-catalog.js';
import { wallSoundRecords } from '../audio/wall-sounds.js';
import { playTrack } from './run-music.js';
import { createWorkSlices } from '../core/work-slices.js';

/**
 * Milliseconds of loading work between yields to the frame loop, so a run loading never stops frames
 * ([Browser](../../docs/browser.md#display-and-scheduling)).
 */
const LOADING_SLICE_MILLISECONDS = 8;

/** Yield to the event loop for one task: the frame loop and input run before the work goes on. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/**
 * The one composition root: it creates the page lifetime once, then assembles one run at a time in the page. The URL
 * is read once, here; selections inside the page never rewrite it.
 */
async function startPage(): Promise<void> {
  const canvas = mustGet<HTMLCanvasElement>('game');
  // Text outside the frame: the product shows the PRE-RACE card and LOAD FAILED inside it, so this appears only with DEV, or when
  // the page itself cannot start and the frame cannot draw text.
  const createStatus = () => {
    const element = document.createElement('p');
    element.setAttribute('role', 'status');
    // Its Retry is UI: a touch on it starts no driving or menu touch and keeps the browser's click.
    element.setAttribute('data-driving-input', 'ignore');
    canvas.insertAdjacentElement('afterend', element);
    return element;
  };

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
      // A run of the workbench's build says so on its DEV toggle: its products are that compile's, not the published.
      if (isWorkbenchRun()) mustGet('dev-panel').querySelector('summary')!.prepend('WORKBENCH BUILD · ');
    }
    // With DEV, a loading run and a failure's reason with Retry also show outside the frame.
    const status = dev ? createStatus() : null;
    const courseIndex = await loadCourseIndex(content);
    const screenPictures = await loadScreenPictures(content);
    const music = await loadMusic(content, TEXT_COLUMNS);
    const series = await loadSeriesCatalog(content, vehicles, screenPictures, music);
    const freePlay = await loadFreePlayRules(content);
    const player = openPlayerRecord(browserStorage());
    const displaySettings = createDisplaySettings();
    const textLayer = createTextLayer(await loadTextTiles(content));
    const raceSprites = createRaceSprites(vehicles);
    // The one run, which the current run screen shows.
    let run: Run | null = null;
    const shell = createBrowserDrivingShell(
      vehicles,
      surfaceSounds,
      wallSoundRecords(await loadWallSounds(content)),
      await loadAudioSettings(content),
      player,
      (id) => content.bytes('recording', id),
    );
    const present = () => shell.present();
    // The selection screens' music: a series' title track plays from SELECT SERIES until the run's READY.
    const menuMusic = createMenuMusic(shell);
    // The one owner of the current screen; it runs the frame loop while the page is visible.
    // The page starts from black; the first screen, TITLE or a URL's run, brightens from it.
    const host = createScreenHost(window, document, shell, {
      live: false,
      tick() {},
      command() {},
      render() {},
    });
    // The camera definition in use: the product's until a DEV adjustment replaces it.
    let cameraDefinition = CAMERA_DEFINITION;
    // DEV's measurement lines stack at the top of the page, clear of the HUD's lower rows.
    const devLines = dev ? document.createElement('div') : null;
    if (devLines) {
      devLines.className = 'dev-lines';
      canvas.insertAdjacentElement('afterend', devLines);
    }
    const performanceHud = devLines ? createCoursePerformanceHud(devLines) : null;
    if (devLines) createAudioTimingHud(devLines, shell.audioTiming);
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
      freePlay,
      music,
      vehicles,
      driving,
      displaySettings,
      raceSprites,
      shell,
      performanceHud,
      dev,
      player,
      cameraDefinition: () => cameraDefinition,
      resultDelaySeconds: () => resultDelaySeconds,
      drawSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
      workSlices: () => createWorkSlices(LOADING_SLICE_MILLISECONDS, () => performance.now(), nextTask),
    };

    // The page holds one course: a request disposes of the current run before loading the next, which starts at once.
    // One assembly runs at a time; a request made while one runs is ignored. A failure leaves no run and shows LOAD
    // FAILED.
    let assembling = false;
    // A run that could not be requested or assembled shows LOAD FAILED with RETRY and BACK; its reason goes to the
    // console and, with DEV, outside the frame with Retry.
    const fail = (error: unknown, retryRun: () => void, back: () => void) => {
      console.error('Course could not start', error);
      const leave = () => {
        if (status) status.hidden = true;
        back();
      };
      host.show(createLoadFailedScreen(shell.framebuffer, textLayer, present, { retry: retryRun, back: leave }));
      if (!status) return;
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
      show();
    };
    // `back` leaves LOAD FAILED: to the screen that requested the run, by default TITLE. A run the URL names starts
    // directly, for development and tests: its PRE-RACE card leaves once it is loaded, without black between.
    const request = async (next: RunRequest, back = () => flow.title(), direct = false) => {
      if (assembling) return;
      assembling = true;
      run?.dispose();
      run = null;
      if (status) {
        status.replaceChildren('Loading course…');
        status.hidden = false;
      }
      try {
        // The PRE-RACE card stands while the run loads, at least its minimum time.
        let shown = () => {};
        const standing = new Promise<void>((resolve) => (shown = resolve));
        const card = createPreRaceScreen(
          shell.framebuffer,
          textLayer,
          present,
          preRaceCardOf(next, series, courseIndex),
          () => shown(),
        );
        host.show(card.screen);
        shell.playRecording('effects/prerace', 'effects');
        const state = createRunScreenState(() => host.refresh());
        const assembled = await assembleRun(page, next, state, {
          progress: (fraction) => card.progress(fraction),
          prepared: ({ course, ...facts }) => card.facts({ map: createCourseMap(course), ...facts }),
        });
        run = assembled;
        card.loaded();
        if (!direct) await standing;
        if (status) status.hidden = true;
        // The title track fades out over the black transition into READY.
        menuMusic.fadeOut(TRANSITION_STEPS * SIM_DT);
        const screen = createRunScreen(state, assembled, shell.framebuffer, textLayer, {
          retry: () => void request(next, back),
          changeVehicle: () => leave(() => flow.vehicle(next)),
          select: () => leave(() => flow.select(next)),
          title: () => leave(() => flow.title()),
        });
        if (direct) host.cut(screen);
        else host.show(screen);
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
    // The attract demo behind TITLE: at most the shown and the next class's Sessions, each holding its course's
    // compilation, which the classes of one course share; released with the page.
    const demoCourses = createDemoCourses();
    const attractDemo = createAttractDemo(attractClasses(series.series), vehicles, async (next) => {
      const state = createRunScreenState(() => {});
      const run = await assembleRun(page, next, state, undefined, demoCourses);
      return { run, finished: () => state.finished };
    });
    window.addEventListener('pagehide', () => attractDemo.dispose());
    // The selection screens request runs that start at once; LOAD FAILED's BACK returns to the last of them.
    // Each vehicle's identity, which records are kept against, for the records SELECT CLASS shows.
    const vehicleSha256 = new Map<string, string>();
    for (const vehicle of vehicles)
      vehicleSha256.set(
        vehicle.compiledVehicle.id,
        await sessionVehicleSha256(createSessionVehicle(vehicle, driving), materials),
      );
    const flow = createSelectionFlow(
      {
        courses: courseIndex,
        series,
        vehicles,
        driving,
        freePlay,
        music,
        player,
        dev,
        vehicleSha256,
        logo: screenPictures.get(TITLE_LOGO.id)!,
      },
      {
        frame: shell.framebuffer,
        text: textLayer,
        present,
        show: (screen) => host.show(screen),
        activate: () => shell.activate(),
        titleBackground: attractDemo,
        setVolume: (name, percent) => shell.setVolume(name, percent),
        audition: (track) => {
          const audition = playTrack(shell, track);
          return () => audition.stop();
        },
        titleMusic: (track, crossfadeSeconds) => menuMusic.play(track, crossfadeSeconds),
        run: (next, back) => void request(next, back),
      },
    );
    // A URL that names a run (a series and class, or a course) starts it at once; an invalid URL request fails like an
    // assembly. Otherwise the page starts at TITLE.
    const urlRequest = () => {
      try {
        const named = readUrlRunRequest(parameters, series, vehicles, freePlay, player, music);
        if (named) void request(named, undefined, true);
        else flow.title();
      } catch (error) {
        fail(error, urlRequest, () => flow.title());
      }
    };
    urlRequest();
  } catch (error) {
    // The page itself could not start: the frame cannot draw text, so its reason and a reload show outside it.
    console.error('Course could not start', error);
    const status = createStatus();
    status.textContent = `Course could not start: ${error instanceof Error ? error.message : String(error)} `;
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.onclick = () => location.reload();
    status.append(retry);
  }
}

await startPage();
