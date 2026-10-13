import type { CourseIndex } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { gridRivalCapacity } from '../race/session-configuration.js';
import { sessionPlayerColor } from '../race/course-session.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { createMenuScreen, type MenuDefinition, type MenuItem } from './menu.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import { MODE_NAMES, MUSIC_OFF, latestTrack, offeredTracks, recordedColor, type RunRequest } from './run-request.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { Screen } from './screen-host.js';
import { createVehicleScreen } from './vehicle-screen.js';
import { showSettings } from './settings-screens.js';
import { createSeriesScreen, SERIES_SLIDE_STEPS } from './series-screen.js';
import { createTitleScreen, type TitleBackground, type TitleState } from './title-screen.js';
import type { TilePicture } from '../image/tile-picture.js';
import { createPictureMenuScreen, type PictureMenuLine } from './picture-menu-screen.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import { SIM_DT } from '../race/fixed-step.js';

type Mode = RunRequest['mode'];
type Step = 'SERIES' | 'CLASS' | 'COURSE' | 'VEHICLE' | 'OPTIONS' | 'MUSIC';

/** The selection screens after SELECT MODE, by mode; SELECT MUSIC is last, and its confirm requests the run. */
const FLOW: Readonly<Record<Mode, readonly Step[]>> = Object.freeze({
  ARCADE: ['SERIES', 'CLASS', 'VEHICLE', 'MUSIC'],
  FREE_PLAY: ['COURSE', 'VEHICLE', 'OPTIONS', 'MUSIC'],
  TIME_ATTACK: ['SERIES', 'CLASS', 'VEHICLE', 'MUSIC'],
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
  /** The game-wide driving definition; SELECT VEHICLE's curves end at its fuel-cut entry. */
  readonly driving: CompiledDrivingDefinition;
  readonly freePlay: FreePlayRules;
  /** The delivered tracks in selection order. */
  readonly music: MusicCatalog;
  readonly player: PlayerRecord;
  /** `dev=1`: DEV series and courses in no series are offered. */
  readonly dev: boolean;
  /** The title logo, which TITLE shows. */
  readonly logo: TilePicture;
}

/** Where the selection draws and what its screens lead to. */
export interface SelectionDevices {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  present(): void;
  show(screen: Screen): void;
  /** CONFIRM on PRESS START: the user gesture that enables sound and fullscreen where the browser allows them. */
  activate(): void;
  /** What TITLE stands over: the attract demo. */
  readonly titleBackground: TitleBackground;
  /** Request the selected run; `back` returns to the last selection screen. */
  run(request: RunRequest, back: () => void): void;
  /** Set a volume in percent. */
  setVolume(name: VolumeName, percent: number): void;
  /** Play `track` from its start as an audition; the returned function stops it. */
  audition(track: MusicTrack): () => void;
  /**
   * The music the screen plays: a series' title track, which keeps playing while it stays the same, or none; another
   * track crossfades with it over `crossfadeSeconds` when given.
   */
  titleMusic(track: MusicTrack | null, crossfadeSeconds?: number): void;
}

/**
 * The selection flow from TITLE to a run request. TITLE leads to SELECT MODE, and each mode's screens follow the flow
 * table; SELECT CLASS appears only for a series with several classes. ARCADE and TIME ATTACK run a class of a series;
 * FREE PLAY runs a course. BACK returns to the previous screen. A mode, series or course that offers nothing to select
 * is DARK.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, driving, player, dev, freePlay, music } = catalog;
  // FREE PLAY's POOL and TRAFFIC choices, in their rules' order; TRAFFIC starts with OFF.
  const pools = freePlay.rivalPools.map((pool) => pool.id);
  const trafficLevels = [NO_TRAFFIC, ...freePlay.traffic.map((level) => level.id)];
  const series = catalog.series.series.filter((s) => (dev || !s.dev) && s.classes.length > 0);
  const inSeries = new Set(catalog.series.series.flatMap((s) => s.classes.map((c) => c.course)));
  // FREE PLAY's courses grouped by series, each course once: under the first offered series running it,
  // in its classes' order. Courses in no series follow last, only with DEV.
  const listed = new Set<string>();
  const groups = [
    ...series.map((s) => ({
      title: s.title,
      ids: s.classes.map((c) => c.course).filter((id) => !listed.has(id) && listed.add(id)),
    })),
    ...(dev ? [{ title: '', ids: courses.filter((c) => !inSeries.has(c.id)).map((c) => c.id) }] : []),
  ].filter((group) => group.ids.length > 0);
  const offered = (mode: Mode) => (mode === 'FREE_PLAY' ? groups.length > 0 : series.length > 0);
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
    // The SELECT MUSIC choice; null is MUSIC OFF.
    track: string | null = null,
    lapCount = latestCount('laps', 1, Infinity) ?? 1,
    rivalCount = latestCount('rivals', 0, SESSION_RULE_LIMITS.rivals) ?? 0,
    rivalPool = pools.find((pool) => pool === latest('pool')) ?? pools[0]!,
    traffic = trafficLevels.find((level) => level === latest('traffic')) ?? NO_TRAFFIC;
  // The most rivals a course's grid holds within the Session rules: the RIVALS range, which a course change keeps to.
  const maxRivals = (id: string) => Math.min(SESSION_RULE_LIMITS.rivals, gridRivalCapacity(courseOf(id).gridSlots));
  // The tracks the run offers besides MUSIC OFF: SELECT MUSIC is shown only when there are two or more choices.
  const tracks = () => offeredTracks(mode === 'FREE_PLAY' ? null : seriesChoice, music);
  const needed = (at: Step) =>
    at === 'CLASS' ? seriesChoice!.classes.length > 1 : at === 'MUSIC' ? tracks().length > 0 : true;
  // Whether the current screen is the last one shown, whose CONFIRM starts the run.
  const last = () => FLOW[mode].slice(step + 1).every((at) => !needed(at));
  const menu = (definition: MenuDefinition, initial = 0) =>
    devices.show(createMenuScreen(devices.frame, devices.text, devices.present, definition, initial));
  const back = () => {
    do step--;
    while (step >= 0 && !needed(FLOW[mode][step]!));
    if (step < 0) title();
    else showStep();
  };
  const forward = () => {
    do step++;
    while (step < FLOW[mode].length && !needed(FLOW[mode][step]!));
    if (step < FLOW[mode].length) showStep();
    else devices.run(request(), back);
  };
  const request = (): RunRequest => {
    // Without SELECT MUSIC the run takes its only choice, MUSIC OFF.
    const choice = { vehicleId: vehicleId!, color, track: needed('MUSIC') ? track : null };
    if (mode !== 'FREE_PLAY')
      return Object.freeze({ ...choice, mode, seriesId: seriesChoice!.id, classId: classChoice!.id });
    return Object.freeze({ ...choice, mode, courseId: courseId!, lapCount, rivalCount, rivalPool, traffic });
  };
  // SELECT CLASS's lines: the course, laps and field; the vehicle, or how many vehicles. A class's record is shown only
  // inside the class.
  const classLines = (c: SeriesClass): readonly PictureMenuLine[] => {
    const listed = c.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!);
    const form = (bikes: boolean) => (bikes ? 'BIKES' : 'CARS');
    const fieldBikes = c.entries.every(
      (e) => vehicles.find((v) => v.compiledVehicle.id === e.vehicle)!.listing.form === 'bike',
    );
    const vehicle =
      listed.length === 1
        ? `${listed[0]!.listing.metadata.manufacturer} ${listed[0]!.listing.metadata.model}`.toUpperCase()
        : `${listed.length} ${form(listed.every((v) => v.listing.form === 'bike'))}`;
    return [
      {
        row: 25,
        text: `${courseOf(c.course).name}  ${c.laps} LAPS  ${c.entries.length} ${form(fieldBikes)}`,
        palette: TEXT_PALETTES.WHITE,
      },
      { row: 26, text: vehicle, palette: TEXT_PALETTES.WHITE },
    ];
  };
  // A number item LEFT/RIGHT changes within [min, max].
  const number = (label: string, value: () => number, set: (n: number) => void, min: number, max: number) => ({
    label,
    value: String(value()),
    adjust: (by: -1 | 1) => set(Math.min(max, Math.max(min, value() + by))),
  });
  // OPTIONS leads on to SELECT MUSIC.
  const next = (): MenuItem => ({ label: 'NEXT', entry: last(), confirm: forward });

  // TITLE's PRESS START is confirmed once for the page; afterwards TITLE shows the mode line.
  const titleState: TitleState = { pressed: false };
  // TITLE's mode line: the modes, then SETTINGS. A mode that offers nothing is DARK.
  const settings = () =>
    showSettings(
      player,
      {
        menu,
        setVolume: devices.setVolume,
        // The latest track, else the first: MUSIC OFF has nothing to set the volume by.
        audition: () => devices.audition(music.find((t) => t.id === latestTrack(player, music)) ?? music[0]!),
      },
      title,
    );
  const titleItems: readonly MenuItem[] = [
    ...MODES.map((m): MenuItem => ({
      label: m.label,
      disabled: !offered(m.mode),
      confirm: () => {
        if (m.mode !== mode) [seriesChoice, classChoice, courseId, vehicleId] = [null, null, null, null];
        mode = m.mode;
        remember('mode', mode);
        forward();
      },
    })),
    { label: 'SETTINGS', confirm: settings },
  ];

  function title() {
    step = -1;
    devices.titleMusic(null);
    devices.show(
      createTitleScreen(
        devices.frame,
        devices.text,
        devices.present,
        catalog.logo,
        devices.titleBackground,
        titleState,
        titleItems,
        Math.max(
          0,
          MODES.findIndex((m) => m.mode === mode),
        ),
        // CONFIRM on PRESS START is the user gesture that enables sound and fullscreen.
        { press: () => devices.activate() },
      ),
    );
  }
  function showStep() {
    // A series' title track plays on its screens; FREE PLAY's screens are silent.
    devices.titleMusic(mode !== 'FREE_PLAY' && seriesChoice ? seriesChoice.music.title : null);
    switch (FLOW[mode][step]!) {
      case 'SERIES': {
        // The shown series plays its title track from its start; a slide crossfades to the next one's.
        const current = Math.max(
          0,
          series.findIndex((s) => s.id === (seriesChoice?.id ?? latest('series'))),
        );
        devices.titleMusic(series[current]!.music.title);
        return devices.show(
          createSeriesScreen(devices.frame, devices.text, devices.present, series, current, {
            offers: (s) => s.classes.length > 0,
            slide: (s) => devices.titleMusic(s.music.title, SERIES_SLIDE_STEPS * SIM_DT),
            confirm: (s) => {
              // A series with one class needs no SELECT CLASS.
              if (s !== seriesChoice) [classChoice, vehicleId] = [s.classes.length === 1 ? s.classes[0]! : null, null];
              seriesChoice = s;
              remember('series', s.id);
              forward();
            },
            back,
          }),
        );
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
        const classes = seriesChoice!.classes;
        return devices.show(
          createPictureMenuScreen(
            devices.frame,
            devices.text,
            devices.present,
            { title: 'SELECT CLASS', items: () => items, back },
            {
              picture: seriesChoice!.image,
              band: [22, 29],
              choiceRow: 23,
              lines: (index) => classLines(classes[index]!),
            },
            Math.max(0, current),
          ),
        );
      }
      case 'COURSE': {
        // Each course carries its group's series title under it.
        const rows = groups.flatMap((group) =>
          group.ids.map((id) => ({ id, label: courseOf(id).name, note: group.title })),
        );
        const items = rows.map(({ id, label, note }): MenuItem => ({
          label,
          note,
          confirm: () => {
            courseId = id;
            lapCount = Math.min(lapCount, courseOf(id).maxLaps);
            rivalCount = Math.min(rivalCount, maxRivals(id));
            remember('course', id);
            forward();
          },
        }));
        const current = rows.findIndex((row) => row.id === (courseId ?? latest('course')));
        return menu({ title: 'SELECT COURSE', items: () => items, back }, Math.max(0, current));
      }
      case 'VEHICLE': {
        const candidates =
          mode !== 'FREE_PLAY'
            ? classChoice!.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!)
            : vehicles;
        return devices.show(
          createVehicleScreen(
            devices.frame,
            devices.text,
            devices.present,
            candidates,
            driving.compiledDriving.powertrain.fuelCutEnterRedlineRatio,
            {
              vehicleId: vehicleId ?? latest('vehicle') ?? null,
              fixedColors: mode !== 'FREE_PLAY' && classChoice!.fixedColors,
              // The color the Session gives the player: with fixed colors its class entry's.
              colorOf: (v) =>
                sessionPlayerColor(mode === 'FREE_PLAY' ? null : classChoice, v, recordedColor(player, v)),
              entry: last(),
              // In a series the page stands over the series image at quarter brightness.
              background: mode === 'FREE_PLAY' ? null : seriesChoice!.image,
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
          next(),
        ];
        return menu({ title: 'OPTIONS', layout: 'list', items, back });
      }
      case 'MUSIC': {
        // The offered tracks, then MUSIC OFF; choosing changes only the name. CONFIRM starts the run with it.
        const choices = [...tracks().map((t) => ({ id: t.id, label: t.title })), { id: null, label: 'MUSIC OFF' }];
        const items = choices.map((c): MenuItem => ({
          label: c.label,
          entry: true,
          confirm: () => {
            track = c.id;
            remember('music', c.id ?? MUSIC_OFF);
            forward();
          },
        }));
        const chosen = track ?? latestTrack(player, tracks());
        const current = choices.findIndex((c) => c.id === chosen);
        return devices.show(
          createPictureMenuScreen(
            devices.frame,
            devices.text,
            devices.present,
            { title: 'SELECT MUSIC', items: () => items, back },
            {
              picture: mode === 'FREE_PLAY' ? null : seriesChoice!.image,
              band: [22, 29],
              choiceRow: 24,
              lines: (index) => [
                { row: 26, text: `TRACK ${index + 1} / ${choices.length}`, palette: TEXT_PALETTES.WHITE },
              ],
            },
            Math.max(0, current),
          ),
        );
      }
    }
  }
  // A run's request becomes the current selection.
  const adopt = (run: RunRequest) => {
    mode = run.mode;
    [vehicleId, color, track] = [run.vehicleId, run.color, run.track];
    if (run.mode !== 'FREE_PLAY') {
      classChoice = catalog.series.seriesClass(run.seriesId, run.classId);
      [seriesChoice, courseId] = [classChoice?.series ?? null, null];
    } else
      [seriesChoice, classChoice, courseId, lapCount, rivalCount, rivalPool, traffic] = [
        null,
        null,
        run.courseId,
        run.lapCount,
        run.rivalCount,
        run.rivalPool,
        run.traffic,
      ];
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
