import type { CourseIndex } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import { RUN_RULE_LIMITS } from '../course/run-rules.js';
import { formPool } from '../race/free-play-field.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { gridRivalCapacity } from '../race/run-configuration.js';
import { runPlayerColor } from '../race/run-setup.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { createMenuScreen, type MenuDefinition, type MenuItem } from './menu.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import {
  isFreePlay,
  MUSIC_OFF,
  latestTrack,
  offeredTracks,
  recordedColor,
  SESSION_NAMES,
  type RunRequest,
  type SessionName,
} from './run-request.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { Screen } from './screen-host.js';
import { createVehicleScreen } from './vehicle-screen.js';
import { exhaustPixelsPerMeter as exhaustScale } from './vehicle-page.js';
import { showSettings } from './settings-screens.js';
import { createSeriesScreen, SERIES_SLIDE_STEPS } from './series-screen.js';
import { createTitleScreen, type TitleBackground, type TitleState } from './title-screen.js';
import type { TilePicture } from '../image/tile-picture.js';
import { createPictureMenuScreen, type PictureMenuLine } from './picture-menu-screen.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { shownRecord } from './run-records.js';
import { formatMilliseconds, NO_TIME } from './race-time.js';

/** Where TITLE's line leads: the series, or FREE PLAY, the assembly bench. */
type Place = 'SERIES' | 'FREE_PLAY';
type Step = 'SERIES' | 'CLASS' | 'SESSION' | 'COURSE' | 'VEHICLE' | 'OPTIONS' | 'MUSIC';

/** The selection screens after TITLE, by place; SELECT MUSIC is last, and its confirm requests the run. */
const FLOW: Readonly<Record<Place, readonly Step[]>> = Object.freeze({
  SERIES: ['SERIES', 'CLASS', 'SESSION', 'VEHICLE', 'MUSIC'],
  FREE_PLAY: ['COURSE', 'VEHICLE', 'OPTIONS', 'MUSIC'],
});
const PLACES: readonly { readonly place: Place; readonly label: string }[] = Object.freeze([
  { place: 'SERIES', label: 'SERIES' },
  { place: 'FREE_PLAY', label: 'FREE PLAY' },
]);
const SESSIONS = Object.keys(SESSION_NAMES) as SessionName[];

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
  /** Each catalog vehicle's identity (`runVehicleSha256`), which records are kept against. */
  readonly vehicleSha256: ReadonlyMap<string, string>;
}

/** Where the selection draws and what its screens lead to. */
export interface SelectionDevices {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  present(): void;
  /** The sound of the engine SELECT VEHICLE revs, as the player's, each frame it revs. */
  vehicleSound(engine: CompetitorObservation): void;
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
 * The selection flow from TITLE to a run request. TITLE's line leads to the series or to FREE PLAY, whose screens
 * follow the flow table; SELECT CLASS appears only for a series with several classes, and SELECT SESSION chooses how the
 * class is driven, RACE or TIME ATTACK. FREE PLAY runs a course. BACK returns to the previous screen. A line item,
 * series or course that offers nothing to select is DARK.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, driving, player, dev, freePlay, music } = catalog;
  // Every vehicle's exhaust is drawn at the whole catalog's one scale.
  const exhaustPixelsPerMeter = exhaustScale(vehicles);
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
  const offered = (at: Place) => (at === 'FREE_PLAY' ? groups.length > 0 : series.length > 0);
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
  let place: Place = PLACES.find((p) => p.place === latest('title'))?.place ?? 'SERIES',
    step = -1,
    seriesChoice: CompiledSeries | null = null,
    classChoice: SeriesClass | null = null,
    session: SessionName = SESSIONS.find((s) => s === latest('session')) ?? 'RACE',
    courseId: string | null = null,
    vehicleId: string | null = null,
    color: string | null = null,
    // The SELECT MUSIC choice; null is MUSIC OFF.
    track: string | null = null,
    lapCount = latestCount('laps', 1, Infinity) ?? 1,
    rivalCount = latestCount('rivals', 0, RUN_RULE_LIMITS.rivals) ?? 0,
    rivalPool = pools.find((pool) => pool === latest('pool')) ?? pools[0]!,
    traffic = trafficLevels.find((level) => level === latest('traffic')) ?? NO_TRAFFIC;
  // The most rivals a course's grid holds within the run rules: the RIVALS range, which a course change keeps to.
  const maxRivals = (id: string) => Math.min(RUN_RULE_LIMITS.rivals, gridRivalCapacity(courseOf(id).gridSlots));
  // The tracks the run offers besides MUSIC OFF: SELECT MUSIC is shown only when there are two or more choices.
  const tracks = () => offeredTracks(place === 'FREE_PLAY' ? null : seriesChoice, music);
  const needed = (at: Step) =>
    at === 'CLASS' ? seriesChoice!.classes.length > 1 : at === 'MUSIC' ? tracks().length > 0 : true;
  // Whether the current screen is the last one shown, whose CONFIRM starts the run.
  const last = () => FLOW[place].slice(step + 1).every((at) => !needed(at));
  const menu = (definition: MenuDefinition, initial = 0) =>
    devices.show(createMenuScreen(devices.frame, devices.text, devices.present, definition, initial));
  const back = () => {
    do step--;
    while (step >= 0 && !needed(FLOW[place][step]!));
    if (step < 0) title();
    else showStep();
  };
  const forward = () => {
    do step++;
    while (step < FLOW[place].length && !needed(FLOW[place][step]!));
    if (step < FLOW[place].length) showStep();
    else devices.run(request(), back);
  };
  const request = (): RunRequest => {
    // Without SELECT MUSIC the run takes its only choice, MUSIC OFF.
    const choice = { vehicleId: vehicleId!, color, track: needed('MUSIC') ? track : null };
    if (place === 'SERIES')
      return Object.freeze({ ...choice, seriesId: seriesChoice!.id, classId: classChoice!.id, session });
    return Object.freeze({ ...choice, courseId: courseId!, lapCount, rivalCount, rivalPool, traffic });
  };
  // SELECT SESSION's lines: RACE's laps and field; TIME ATTACK's record, its time (a lap on a circuit) and the vehicle
  // it was set with.
  const sessionLines = (c: SeriesClass, at: SessionName): readonly PictureMenuLine[] => {
    const course = courseOf(c.course);
    if (at === 'RACE') return [{ row: 25, text: raceText(c), palette: TEXT_PALETTES.WHITE }];
    const record = shownRecord(player.records, {
      seriesId: c.series.id,
      classId: c.id,
      courseSha256: course.buildSha256,
      vehicleSha256: catalog.vehicleSha256,
    });
    const listing = record && vehicles.find((v) => v.compiledVehicle.id === record.vehicleId)?.listing;
    return [
      {
        row: 25,
        text: `${course.type === 'CIRCUIT' ? 'BEST LAP' : 'RECORD'} ${record ? formatMilliseconds(record.timeMs) : NO_TIME}`,
        palette: TEXT_PALETTES.GREEN,
      },
      ...(record
        ? [
            {
              row: 26,
              text: listing
                ? `${listing.metadata.manufacturer} ${listing.metadata.model}`.toUpperCase()
                : record.vehicleId,
              palette: TEXT_PALETTES.WHITE,
            },
          ]
        : []),
    ];
  };
  // SELECT CLASS's lines: the course, laps and field; the vehicle, or how many vehicles. A class's record is shown only
  // inside the class.
  const form = (bikes: boolean) => (bikes ? 'BIKES' : 'CARS');
  // A class's race: its laps and its field, BIKES when the whole field is bikes.
  const raceText = (c: SeriesClass) => {
    const bikes = c.entries.every(
      (e) => vehicles.find((v) => v.compiledVehicle.id === e.vehicle)!.listing.form === 'bike',
    );
    return `${c.laps} LAPS  ${c.entries.length} ${form(bikes)}`;
  };
  const classLines = (c: SeriesClass): readonly PictureMenuLine[] => {
    const listed = c.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!);
    const vehicle =
      listed.length === 1
        ? `${listed[0]!.listing.metadata.manufacturer} ${listed[0]!.listing.metadata.model}`.toUpperCase()
        : `${listed.length} ${form(listed.every((v) => v.listing.form === 'bike'))}`;
    return [
      {
        row: 25,
        text: `${courseOf(c.course).name}  ${raceText(c)}`,
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

  // TITLE's PRESS START is confirmed once for the page; afterwards TITLE shows its line.
  const titleState: TitleState = { pressed: false };
  // TITLE's line: SERIES, FREE PLAY, then SETTINGS. One that offers nothing is DARK.
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
    ...PLACES.map((p): MenuItem => ({
      label: p.label,
      disabled: !offered(p.place),
      confirm: () => {
        if (p.place !== place) [seriesChoice, classChoice, courseId, vehicleId] = [null, null, null, null];
        place = p.place;
        remember('title', place);
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
          PLACES.findIndex((p) => p.place === place),
        ),
        // CONFIRM on PRESS START is the user gesture that enables sound and fullscreen.
        { press: () => devices.activate() },
      ),
    );
  }
  function showStep() {
    // A series' title track plays on its screens; FREE PLAY's screens are silent.
    devices.titleMusic(place === 'SERIES' && seriesChoice ? seriesChoice.music.title : null);
    switch (FLOW[place][step]!) {
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
      case 'SESSION': {
        // RACE and TIME ATTACK, over the series image like SELECT CLASS.
        const chosen = classChoice!;
        const items = SESSIONS.map((s): MenuItem => ({
          label: SESSION_NAMES[s],
          confirm: () => {
            session = s;
            remember('session', s);
            forward();
          },
        }));
        return devices.show(
          createPictureMenuScreen(
            devices.frame,
            devices.text,
            devices.present,
            { title: 'SELECT SESSION', items: () => items, back },
            {
              picture: seriesChoice!.image,
              band: [22, 29],
              choiceRow: 23,
              lines: (index) => sessionLines(chosen, SESSIONS[index]!),
            },
            SESSIONS.indexOf(session),
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
          place === 'SERIES'
            ? classChoice!.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!)
            : vehicles;
        return devices.show(
          createVehicleScreen(
            devices.frame,
            devices.text,
            devices.present,
            devices.vehicleSound,
            candidates,
            driving,
            {
              vehicleId: vehicleId ?? latest('vehicle') ?? null,
              fixedColors: place === 'SERIES' && classChoice!.fixedColors,
              // The color the run gives the player: with fixed colors its class entry's.
              colorOf: (v) => runPlayerColor(place === 'SERIES' ? classChoice : null, v, recordedColor(player, v)),
              entry: last(),
              // In a series the page stands over the series image at quarter brightness.
              background: place === 'SERIES' ? seriesChoice!.image : null,
              exhaustPixelsPerMeter,
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
              picture: place === 'SERIES' ? seriesChoice!.image : null,
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
    [vehicleId, color, track] = [run.vehicleId, run.color, run.track];
    if (!isFreePlay(run)) {
      place = 'SERIES';
      classChoice = catalog.series.seriesClass(run.seriesId, run.classId);
      [seriesChoice, courseId, session] = [classChoice?.series ?? null, null, run.session];
    } else {
      place = 'FREE_PLAY';
      [seriesChoice, classChoice, courseId, lapCount, rivalCount, rivalPool, traffic] = [
        null,
        null,
        run.courseId,
        run.lapCount,
        run.rivalCount,
        run.rivalPool,
        run.traffic,
      ];
    }
  };
  return Object.freeze({
    title,
    /** SELECT VEHICLE with `run`'s selection. */
    vehicle(run: RunRequest) {
      adopt(run);
      step = FLOW[place].indexOf('VEHICLE');
      showStep();
    },
    /** The first selection screen of `run`'s place, with its selection. */
    select(run: RunRequest) {
      adopt(run);
      step = -1;
      forward();
    },
  });
}
