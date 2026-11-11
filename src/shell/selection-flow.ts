import type { CourseIndex, CourseIndexEntry } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import type { CourseGroup, FrontEndSelection, SelectableSeries } from '../content/front-end-selection.js';
import { RUN_RULE_LIMITS } from '../course/run-rules.js';
import { NO_TRAFFIC, type FreePlayRules } from '../content/free-play-rules.js';
import { gridRivalCapacity } from '../race/run-configuration.js';
import { runPlayerColor } from '../race/run-setup.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import { isFreePlay, latestTrack, recordedColor, type RunRequest } from './run-request.js';
import type { Screen } from './screen-host.js';
import { clearRecordCards, settingCards } from './settings-screens.js';
import type { CardFaces } from './card-face.js';
import { createCardRows, type Card, type CardRow, type MainWorld, type RowChange } from './card-rows.js';

/** MAIN MENU's cards, in order, by the player record's key for them. */
const MENU = Object.freeze(['SERIES', 'FREE PLAY', 'SETTINGS'] as const);
type MenuChoice = (typeof MENU)[number];
/** A move on SELECT SERIES, and leaving it for MAIN MENU, fade the title track out over this time. */
export const SERIES_FADE_SECONDS = 0.25;

/** What the selection offers: delivered courses, series and vehicles, FREE PLAY's rules and the front end's lists. */
export interface SelectionCatalog {
  readonly courses: CourseIndex;
  readonly series: SeriesCatalog;
  readonly frontEnd: FrontEndSelection;
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly freePlay: FreePlayRules;
  /** The delivered tracks; the SETTINGS audition plays the latest, else the first. */
  readonly music: MusicCatalog;
  readonly player: PlayerRecord;
  /** `dev=1`: DEV series, and the courses in no series, are offered. */
  readonly dev: boolean;
  /** The title logo, which stands for the main picture until it is made. */
  readonly logo: TilePicture;
}

/** Where the selection draws and what its rows lead to. */
export interface SelectionDevices {
  readonly frame: SoftwareSurface;
  readonly text: TextLayer;
  readonly faces: CardFaces;
  present(): void;
  show(screen: Screen): void;
  /** CONFIRM on PRESS START: the user gesture that enables sound and fullscreen where the browser allows them. */
  activate(): void;
  /** The attract demo behind the main picture. */
  readonly demo: Omit<MainWorld, 'logo'>;
  /** Request the selected run; `back` returns to the row that requested it. */
  run(request: RunRequest, back: () => void): void;
  setVolume(name: VolumeName, percent: number): void;
  /** Play `track` from its start as an audition; the returned function stops it. */
  audition(track: MusicTrack): () => void;
  /** The rows' music: a title track from its start unless it already plays, or none; or a fade out over a time. */
  readonly music: { play(track: MusicTrack | null): void; fadeOut(seconds: number): void };
}

/**
 * The selection from TITLE to a run request ([product](../../docs/product.md#6-flow-and-screens)), its rows of cards on
 * one screen: TITLE, then MAIN MENU's SERIES, FREE PLAY and SETTINGS. SERIES leads through SELECT SERIES into the
 * series' world, SELECT CLASS and SELECT VEHICLE; FREE PLAY through RULES, SELECT ORIGINAL, SELECT COURSE and SELECT
 * VEHICLE, in the main world; SETTINGS to its cards. Every row is shown, even with one card, and BACK returns to the
 * row before. SELECT VEHICLE's CONFIRM requests the run: a class's RACE, or FREE PLAY with its RULES cut to the course.
 * A run plays its course's first race track, if it has one (K, 2026-11-11). Each row starts from the current choice, else the player record's latest, else its first.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, player, dev, freePlay, frontEnd } = catalog;
  const pools = freePlay.rivalPools.map((pool) => pool.id);
  const trafficLevels = [NO_TRAFFIC, ...freePlay.traffic.map((level) => level.id)];
  const selectable = frontEnd.seriesRow(dev);
  const offers = (s: SelectableSeries) => s.series !== null && s.series.classes.length > 0;
  // FREE PLAY's courses: those the offered series run, and with DEV every course, grouped by original.
  const offered = new Set(
    dev
      ? courses.map((c) => c.id)
      : catalog.series.series.filter((s) => !s.dev).flatMap((s) => s.classes.map((c) => c.course)),
  );
  const groups = frontEnd.groups(offered);
  const courseOf = (id: string): CourseIndexEntry => courses.find((c) => c.id === id)!;
  const maxLaps = Math.max(1, ...[...offered].map((id) => courseOf(id).maxLaps));

  const latest = (key: string): string | undefined => player.settings.latestSelections[key];
  const remember = (key: string, value: string) =>
    player.updateSettings({ latestSelections: { ...player.settings.latestSelections, [key]: value } });
  const latestCount = (key: string, min: number, max: number) => {
    const value = Number(latest(key));
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  };
  // The current selection; FREE PLAY's RULES are kept as chosen, whatever course or vehicle follows (K, 2026-11-09).
  let pressed = false,
    menu: MenuChoice = MENU.find((m) => m === latest('menu')) ?? 'SERIES',
    seriesChoice: CompiledSeries | null = null,
    classChoice: SeriesClass | null = null,
    group: CourseGroup | null = null,
    courseId: string | null = null,
    vehicleId: string | null = null,
    rivals = latestCount('rivals', 0, RUN_RULE_LIMITS.rivals) ?? 0,
    pool = pools.find((p) => p === latest('pool')) ?? pools[0]!,
    traffic = trafficLevels.find((t) => t === latest('traffic')) ?? NO_TRAFFIC,
    laps = latestCount('laps', 1, maxLaps) ?? 1;
  // The chosen colors of the vehicles shown, by vehicle, until the run is requested.
  const colors = new Map<string, string>();

  const at = <T>(items: readonly T[], found: (item: T) => boolean) => Math.max(0, items.findIndex(found));
  const row = (fields: Omit<CardRow, 'initial'> & { readonly initial?: number }): CardRow =>
    Object.freeze({ initial: 0, ...fields });
  // The title track of the series picture `picture` shows.
  const trackOf = (s: CompiledSeries) => selectable.find((entry) => entry.series === s)?.titleTrack ?? s.music.title;
  const worldOf = (s: CompiledSeries) => selectable.find((entry) => entry.series === s)?.picture ?? s.image;

  const titleRow = (): CardRow =>
    row({
      kind: 'title',
      world: null,
      cards: [
        {
          name: '',
          confirm: () => {
            go(menuRow(), 'thin');
            if (pressed) return 'confirm';
            // The first CONFIRM is the user gesture that starts the sound and fullscreen.
            pressed = true;
            devices.activate();
            return 'start';
          },
        },
      ],
    });
  const menuRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      initial: MENU.indexOf(menu),
      cards: MENU.map((choice): Card => ({
        name: choice,
        dim: choice === 'SERIES' ? !selectable.length : choice === 'FREE PLAY' ? !groups.length : false,
        confirm: () => {
          if (choice !== menu) [seriesChoice, classChoice, group, courseId, vehicleId] = [null, null, null, null, null];
          menu = choice;
          remember('menu', choice);
          go(choice === 'SERIES' ? seriesRow() : choice === 'FREE PLAY' ? rulesRow() : settingsRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(titleRow(), 'thin'), 'back'),
    });

  // SERIES: the series pictures, then the series' world.
  const seriesRow = (): CardRow =>
    row({
      kind: 'series',
      world: null,
      initial: at(selectable, (s) => s.id === (seriesChoice?.id ?? latest('series'))),
      cards: selectable.map((entry): Card => ({
        name: entry.name,
        picture: entry.picture,
        dim: entry.series !== null && !offers(entry),
        deny: entry.series === null,
        confirm: () => {
          const chosen = entry.series!;
          if (chosen !== seriesChoice) [classChoice, vehicleId] = [null, null];
          seriesChoice = chosen;
          remember('series', chosen.id);
          devices.music.play(entry.titleTrack);
          go(classRow(), 'zoom-in');
          return 'confirm';
        },
      })),
      // The series in focus plays its title track once the row rests; a move fades it out.
      rested: (index) => devices.music.play(selectable[index]!.titleTrack),
      moved: () => devices.music.fadeOut(SERIES_FADE_SECONDS),
      back: () => {
        devices.music.fadeOut(SERIES_FADE_SECONDS);
        go(menuRow(), 'thin');
        return 'back';
      },
    });
  const form = (bikes: boolean) => (bikes ? 'BIKES' : 'CARS');
  const vehicleOf = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)!;
  const classRow = (): CardRow => {
    const chosen = seriesChoice!;
    return row({
      kind: 'cards',
      world: worldOf(chosen),
      initial: at(chosen.classes, (c) => c.id === (classChoice?.id ?? latest('class'))),
      cards: chosen.classes.map((c): Card => ({
        name: c.title,
        line: () =>
          `${c.laps} LAPS  ${c.entries.length} ${form(c.entries.every((e) => vehicleOf(e.vehicle).listing.form === 'bike'))}`,
        confirm: () => {
          // Another class offers its own vehicles.
          if (c !== classChoice) vehicleId = null;
          classChoice = c;
          remember('class', c.id);
          go(vehicleRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(seriesRow(), 'zoom-out'), 'back'),
    });
  };

  // FREE PLAY: RULES, the originals' groups and their courses, in the main world.
  const rule = (name: string, shown: () => string, set: (by: -1 | 1) => void): Card => ({
    name,
    line: shown,
    change: (by) => {
      const before = shown();
      set(by);
      return shown() !== before;
    },
    confirm: () => (go(originalRow(), 'thin'), 'confirm'),
  });
  const wrap = <T>(choices: readonly T[], value: T, by: -1 | 1) =>
    choices[(choices.indexOf(value) + by + choices.length) % choices.length]!;
  const rulesRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      cards: [
        rule(
          'RIVALS',
          () => String(rivals),
          (by) => remember('rivals', String((rivals = Math.min(RUN_RULE_LIMITS.rivals, Math.max(0, rivals + by))))),
        ),
        rule(
          'POOL',
          () => pool,
          (by) => remember('pool', (pool = wrap(pools, pool, by))),
        ),
        rule(
          'TRAFFIC',
          () => traffic,
          (by) => remember('traffic', (traffic = wrap(trafficLevels, traffic, by))),
        ),
        rule(
          'LAPS',
          () => String(laps),
          (by) => remember('laps', String((laps = Math.min(maxLaps, Math.max(1, laps + by))))),
        ),
      ],
      back: () => (go(menuRow(), 'thin'), 'back'),
    });
  const originalRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      initial: at(groups, (g) => g.title === (group ?? frontEnd.groupOf(courseId ?? latest('course') ?? ''))?.title),
      cards: groups.map((g): Card => ({
        name: g.title,
        line: () => (g.courses.length === 1 ? '1 COURSE' : `${g.courses.length} COURSES`),
        confirm: () => {
          group = g;
          go(courseRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(rulesRow(), 'thin'), 'back'),
    });
  const courseRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      initial: at(group!.courses, (id) => id === (courseId ?? latest('course'))),
      cards: group!.courses.map((id): Card => ({
        name: courseOf(id).name,
        line: () => courseOf(id).type,
        confirm: () => {
          courseId = id;
          remember('course', id);
          go(vehicleRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(originalRow(), 'thin'), 'back'),
    });

  // SELECT VEHICLE: a class's vehicles in its series' world, or every vehicle in FREE PLAY; UP and DOWN choose the
  // color, except where the class fixes it.
  const vehicleRow = (): CardRow => {
    const runClass = menu === 'SERIES' ? classChoice : null;
    const candidates = runClass ? runClass.vehicles.map(vehicleOf) : vehicles;
    const colorOf = (v: CompiledVehicleDefinition) =>
      runPlayerColor(runClass, v, colors.get(v.compiledVehicle.id) ?? recordedColor(player, v));
    return row({
      kind: 'cards',
      world: runClass ? worldOf(runClass.series) : null,
      initial: at(candidates, (v) => v.compiledVehicle.id === (vehicleId ?? latest('vehicle'))),
      cards: candidates.map((v): Card => {
        const { manufacturer, model } = v.listing.metadata;
        return {
          name: `${manufacturer} ${model}`.toUpperCase(),
          line: () => v.listing.visuals.colorNames[colorOf(v)] ?? colorOf(v),
          change: (by) => {
            if (runClass?.fixedColors) return false;
            colors.set(v.compiledVehicle.id, wrap(spriteSetColors(v.spriteSet), colorOf(v), by));
            return true;
          },
          confirm: () => {
            const id = v.compiledVehicle.id;
            const color = runClass?.fixedColors ? null : colorOf(v);
            if (color !== null)
              player.updateSettings({ vehicleColors: { ...player.settings.vehicleColors, [id]: color } });
            vehicleId = id;
            remember('vehicle', id);
            devices.run(request(id, color), () => enter(vehicleRow()));
            return 'entry';
          },
        };
      }),
      back: () => (go(runClass ? classRow() : courseRow(), 'thin'), 'back'),
    });
  };
  // The run SELECT VEHICLE requests: a class's RACE, or FREE PLAY with its RULES cut to the course (K, 2026-11-09).
  const request = (id: string, color: string | null): RunRequest => {
    if (menu === 'SERIES')
      return Object.freeze({
        seriesId: seriesChoice!.id,
        classId: classChoice!.id,
        session: 'RACE',
        vehicleId: id,
        color,
        track: raceTrack(classChoice!.course),
      });
    const course = courseOf(courseId!);
    return Object.freeze({
      courseId: course.id,
      lapCount: course.type === 'CIRCUIT' ? Math.min(laps, course.maxLaps) : 1,
      rivalCount: Math.min(rivals, gridRivalCapacity(course.gridSlots)),
      rivalPool: pool,
      traffic,
      vehicleId: id,
      color,
      track: raceTrack(course.id),
    });
  };
  // A run plays its course's first race track, or none.
  const raceTrack = (id: string) => courseOf(id).raceTracks[0] ?? null;

  // SETTINGS: a card a setting; CONTROLS and CLEAR RECORDS open their own rows.
  const settingsRow = (initial = 0): CardRow => {
    const cards = settingCards(
      player,
      {
        setVolume: devices.setVolume,
        audition: () =>
          devices.audition(catalog.music.find((t) => t.id === latestTrack(player, catalog.music)) ?? catalog.music[0]!),
      },
      {
        controls: () => go(controlsRow(), 'thin'),
        clearRecords: () => go(clearRow(), 'thin'),
      },
    );
    return row({ kind: 'cards', world: null, initial, cards, back: () => (go(menuRow(), 'thin'), 'back') });
  };
  const settingsAt = (name: string) => settingsRow(10 + Number(name === 'CLEAR RECORDS'));
  const controlsRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      cards: [{ name: 'CONTROLS' }],
      back: () => (go(settingsAt('CONTROLS'), 'thin'), 'back'),
    });
  const clearRow = (): CardRow =>
    row({
      kind: 'cards',
      world: null,
      cards: clearRecordCards(player, () => go(settingsAt('CLEAR RECORDS'), 'thin')),
      back: () => (go(settingsAt('CLEAR RECORDS'), 'thin'), 'back'),
    });

  const screen = createCardRows(
    devices.frame,
    devices.text,
    devices.present,
    devices.faces,
    { ...devices.demo, logo: catalog.logo },
    titleRow(),
  );
  const go = (next: CardRow, change: RowChange) => screen.go(next, change);
  // Enter the selection at `next` from outside: the page's start, or a run.
  const enter = (next: CardRow) => {
    screen.enter(next);
    devices.show(screen);
  };
  // A run's request becomes the current selection; the rows above its row are rebuilt from it.
  const adopt = (run: RunRequest): boolean => {
    vehicleId = run.vehicleId;
    if (run.color !== null) colors.set(run.vehicleId, run.color);
    if (!isFreePlay(run)) {
      classChoice = catalog.series.seriesClass(run.seriesId, run.classId);
      seriesChoice = classChoice?.series ?? null;
      menu = 'SERIES';
      // A series' world plays its title track from its start.
      if (seriesChoice) {
        devices.music.fadeOut(0);
        devices.music.play(trackOf(seriesChoice));
      }
      return seriesChoice !== null && selectable.some((s) => s.series === seriesChoice);
    }
    menu = 'FREE PLAY';
    courseId = run.courseId;
    group = groups.find((g) => g.courses.includes(run.courseId)) ?? null;
    return group !== null;
  };
  // TITLE and FREE PLAY's rows hold no music.
  const silent = () => devices.music.play(null);
  const title = () => {
    silent();
    enter(titleRow());
  };
  return Object.freeze({
    /** The screen all the rows stand on. */
    screen,
    title,
    /** SELECT VEHICLE with `run`'s selection, or TITLE when its rows are not offered. */
    vehicle(run: RunRequest) {
      if (!adopt(run)) return title();
      if (menu === 'FREE PLAY') silent();
      enter(vehicleRow());
    },
    /** The course's row of `run`'s selection: SELECT CLASS in a series, SELECT COURSE in FREE PLAY. */
    select(run: RunRequest) {
      if (!adopt(run)) return title();
      if (menu === 'FREE PLAY') silent();
      enter(menu === 'SERIES' ? classRow() : courseRow());
    },
  });
}
