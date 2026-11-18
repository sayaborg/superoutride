import type { CourseIndex, CourseIndexEntry } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog, SeriesClass } from '../content/series-catalog.js';
import type { FrontEndSelection, SelectableSeries } from '../content/front-end-selection.js';
import { runPlayerColor } from '../race/run-setup.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { spriteSetColors } from '../vehicle/vehicle-sprite-set.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { MusicCatalog } from '../content/recording-catalog.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import { latestTrack, recordedColor, type RunRequest } from './run-request.js';
import type { Screen } from './screen-host.js';
import { clearRecordCards, settingCards } from './settings-screens.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { CardFaces } from './card-face.js';
import { createCardRows, PATH_ROOT, type Card, type CardRow, type MainWorld, type RowChange } from './card-rows.js';
import type { CardPage } from './card-face.js';
import type { CardStyle } from './card-styles.js';
import { classPage } from './class-page.js';
import { coursePage } from './course-page.js';
import { vehicleCard } from './vehicle-card.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';

/** A move on SELECT SERIES, and leaving it for TITLE, fade the title track out over this time. */
export const SERIES_FADE_SECONDS = 0.25;

/** What the selection offers: delivered courses, series and vehicles and the front end's lists. */
export interface SelectionCatalog {
  readonly courses: CourseIndex;
  readonly series: SeriesCatalog;
  readonly frontEnd: FrontEndSelection;
  readonly vehicles: readonly CompiledVehicleDefinition[];
  /** The driving definition the vehicles run under: their cards' engines rev and their graphs end at its fuel cut. */
  readonly driving: CompiledDrivingDefinition;
  /** The delivered tracks; the SETTINGS audition plays the latest, else the first. */
  readonly music: MusicCatalog;
  readonly player: PlayerRecord;
  /** `dev=1`: DEV series, and the courses in no series, are offered. */
  readonly dev: boolean;
  /** The main picture (`mainPicture`), which the main world shows over the attract demo. */
  readonly mainPicture: TilePicture;
  /** The cards' style while their design is tried (K, 2026-11-12): the one shown, and SETTINGS' step to the next. */
  readonly cardStyle: { current(): CardStyle; step(by: -1 | 1): void };
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
  readonly demo: Omit<MainWorld, 'picture'>;
  /** Sound the engine a vehicle's card revs, as the player's. */
  engine(engine: CompetitorObservation): void;
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
 * one screen, one path from PRESS START (K, 2026-11-19): SELECT SERIES, whose last card is FREE PLAY, then in the
 * series' world SELECT CLASS (its classes' cards), SELECT COURSE (the class's course, to confirm, or for a class of any
 * course every offered course, apart from any series) and SELECT VEHICLE (the class's vehicles, or every vehicle). PAUSE
 * opens SETTINGS, one list card, from any row, standing in that row's world, and BACK or PAUSE returns to the row it was
 * opened from. Every row is shown, even with one card, and BACK returns to the row before. SELECT VEHICLE's CONFIRM
 * requests the class's RACE, which plays its course's first race track, if it has one (K, 2026-11-11). Each row starts
 * from the current choice, else the player record's latest, else its first.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, player, dev, frontEnd } = catalog;
  const selectable = frontEnd.seriesRow(dev);
  // The courses a class of any course offers, in the course index's order: those the offered series' classes run, and
  // with DEV every course. They stand as courses, apart from any series (K, 2026-11-11 and 2026-11-19).
  const run = new Set(
    catalog.series.series.filter((s) => !s.dev).flatMap((s) => s.classes.flatMap((c) => c.course ?? [])),
  );
  const offered = courses.filter((c) => dev || run.has(c.id)).map((c) => c.id);
  const courseOf = (id: string): CourseIndexEntry => courses.find((c) => c.id === id)!;
  // A series offers a class of its own course, or one of any course while a course is offered.
  const offers = (s: SelectableSeries) =>
    s.series !== null && s.series.classes.some((c) => c.course !== null || offered.length > 0);

  const latest = (key: string): string | undefined => player.settings.latestSelections[key];
  const remember = (key: string, value: string) =>
    player.updateSettings({ latestSelections: { ...player.settings.latestSelections, [key]: value } });
  // The current selection: the course is chosen for a class of any course alone.
  let pressed = false,
    seriesChoice: CompiledSeries | null = null,
    classChoice: SeriesClass | null = null,
    courseId: string | null = null,
    vehicleId: string | null = null;
  // The chosen colors of the vehicles shown, by vehicle, until the run is requested.
  const colors = new Map<string, string>();
  // The rows' music, and whether a track plays: SETTINGS' audition is the track that plays, else one of its own.
  let playing: MusicTrack | null = null;
  const music = Object.freeze({
    get playing() {
      return playing !== null;
    },
    play(track: MusicTrack | null) {
      playing = track;
      devices.music.play(track);
    },
    fadeOut(seconds: number) {
      playing = null;
      devices.music.fadeOut(seconds);
    },
  });

  const at = <T>(items: readonly T[], found: (item: T) => boolean) => Math.max(0, items.findIndex(found));
  const row = (fields: Omit<CardRow, 'initial'> & { readonly initial?: number }): CardRow =>
    Object.freeze({ initial: 0, ...fields });
  // A series' title track and world, as SELECT SERIES shows it: none, and the main world, for FREE PLAY.
  const shownOf = (s: CompiledSeries) => selectable.find((entry) => entry.series === s);
  const trackOf = (s: CompiledSeries) => (shownOf(s) ? shownOf(s)!.titleTrack : s.music.title);
  const worldOf = (s: CompiledSeries) => shownOf(s)?.picture ?? s.image;

  const titleRow = (): CardRow =>
    row({
      kind: 'title',
      world: null,
      cards: [
        {
          name: '',
          confirm: () => {
            go(seriesRow(), 'thin');
            if (pressed) return 'confirm';
            // The first CONFIRM is the user gesture that starts the sound and fullscreen.
            pressed = true;
            devices.activate();
            return 'start';
          },
        },
      ],
    });
  // SELECT SERIES: the series pictures, FREE PLAY's the main world itself (K, 2026-11-19).
  const seriesRow = (): CardRow =>
    row({
      kind: 'series',
      world: null,
      path: [PATH_ROOT],
      initial: at(selectable, (s) => s.id === (seriesChoice?.id ?? latest('series'))),
      cards: selectable.map((entry): Card => ({
        name: entry.name,
        ...(entry.picture ? { picture: entry.picture } : {}),
        dim: entry.series !== null && !offers(entry),
        deny: entry.series === null,
        confirm: () => {
          const chosen = entry.series!;
          if (chosen !== seriesChoice) [classChoice, courseId, vehicleId] = [null, null, null];
          seriesChoice = chosen;
          remember('series', chosen.id);
          music.play(entry.titleTrack);
          go(classRow(), 'zoom-in');
          return 'confirm';
        },
      })),
      // The series in focus plays its title track once the row rests, FREE PLAY none; a move fades it out.
      rested: (index) => music.play(selectable[index]!.titleTrack),
      moved: () => music.fadeOut(SERIES_FADE_SECONDS),
      back: () => {
        music.fadeOut(SERIES_FADE_SECONDS);
        go(titleRow(), 'thin');
        return 'back';
      },
    });
  const vehicleOf = (id: string) => vehicles.find((v) => v.compiledVehicle.id === id)!;
  // The class, course and vehicle cards' pages, each made once in each card style: a vehicle's for each of its colors.
  const pages = new Map<string, CardPage>();
  const pageOf = (key: string, make: (style: CardStyle) => CardPage) => {
    const style = catalog.cardStyle.current(),
      styled = `${style.id}/${key}`;
    let page = pages.get(styled);
    if (!page) pages.set(styled, (page = make(style)));
    return page;
  };
  const coursePageOf = (id: string) => pageOf(`course/${id}`, (style) => coursePage(courseOf(id), style));
  const classRow = (): CardRow => {
    const chosen = seriesChoice!;
    return row({
      kind: 'cards',
      world: worldOf(chosen),
      path: [PATH_ROOT, chosen.title],
      initial: at(chosen.classes, (c) => c.id === (classChoice?.id ?? latest('class'))),
      cards: chosen.classes.map((c): Card => ({
        name: c.title,
        dim: c.course === null && offered.length === 0,
        page: () =>
          pageOf(`class/${chosen.id}/${c.id}`, (style) =>
            classPage(c, c.course === null ? null : courseOf(c.course), vehicleOf, style),
          ),
        confirm: () => {
          // Another class offers its own vehicles.
          if (c !== classChoice) vehicleId = null;
          classChoice = c;
          remember('class', c.id);
          go(courseRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(seriesRow(), 'zoom-out'), 'back'),
    });
  };
  // SELECT COURSE: the class's course alone, to confirm; for a class of any course, every course offered.
  const courseRow = (): CardRow => {
    const runClass = classChoice!;
    const shown = runClass.course === null ? offered : [runClass.course];
    return row({
      kind: 'cards',
      world: worldOf(runClass.series),
      path: [PATH_ROOT, runClass.series.title, runClass.title],
      initial: at(shown, (id) => id === (courseId ?? latest('course'))),
      cards: shown.map((id): Card => ({
        name: courseOf(id).name,
        page: () => coursePageOf(id),
        confirm: () => {
          if (runClass.course === null) {
            courseId = id;
            remember('course', id);
          }
          go(vehicleRow(), 'thin');
          return 'confirm';
        },
      })),
      back: () => (go(classRow(), 'thin'), 'back'),
    });
  };

  // SELECT VEHICLE: the class's vehicles, or every vehicle in a class of any vehicle; UP and DOWN choose the color,
  // except where the class fixes it.
  const vehicleRow = (): CardRow => {
    const runClass = classChoice!;
    const course = runClass.course ?? courseId!;
    const candidates = runClass.vehicles ? runClass.vehicles.map(vehicleOf) : vehicles;
    const colorOf = (v: CompiledVehicleDefinition) =>
      runPlayerColor(runClass, v, colors.get(v.compiledVehicle.id) ?? recordedColor(player, v));
    return row({
      kind: 'cards',
      world: worldOf(runClass.series),
      path: [PATH_ROOT, runClass.series.title, runClass.title, courseOf(course).name],
      initial: at(candidates, (v) => v.compiledVehicle.id === (vehicleId ?? latest('vehicle'))),
      cards: candidates.map((v): Card => {
        const { manufacturer, model } = v.listing.metadata;
        const changes = !runClass.fixedColors;
        return {
          name: `${manufacturer} ${model}`.toUpperCase(),
          page: () => {
            const color = colorOf(v);
            return pageOf(`vehicle/${v.compiledVehicle.id}/${color}/${changes}`, (style) =>
              vehicleCard(v, { color, changes }, catalog.driving, style),
            );
          },
          change: (by) => {
            if (runClass.fixedColors) return false;
            colors.set(v.compiledVehicle.id, wrap(spriteSetColors(v.spriteSet), colorOf(v), by));
            return true;
          },
          confirm: () => {
            const id = v.compiledVehicle.id;
            const color = runClass.fixedColors ? null : colorOf(v);
            if (color !== null)
              player.updateSettings({ vehicleColors: { ...player.settings.vehicleColors, [id]: color } });
            vehicleId = id;
            remember('vehicle', id);
            devices.run(request(id, color), () => enter(vehicleRow()));
            return 'entry';
          },
        };
      }),
      back: () => (go(courseRow(), 'thin'), 'back'),
    });
  };
  const wrap = <T>(choices: readonly T[], value: T, by: -1 | 1) =>
    choices[(choices.indexOf(value) + by + choices.length) % choices.length]!;
  // The class's RACE that SELECT VEHICLE requests, naming the course of a class of any course.
  const request = (id: string, color: string | null): RunRequest => {
    const runClass = classChoice!;
    const course = runClass.course ?? courseId!;
    return Object.freeze({
      seriesId: runClass.series.id,
      classId: runClass.id,
      session: 'RACE',
      vehicleId: id,
      color,
      track: raceTrack(course),
      ...(runClass.course === null ? { courseId: course } : {}),
    });
  };
  // A run plays its course's first race track, or none.
  const raceTrack = (id: string) => courseOf(id).raceTracks[0] ?? null;

  // SETTINGS: one list card of the settings, out of the path, which PAUSE opens from any row in that row's world and
  // BACK or PAUSE closes, back to that row as it was (K, 2026-11-19); CONTROLS and CLEAR RECORDS open their own rows.
  let opened: { readonly row: CardRow; readonly index: number; readonly item: number } | null = null;
  const settingsRow = (initialItem = 0): CardRow => {
    const items = settingCards(
      player,
      {
        setVolume: devices.setVolume,
        // The rows' music plays on in SETTINGS and is its audition; where they are silent, a track plays for it.
        audition: () =>
          music.playing
            ? () => {}
            : devices.audition(
                catalog.music.find((t) => t.id === latestTrack(player, catalog.music)) ?? catalog.music[0]!,
              ),
      },
      {
        controls: () => go(controlsRow(), 'thin'),
        clearRecords: () => go(clearRow(), 'thin'),
      },
      catalog.cardStyle,
    );
    return row({
      kind: 'cards',
      world: opened!.row.world,
      path: [PATH_ROOT, 'SETTINGS'],
      initialItem,
      cards: [{ name: 'SETTINGS', items }],
      back: () => (close(), 'back'),
    });
  };
  const settingsAt = (name: string) => settingsRow(11 + Number(name === 'CLEAR RECORDS'));
  const controlsRow = (): CardRow =>
    row({
      kind: 'cards',
      world: opened!.row.world,
      path: [PATH_ROOT, 'SETTINGS'],
      cards: [{ name: 'CONTROLS' }],
      back: () => (go(settingsAt('CONTROLS'), 'thin'), 'back'),
    });
  const clearRow = (): CardRow =>
    row({
      kind: 'cards',
      world: opened!.row.world,
      path: [PATH_ROOT, 'SETTINGS', 'CLEAR RECORDS'],
      cards: clearRecordCards(player, () => go(settingsAt('CLEAR RECORDS'), 'thin')),
      back: () => (go(settingsAt('CLEAR RECORDS'), 'thin'), 'back'),
    });
  // Back to the row SETTINGS was opened from, its card and entry in focus as they were.
  const close = () => {
    const { row: from, index, item } = opened!;
    opened = null;
    go(Object.freeze({ ...from, initial: index, initialItem: item }), 'thin');
  };
  const pause = () => {
    if (opened) {
      close();
      return 'back' as const;
    }
    opened = { row: screen.row!, index: screen.index, item: screen.item };
    go(settingsRow(), 'thin');
    return 'confirm' as const;
  };

  const screen = createCardRows(
    devices.frame,
    devices.text,
    devices.present,
    devices.faces,
    { ...devices.demo, picture: catalog.mainPicture },
    titleRow(),
    devices.engine,
    pause,
  );
  const go = (next: CardRow, change: RowChange) => screen.go(next, change);
  // Enter the selection at `next` from outside: the page's start, or a run.
  const enter = (next: CardRow) => {
    opened = null;
    screen.enter(next);
    devices.show(screen);
  };
  // A run's request becomes the current selection; the rows above its row are rebuilt from it. A run outside the rows
  // (one of a series not shown, or on a course not offered) is not adopted.
  const adopt = (run: RunRequest): boolean => {
    vehicleId = run.vehicleId;
    if (run.color !== null) colors.set(run.vehicleId, run.color);
    classChoice = catalog.series.seriesClass(run.seriesId, run.classId);
    seriesChoice = classChoice?.series ?? null;
    if (!classChoice || !selectable.some((s) => s.series === seriesChoice)) return false;
    if (classChoice.course === null) {
      if (!offered.includes(run.courseId!)) return false;
      courseId = run.courseId!;
    }
    // A series' world plays its title track from its start.
    music.fadeOut(0);
    music.play(trackOf(seriesChoice!));
    return true;
  };
  const title = () => {
    music.play(null);
    enter(titleRow());
  };
  return Object.freeze({
    /** The screen all the rows stand on. */
    screen,
    title,
    /** SELECT VEHICLE with `run`'s selection, or TITLE when its rows are not offered. */
    vehicle(run: RunRequest) {
      if (!adopt(run)) return title();
      enter(vehicleRow());
    },
    /**
     * The row `run` was selected from (K, 2026-11-19): SELECT CLASS, or SELECT COURSE for a class of any course
     * (FREE PLAY's); TITLE when its rows are not offered.
     */
    select(run: RunRequest) {
      if (!adopt(run)) return title();
      enter(classChoice!.course === null ? courseRow() : classRow());
    },
  });
}
