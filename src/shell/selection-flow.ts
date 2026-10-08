import type { CourseIndex } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { gridRivalCapacity } from '../race/session-configuration.js';
import { sessionPlayerColor } from '../race/course-session.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { createMenuScreen, type MenuDefinition, type MenuItem } from './menu.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import { MODE_NAMES, latestTrack, recordedColor, type RunRequest } from './run-request.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { Screen } from './screen-host.js';
import { createVehicleScreen } from './vehicle-screen.js';
import { showSettings } from './settings-screens.js';

type Mode = RunRequest['mode'];
type Step = 'SERIES' | 'CLASS' | 'COURSE' | 'VEHICLE' | 'OPTIONS' | 'LAPS' | 'MUSIC';

/** The selection screens after SELECT MODE, by mode; SELECT MUSIC is last, and its confirm requests the run. */
const FLOW: Readonly<Record<Mode, readonly Step[]>> = Object.freeze({
  ARCADE: ['SERIES', 'CLASS', 'VEHICLE', 'MUSIC'],
  FREE_PLAY: ['COURSE', 'VEHICLE', 'OPTIONS', 'MUSIC'],
  TIME_TRIAL: ['COURSE', 'VEHICLE', 'LAPS', 'MUSIC'],
});
const MODES = (Object.keys(MODE_NAMES) as Mode[]).map((mode) => ({ mode, label: MODE_NAMES[mode] }));

/**
 * What the selection offers: delivered courses, series and vehicles, FREE PLAY's rules, and whether DEV content is
 * shown.
 */
export interface SelectionCatalog {
  readonly courses: CourseIndex;
  readonly series: SeriesCatalog;
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly freePlay: FreePlayRules;
  /** The delivered tracks in selection order. */
  readonly music: MusicCatalog;
  readonly player: PlayerRecord;
  /** `dev=1`: DEV series and courses in no series are offered. */
  readonly dev: boolean;
}

/** Where the selection draws and what its screens lead to. */
export interface SelectionDevices {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  present(): void;
  show(screen: Screen): void;
  /** A confirm on TITLE: the user gesture that enables sound and fullscreen where the browser allows them. */
  activate(): void;
  /** Request the selected run; `back` returns to the last selection screen. */
  run(request: RunRequest, back: () => void): void;
  /** Set a volume in percent. */
  setVolume(name: VolumeName, percent: number): void;
  /** Play `track` from its start as an audition; the returned function stops it. */
  audition(track: MusicTrack): () => void;
}

/**
 * The selection flow from TITLE to a run request. TITLE leads to SELECT MODE, and each mode's screens follow the flow
 * table; SELECT CLASS appears only for a series with several classes, LAPS only on a course with several laps. BACK returns to the previous screen. A mode, series or course that offers nothing to select is DARK.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, player, dev, freePlay, music } = catalog;
  // FREE PLAY's POOL and TRAFFIC choices, in their rules' order; TRAFFIC starts with OFF.
  const pools = freePlay.rivalPools.map((pool) => pool.id);
  const trafficLevels = [NO_TRAFFIC, ...freePlay.traffic.map((level) => level.id)];
  const series = catalog.series.series.filter((s) => (dev || !s.dev) && s.classes.length > 0);
  const inSeries = new Set(catalog.series.series.flatMap((s) => s.classes.map((c) => c.course)));
  // FREE PLAY and TIME TRIAL courses grouped by series, each course once: under the first offered series running it,
  // in its classes' order. Courses in no series follow last, only with DEV.
  const listed = new Set<string>();
  const groups = [
    ...series.map((s) => ({
      title: s.title,
      ids: s.classes.map((c) => c.course).filter((id) => !listed.has(id) && listed.add(id)),
    })),
    ...(dev ? [{ title: '', ids: courses.filter((c) => !inSeries.has(c.id)).map((c) => c.id) }] : []),
  ].filter((group) => group.ids.length > 0);
  const offered = (mode: Mode) => (mode === 'ARCADE' ? series.length > 0 : groups.length > 0);
  const courseOf = (id: string) => courses.find((c) => c.id === id)!;

  // The latest choice on each selection screen, kept in the player record; a screen starts from the current
  // selection, else the latest, else its first selectable item.
  const latest = (key: string): string | undefined => player.settings.latestSelections[key];
  const remember = (key: string, value: string) =>
    player.updateSettings({ latestSelections: { ...player.settings.latestSelections, [key]: value } });
  // A remembered whole number within [min, max], else null.
  const latestCount = (key: string, min: number, max: number) => {
    const value = Number(latest(key));
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  };
  // The current selection.
  let mode: Mode = MODES.find((m) => m.mode === latest('mode'))?.mode ?? 'ARCADE',
    step = -1,
    seriesChoice: CompiledSeries | null = null,
    classChoice: SeriesClass | null = null,
    courseId: string | null = null,
    vehicleId: string | null = null,
    color: string | null = null,
    track: string | null = null,
    lapCount = latestCount('laps', 1, Infinity) ?? 1,
    rivalCount = latestCount('rivals', 0, SESSION_RULE_LIMITS.rivals) ?? 0,
    rivalPool = pools.find((pool) => pool === latest('pool')) ?? pools[0]!,
    traffic = trafficLevels.find((level) => level === latest('traffic')) ?? NO_TRAFFIC;
  // The most rivals a course's grid holds within the Session rules: the RIVALS range, which a course change keeps to.
  const maxRivals = (id: string) => Math.min(SESSION_RULE_LIMITS.rivals, gridRivalCapacity(courseOf(id).gridSlots));
  const needed = (at: Step) =>
    at === 'CLASS' ? seriesChoice!.classes.length > 1 : at === 'LAPS' ? courseOf(courseId!).maxLaps > 1 : true;
  const menu = (definition: MenuDefinition, initial = 0) =>
    devices.show(createMenuScreen(devices.frame, devices.text, devices.present, definition, initial));
  const back = () => {
    do step--;
    while (step >= 0 && !needed(FLOW[mode][step]!));
    if (step < 0) selectMode();
    else showStep();
  };
  const forward = () => {
    do step++;
    while (step < FLOW[mode].length && !needed(FLOW[mode][step]!));
    if (step < FLOW[mode].length) showStep();
    else devices.run(request(), back);
  };
  const request = (): RunRequest => {
    const choice = { vehicleId: vehicleId!, color, track: track! };
    if (mode === 'ARCADE')
      return Object.freeze({ ...choice, mode, seriesId: seriesChoice!.id, classId: classChoice!.id });
    const course = { ...choice, courseId: courseId! };
    if (mode === 'TIME_TRIAL') return Object.freeze({ ...course, mode, lapCount });
    return Object.freeze({ ...course, mode, lapCount, rivalCount, rivalPool, traffic });
  };
  // A number item LEFT/RIGHT changes within [min, max].
  const number = (label: string, value: () => number, set: (n: number) => void, min: number, max: number) => ({
    label,
    value: String(value()),
    adjust: (by: -1 | 1) => set(Math.min(max, Math.max(min, value() + by))),
  });
  // OPTIONS and LAPS lead on to SELECT MUSIC.
  const next: MenuItem = { label: 'NEXT', confirm: forward };

  function title() {
    step = -1;
    const items: readonly MenuItem[] = [
      {
        label: 'START',
        confirm: () => {
          devices.activate();
          selectMode();
        },
      },
      {
        label: 'SETTINGS',
        confirm: () => {
          devices.activate();
          showSettings(
            player,
            {
              menu,
              setVolume: devices.setVolume,
              audition: () => devices.audition(music.find((t) => t.id === latestTrack(player, music))!),
            },
            title,
          );
        },
      },
    ];
    menu({ title: 'SUPER OUTRIDE', items: () => items });
  }
  function selectMode() {
    step = -1;
    const items = MODES.map((m): MenuItem => ({
      label: m.label,
      disabled: !offered(m.mode),
      confirm: () => {
        if (m.mode !== mode) [seriesChoice, classChoice, courseId, vehicleId] = [null, null, null, null];
        mode = m.mode;
        remember('mode', mode);
        forward();
      },
    }));
    menu(
      { title: 'SELECT MODE', items: () => items, back: title },
      Math.max(
        0,
        MODES.findIndex((m) => m.mode === mode),
      ),
    );
  }
  function showStep() {
    switch (FLOW[mode][step]!) {
      case 'SERIES': {
        const items = series.map((s): MenuItem => ({
          label: s.title,
          confirm: () => {
            // A series with one class needs no SELECT CLASS.
            if (s !== seriesChoice) [classChoice, vehicleId] = [s.classes.length === 1 ? s.classes[0]! : null, null];
            seriesChoice = s;
            remember('series', s.id);
            forward();
          },
        }));
        const current = series.findIndex((s) => s.id === (seriesChoice?.id ?? latest('series')));
        return menu({ title: 'SELECT SERIES', items: () => items, back }, Math.max(0, current));
      }
      case 'CLASS': {
        const items = seriesChoice!.classes.map((c): MenuItem => ({
          label: c.title,
          confirm: () => {
            // Another class offers its own vehicles.
            if (c !== classChoice) vehicleId = null;
            classChoice = c;
            remember('class', c.id);
            forward();
          },
        }));
        const current = seriesChoice!.classes.findIndex((c) => c.id === (classChoice?.id ?? latest('class')));
        return menu({ title: 'SELECT CLASS', items: () => items, back }, Math.max(0, current));
      }
      case 'COURSE': {
        // Series titles head their groups; they cannot be chosen.
        const rows = groups.flatMap((group) => [
          ...(groups.length > 1 || group.title ? [{ id: null, label: group.title || ' ' }] : []),
          ...group.ids.map((id) => ({ id, label: courseOf(id).name })),
        ]);
        const items = rows.map(({ id, label }): MenuItem =>
          id === null
            ? { label, disabled: true }
            : {
                label,
                confirm: () => {
                  courseId = id;
                  lapCount = Math.min(lapCount, courseOf(id).maxLaps);
                  rivalCount = Math.min(rivalCount, maxRivals(id));
                  remember('course', id);
                  forward();
                },
              },
        );
        const current = rows.findIndex((row) => row.id !== null && row.id === (courseId ?? latest('course')));
        return menu({ title: 'SELECT COURSE', items: () => items, back }, Math.max(0, current));
      }
      case 'VEHICLE': {
        const candidates =
          mode === 'ARCADE'
            ? classChoice!.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!)
            : vehicles;
        return devices.show(
          createVehicleScreen(
            devices.frame,
            devices.text,
            devices.present,
            candidates,
            {
              vehicleId: vehicleId ?? latest('vehicle') ?? null,
              fixedColors: mode === 'ARCADE' && seriesChoice!.fixedColors,
              // The color the Session gives the player: with fixed colors its class entry's.
              colorOf: (v) => sessionPlayerColor(mode === 'ARCADE' ? classChoice : null, v, recordedColor(player, v)),
            },
            {
              confirm: (vehicle, chosen) => {
                const id = vehicle.compiledVehicle.id;
                if (chosen !== null)
                  player.updateSettings({ vehicleColors: { ...player.settings.vehicleColors, [id]: chosen } });
                // A vehicle other than the current or latest one sets POOL to its form.
                if (id !== (vehicleId ?? latest('vehicle'))) rivalPool = formPool(freePlay, vehicle).id;
                [vehicleId, color] = [id, chosen];
                remember('vehicle', id);
                forward();
              },
              back,
            },
          ),
        );
      }
      case 'OPTIONS': {
        const maxLaps = courseOf(courseId!).maxLaps;
        const items = (): readonly MenuItem[] => [
          // Every option is a player setting, kept in the record.
          number(
            'RIVALS',
            () => rivalCount,
            (n) => remember('rivals', String((rivalCount = n))),
            0,
            maxRivals(courseId!),
          ),
          {
            label: 'POOL',
            value: rivalPool,
            adjust: (by) => {
              rivalPool = pools[(pools.indexOf(rivalPool) + by + pools.length) % pools.length]!;
              remember('pool', rivalPool);
            },
          },
          {
            label: 'TRAFFIC',
            value: traffic,
            adjust: (by) => {
              const levels = trafficLevels;
              traffic = levels[(levels.indexOf(traffic) + by + levels.length) % levels.length]!;
              remember('traffic', traffic);
            },
          },
          ...(maxLaps > 1
            ? [
                number(
                  'LAPS',
                  () => lapCount,
                  (n) => remember('laps', String((lapCount = n))),
                  1,
                  maxLaps,
                ),
              ]
            : []),
          next,
        ];
        return menu({ title: 'OPTIONS', items, back });
      }
      case 'LAPS': {
        const maxLaps = courseOf(courseId!).maxLaps;
        return menu({
          title: 'LAPS',
          items: () => [
            number(
              'LAPS',
              () => lapCount,
              (n) => remember('laps', String((lapCount = n))),
              1,
              maxLaps,
            ),
            next,
          ],
          back,
        });
      }
      case 'MUSIC': {
        // The track under the cursor plays from its start; CONFIRM starts the run with it.
        const items = music.map((t): MenuItem => ({
          label: t.title,
          focus: () => devices.audition(t),
          confirm: () => {
            track = t.id;
            remember('music', t.id);
            forward();
          },
        }));
        const current = music.findIndex((t) => t.id === (track ?? latest('music')));
        return menu({ title: 'SELECT MUSIC', items: () => items, back }, Math.max(0, current));
      }
    }
  }
  // A run's request becomes the current selection.
  const adopt = (run: RunRequest) => {
    mode = run.mode;
    [vehicleId, color, track] = [run.vehicleId, run.color, run.track];
    if (run.mode === 'ARCADE') {
      classChoice = catalog.series.seriesClass(run.seriesId, run.classId);
      [seriesChoice, courseId] = [classChoice?.series ?? null, null];
    } else [seriesChoice, classChoice, courseId, lapCount] = [null, null, run.courseId, run.lapCount];
    if (run.mode === 'FREE_PLAY') [rivalCount, rivalPool, traffic] = [run.rivalCount, run.rivalPool, run.traffic];
  };
  return Object.freeze({
    title,
    /** SELECT VEHICLE with `run`'s selection. */
    vehicle(run: RunRequest) {
      adopt(run);
      step = FLOW[mode].indexOf('VEHICLE');
      showStep();
    },
    /** The first selection screen of `run`'s mode, with its selection. */
    select(run: RunRequest) {
      adopt(run);
      step = -1;
      forward();
    },
  });
}
