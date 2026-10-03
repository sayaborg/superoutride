import type { CourseIndex } from '../content/course-index.js';
import type { CompiledSeries, SeriesCatalog } from '../content/series-catalog.js';
import { SESSION_RULE_LIMITS } from '../course/session-rules.js';
import { formPool, RIVAL_POOLS, type RivalPool } from '../race/free-play-field.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import { createMenuScreen, type MenuDefinition, type MenuItem } from './menu.js';
import type { PlayerRecord } from './player-record.js';
import { recordedColor, type RunRequest } from './run-request.js';
import type { Screen } from './screen-host.js';
import { createVehicleScreen } from './vehicle-screen.js';

type Mode = RunRequest['mode'];
type Step = 'SERIES' | 'COURSE' | 'VEHICLE' | 'OPTIONS' | 'LAPS';

/** The selection screens after SELECT MODE, by mode; the last confirm requests the run. */
const FLOW: Readonly<Record<Mode, readonly Step[]>> = Object.freeze({
  ARCADE: ['SERIES', 'COURSE', 'VEHICLE'],
  FREE_PLAY: ['COURSE', 'VEHICLE', 'OPTIONS'],
  TIME_TRIAL: ['COURSE', 'VEHICLE', 'LAPS'],
});
const MODES: readonly { readonly mode: Mode; readonly label: string }[] = [
  { mode: 'ARCADE', label: 'ARCADE' },
  { mode: 'FREE_PLAY', label: 'FREE PLAY' },
  { mode: 'TIME_TRIAL', label: 'TIME TRIAL' },
];

/** What the selection offers: delivered courses, series and vehicles, and whether DEV content is shown. */
export interface SelectionCatalog {
  readonly courses: CourseIndex;
  readonly series: SeriesCatalog;
  readonly vehicles: readonly CompiledVehicleDefinition[];
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
  /** A confirm on TITLE: the user gesture that enables sound where the browser allows it. */
  enableSound(): void;
  /** Request the selected run; `back` returns to the last selection screen. */
  run(request: RunRequest, back: () => void): void;
}

/**
 * The selection flow from TITLE to a run request. TITLE leads to SELECT MODE, and each mode's screens follow the flow
 * table; SELECT COURSE in ARCADE appears only for a series with several courses, LAPS only on a course with several
 * laps. BACK returns to the previous screen. A mode, series or course that offers nothing to select is DARK.
 */
export function createSelectionFlow(catalog: SelectionCatalog, devices: SelectionDevices) {
  const { courses, vehicles, player, dev } = catalog;
  const series = catalog.series.series.filter((s) => (dev || !s.dev) && s.courses.length > 0);
  const inSeries = new Set(catalog.series.series.flatMap((s) => s.courses.map((c) => c.course)));
  // FREE PLAY and TIME TRIAL courses grouped by series; courses in no series last, only with DEV.
  const groups = [
    ...series.map((s) => ({ title: s.title, ids: s.courses.map((c) => c.course) })),
    ...(dev ? [{ title: '', ids: courses.filter((c) => !inSeries.has(c.id)).map((c) => c.id) }] : []),
  ].filter((group) => group.ids.length > 0);
  const offered = (mode: Mode) => (mode === 'ARCADE' ? series.length > 0 : groups.length > 0);
  const courseOf = (id: string) => courses.find((c) => c.id === id)!;

  // The current selection.
  let mode: Mode = 'ARCADE',
    step = -1,
    seriesChoice: CompiledSeries | null = null,
    courseId: string | null = null,
    vehicleId: string | null = null,
    color: string | null = null,
    lapCount = 1,
    rivalCount = 0,
    rivalPool: RivalPool = 'ALL';
  const needed = (at: Step) =>
    at === 'COURSE'
      ? mode !== 'ARCADE' || seriesChoice!.courses.length > 1
      : at === 'LAPS'
        ? courseOf(courseId!).maxLaps > 1
        : true;
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
    const choice = { courseId: courseId!, vehicleId: vehicleId!, color };
    if (mode === 'ARCADE') return Object.freeze({ ...choice, mode });
    if (mode === 'TIME_TRIAL') return Object.freeze({ ...choice, mode, lapCount });
    return Object.freeze({ ...choice, mode, lapCount, rivalCount, rivalPool });
  };
  // A number item LEFT/RIGHT changes within [min, max].
  const number = (label: string, value: () => number, set: (n: number) => void, min: number, max: number) => ({
    label,
    value: String(value()),
    adjust: (by: -1 | 1) => set(Math.min(max, Math.max(min, value() + by))),
  });
  const start: MenuItem = { label: 'START', confirm: forward };

  function title() {
    step = -1;
    const items: readonly MenuItem[] = [
      {
        label: 'START',
        confirm: () => {
          devices.enableSound();
          selectMode();
        },
      },
      { label: 'SETTINGS', disabled: true },
    ];
    menu({ title: 'SUPER OUTRIDE', items: () => items });
  }
  function selectMode() {
    step = -1;
    const items = MODES.map((m): MenuItem => ({
      label: m.label,
      disabled: !offered(m.mode),
      confirm: () => {
        if (m.mode !== mode) [seriesChoice, courseId, vehicleId] = [null, null, null];
        mode = m.mode;
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
            if (s !== seriesChoice) [courseId, vehicleId] = [s.courses[0]!.course, null];
            seriesChoice = s;
            forward();
          },
        }));
        return menu({ title: 'SELECT SERIES', items: () => items, back }, Math.max(0, series.indexOf(seriesChoice!)));
      }
      case 'COURSE': {
        const lists = mode === 'ARCADE' ? [{ title: '', ids: seriesChoice!.courses.map((c) => c.course) }] : groups;
        // Series titles head their groups; they cannot be chosen.
        const items = lists.flatMap((group): MenuItem[] => [
          ...(lists.length > 1 || group.title ? [{ label: group.title || ' ', disabled: true }] : []),
          ...group.ids.map((id) => ({
            label: courseOf(id).name,
            confirm: () => {
              courseId = id;
              lapCount = Math.min(lapCount, courseOf(id).maxLaps);
              forward();
            },
          })),
        ]);
        const current = items.findIndex((item) => item.label === (courseId && courseOf(courseId).name));
        return menu({ title: 'SELECT COURSE', items: () => items, back }, Math.max(0, current));
      }
      case 'VEHICLE': {
        const candidates =
          mode === 'ARCADE'
            ? seriesChoice!.vehicles.map((id) => vehicles.find((v) => v.compiledVehicle.id === id)!)
            : vehicles;
        return devices.show(
          createVehicleScreen(
            devices.frame,
            devices.text,
            devices.present,
            candidates,
            {
              vehicleId,
              fixedColors: mode === 'ARCADE' && seriesChoice!.fixedColors,
              colorOf: (v) => recordedColor(player, v) ?? v.listing.visuals.palette,
            },
            {
              confirm: (vehicle, chosen) => {
                const id = vehicle.compiledVehicle.id;
                if (chosen !== null)
                  player.updateSettings({ vehicleColors: { ...player.settings.vehicleColors, [id]: chosen } });
                if (id !== vehicleId) rivalPool = formPool(vehicle);
                [vehicleId, color] = [id, chosen];
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
          number(
            'RIVALS',
            () => rivalCount,
            (n) => (rivalCount = n),
            0,
            SESSION_RULE_LIMITS.rivals,
          ),
          {
            label: 'POOL',
            value: rivalPool,
            adjust: (by) =>
              (rivalPool =
                RIVAL_POOLS[(RIVAL_POOLS.indexOf(rivalPool) + by + RIVAL_POOLS.length) % RIVAL_POOLS.length]!),
          },
          ...(maxLaps > 1
            ? [
                number(
                  'LAPS',
                  () => lapCount,
                  (n) => (lapCount = n),
                  1,
                  maxLaps,
                ),
              ]
            : []),
          start,
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
              (n) => (lapCount = n),
              1,
              maxLaps,
            ),
            start,
          ],
          back,
        });
      }
    }
  }
  return Object.freeze({ title });
}
