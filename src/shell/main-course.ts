import { createAudioTimingHud } from './audio-timing-hud.js';
import { browserContent, isOriginalsBuild, isWorkbenchRun } from './browser-content.js';
import { createRaceSprites } from '../view/race-sprites.js';
import { DEFAULT_RESULT_DELAY_SECONDS, mountResultDelayControls } from './result-delay-controls.js';
import { mountCrestControls } from './crest-controls.js';
import { mountSlowDownControls } from './slow-down-controls.js';
import { SLOW_DOWN } from '../race/slow-down.js';
import { mountCameraControls } from './camera-controls.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { createBrowserDevices } from './driving-shell.js';
import { createAudioLifecycle } from './audio-lifecycle.js';
import { mustGet } from './dom.js';
import { loadVehicleDefinitions, loadVehicleSpriteSet, spriteAssets } from '../content/vehicle-catalog.js';
import type { VehicleSpriteSet } from '../vehicle/vehicle-sprite-set.js';
import { createCountedReading } from '../content/content-delivery.js';
import { startupFiles } from './startup-files.js';
import { loadEngineSounds } from '../content/engine-sound-catalog.js';
import { loadEngineLoudness } from '../content/engine-loudness.js';
import { createCoursePerformanceHud } from './course-performance-hud.js';
import { loadSeriesCatalog } from '../content/series-catalog.js';
import {
  CONTROLS_PICTURE,
  loadScreenPicture,
  loadScreenPictures,
  TITLE_LOGO,
} from '../content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../content/free-play-rules.js';
import { createScreenHost, TRANSITION_STEPS } from './screen-host.js';
import { createMenuMusic } from './menu-music.js';
import { attractClasses, createAttractDemo, createDemoRandom } from './attract-demo.js';
import { createPreRaceScreen, preRaceCardOf } from './prerace-screen.js';
import { createRunVehicle, runVehicleSha256 } from '../content/run-vehicle.js';
import { SIM_DT } from '../race/fixed-step.js';
import { createRunScreen, createRunScreenState } from './run-screen.js';
import { createLoadFailedScreen, createLoadingScreen } from './loading-screen.js';
import { createSelectionFlow } from './selection-flow.js';
import { createCardFaces } from './card-face.js';
import { CARD_STYLES } from './card-styles.js';
import { loadFrontEndSelection } from '../content/front-end-selection.js';
import { assembleRun, createWatchedCourses, type Run, type RunPage } from './run-assembly.js';
import { createDemoReel } from './demo-director.js';
import { readUrlRunRequest, type RunRequest } from './run-request.js';
import { loadSurfaceMaterials } from '../content/surface-material-catalog.js';
import { loadSurfaceSounds } from '../content/surface-sound-catalog.js';
import { loadPuffs, PUFFS_ID } from '../content/puff-catalog.js';
import { loadContactExplosion } from '../content/contact-explosion-pictures.js';
import { explosionShowsVehicle } from '../view/contact-explosion-sprites.js';
import { mountPuffSettings } from './controls/puff-settings-controls.js';
import { downloadDefinition } from './definition-export.js';
import { loadAudioSettings } from '../content/audio-catalog.js';
import { browserStorage, openPlayerRecord } from './player-record.js';
import { loadTextTiles } from '../content/text-tiles-catalog.js';
import { loadCourseIndex } from '../content/course-index.js';
import { createTextLayer, TEXT_COLUMNS } from '../view/text-layer.js';
import { loadMusic } from '../content/recording-catalog.js';
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

  // Set once the frame can write text: how a startup that fails then shows it.
  let startupFailed: ((error: unknown) => void) | null = null;
  try {
    // The page lifetime: delivered content, catalogs, settings and browser devices are created once. The frame and input
    // stand as soon as the text tiles are read; the audio joins once its catalogs are.
    const content = await browserContent();
    const parameters = new URLSearchParams(location.search);
    // `dev=1` is read here only. Without it no DEV panel, DEV HUD or DEV control is built.
    const dev = parameters.get('dev') === '1';
    if (dev) {
      const template = mustGet<HTMLTemplateElement>('dev-panel-template');
      template.replaceWith(template.content.cloneNode(true));
      // A run of the workbench's build says so on its DEV toggle: its products are that compile's, not the published.
      if (isWorkbenchRun()) mustGet('dev-panel').querySelector('summary')!.prepend('WORKBENCH BUILD · ');
      // So does a local build with the originals: its pictures are the original's, which are never published.
      else if (await isOriginalsBuild()) mustGet('dev-panel').querySelector('summary')!.prepend('LOCAL ORIGINALS · ');
    }
    // With DEV, a loading run and a failure's reason with Retry also show outside the frame.
    const status = dev ? createStatus() : null;
    // The startup's one counted reading: its files are decided from the manifest before reading starts, and its work
    // runs in the run assembly's slices, so the frame loop and input run between them. LOADING shows its progress.
    const slices = createWorkSlices(LOADING_SLICE_MILLISECONDS, () => performance.now(), nextTask);
    let loading: ReturnType<typeof createLoadingScreen> | null = null;
    const reading = createCountedReading(content, startupFiles(content.manifest), slices, (bytes, total) =>
      loading?.progress(bytes / total),
    );
    const textTiles = await reading.read(loadTextTiles);
    const textLayer = createTextLayer(textTiles);
    const devices = createBrowserDevices();
    const present = () => devices.present();
    // The one owner of the current screen; it runs the frame loop while the page is visible. The page starts from
    // black, and LOADING stands on it at once, without brightening.
    const host = createScreenHost(window, document, devices, {
      live: false,
      tick() {},
      command() {},
      render() {},
    });
    // From here the frame writes text: a startup that fails shows LOAD FAILED in it, whose RETRY and BACK reload.
    startupFailed = (error) => {
      console.error('Course could not start', error);
      const reload = () => location.reload();
      host.show(createLoadFailedScreen(devices.framebuffer, textLayer, present, { retry: reload, back: reload }));
    };
    // LOADING stands on the picture of the controls once it is read.
    loading = createLoadingScreen(
      devices.framebuffer,
      textLayer,
      present,
      await reading.read((delivery) => loadScreenPicture(delivery, CONTROLS_PICTURE.id)),
    );
    host.cut(loading.screen);
    // The frame stands: every other startup file is fetched at once.
    reading.fetchAll();
    const materials = await reading.read(loadSurfaceMaterials);
    const materialIds = materials.source.materials.map((material) => material.id);
    const engineSounds = await reading.read(loadEngineSounds);
    // Each vehicle sprite set is read on its own, its admission sliced between its pictures.
    const sets: Record<string, VehicleSpriteSet> = {};
    for (const { id } of content.manifest.files.filter((file) => file.kind === 'vehicle-sprite-set'))
      sets[id] = await reading.read((delivery) => loadVehicleSpriteSet(delivery, id, slices));
    const definitions = await reading.read((delivery) =>
      loadVehicleDefinitions(delivery, engineSounds, spriteAssets(sets)),
    );
    const { vehicles, driving } = definitions;
    const courseIndex = await reading.read(loadCourseIndex);
    const screenPictures = await reading.read((delivery) => loadScreenPictures(delivery, slices));
    const music = await reading.read((delivery) => loadMusic(delivery, TEXT_COLUMNS));
    const series = await reading.read((delivery) => loadSeriesCatalog(delivery, vehicles, screenPictures, music));
    const freePlay = await reading.read(loadFreePlayRules);
    const player = openPlayerRecord(browserStorage());
    const frontEnd = await reading.read((delivery) => loadFrontEndSelection(delivery, series, screenPictures, music));
    const explosion = await reading.read((delivery) => loadContactExplosion(delivery, slices));
    // A stopped vehicle is drawn on the frames its explosion's script draws it standing.
    const raceSprites = createRaceSprites(vehicles, (response) => explosionShowsVehicle(explosion.script, response));
    const puffs = await reading.read((delivery) => loadPuffs(delivery, materialIds, slices));
    // DEV's PUFFS group and its export, for the page's lifetime; new runs throw with its values.
    const puffSettings = dev ? mountPuffSettings(mustGet('puff-settings'), puffs) : null;
    if (puffSettings)
      mustGet('export-puffs-button').addEventListener('click', () =>
        downloadDefinition(`${PUFFS_ID}.json`, puffSettings.read()),
      );
    // The one run, which the current run screen shows.
    let run: Run | null = null;
    const audioSettings = await reading.read(loadAudioSettings);
    const surfaceSounds = await reading.read(loadSurfaceSounds);
    const engineLoudness = await reading.read((delivery) =>
      loadEngineLoudness(delivery, vehicles, audioSettings.sha256),
    );
    reading.finish();
    const shell = devices.joinAudio(
      createAudioLifecycle(
        vehicles,
        {
          materialIds,
          surfaces: surfaceSounds,
          engines: engineSounds,
          engineLoudness,
        },
        audioSettings,
        player,
        (id) => content.bytes('recording', id),
      ),
    );
    // The rows' music: a series' title track plays from SELECT SERIES until the run's READY.
    const menuMusic = createMenuMusic(shell);
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
    // The player's SLOW DOWN stages: the owner's utilizations until DEV changes them for the next runs.
    let slowDownUtilizations = SLOW_DOWN.utilizations;
    // The crests rule's speed the next course loaded is laid with: none, the courses as saved, until DEV sets it.
    let crestKmh: number | null = null;
    if (dev) {
      mountCrestControls((kmh) => (crestKmh = kmh));
      mountResultDelayControls(resultDelaySeconds, (seconds) => (resultDelaySeconds = seconds));
      mountSlowDownControls((utilizations) => (slowDownUtilizations = utilizations));
      mountCameraControls((definition) => (cameraDefinition = definition));
    }

    // Each vehicle's identity, which records are kept against.
    const vehicleSha256 = new Map<string, string>();
    for (const vehicle of vehicles)
      vehicleSha256.set(
        vehicle.compiledVehicle.id,
        await runVehicleSha256(createRunVehicle(vehicle, driving), materials),
      );
    const page: RunPage = {
      content,
      materials,
      series,
      courses: courseIndex,
      freePlay,
      music,
      vehicles,
      driving,
      raceSprites,
      puffs,
      explosion,
      puffRecords: () => puffSettings?.read() ?? puffs.source,
      shell,
      performanceHud,
      dev,
      player,
      vehicleSha256,
      cameraDefinition: () => cameraDefinition,
      resultDelaySeconds: () => resultDelaySeconds,
      crestKmh: () => crestKmh,
      slowDownUtilizations: () => slowDownUtilizations,
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
          prepared: (facts) => card.facts(facts),
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
    // The attract demo behind TITLE: at most the shown and the next class's watched runs, each holding its course's
    // compilation, which the classes of one course share; released with the page.
    const watchedCourses = createWatchedCourses();
    // The demo's one random source is seeded by the start time (K, 2026-11-14).
    const attractDemo = createAttractDemo(
      attractClasses(series.series),
      vehicles,
      courseIndex,
      createDemoRandom(Date.now()),
      async (next, words, random) => {
        const state = createRunScreenState(() => {});
        const run = await assembleRun(page, next, state, undefined, watchedCourses);
        return createDemoReel(run, () => state.finished, vehicles, page.cameraDefinition(), words, random);
      },
    );
    window.addEventListener('pagehide', () => attractDemo.dispose());
    // The cards' style while their design is tried (K, 2026-11-12): SETTINGS' CARD DESIGN and the C key step it.
    let shownStyle = 0;
    const cardStyle = {
      current: () => CARD_STYLES[shownStyle]!,
      step: (by: -1 | 1) => {
        shownStyle = (shownStyle + by + CARD_STYLES.length) % CARD_STYLES.length;
      },
    };
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyC' && !event.repeat) cardStyle.step(1);
    });
    // The rows request runs that start at once; LOAD FAILED's BACK returns to the row that requested one.
    const flow = createSelectionFlow(
      {
        courses: courseIndex,
        series,
        frontEnd,
        vehicles,
        driving,
        freePlay,
        music,
        player,
        dev,
        logo: screenPictures.get(TITLE_LOGO.id)!,
        cardStyle,
      },
      {
        frame: shell.framebuffer,
        text: textLayer,
        faces: createCardFaces(textTiles, cardStyle.current),
        present,
        show: (screen) => host.show(screen),
        activate: () => shell.activate(),
        demo: attractDemo,
        engine: (engine) => shell.updateAudio(engine, []),
        setVolume: (name, percent) => shell.setVolume(name, percent),
        audition: (track) => {
          const audition = playTrack(shell, track);
          return () => audition.stop();
        },
        music: menuMusic,
        run: (next, back) => void request(next, back),
      },
    );
    // LOADING leaves once it has shown 100%, by line thinning, for TITLE or a URL's run's PRE-RACE card.
    await loading.completed;
    // A URL that names a run (a series and class, or a course) starts it at once; an invalid URL request fails like an
    // assembly. Otherwise the page starts at TITLE.
    const urlRequest = () => {
      try {
        const named = readUrlRunRequest(parameters, series, vehicles, freePlay, player);
        if (named) void request(named, undefined, true);
        else flow.title();
      } catch (error) {
        fail(error, urlRequest, () => flow.title());
      }
    };
    urlRequest();
  } catch (error) {
    if (startupFailed) return startupFailed(error);
    // The page itself could not start before the frame could write text: its reason and a reload show outside it.
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
