import { HUD_TILES, TEXT_PALETTES } from '../image/text-tiles.js';
import type { RaceFacts } from '../race/course-race.js';
import type { GameOverCause } from '../race/run-outcome.js';
import { MODE_NAMES, type RunRequest } from './run-request.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { TEXT_COLUMNS, type TextLayer } from '../view/text-layer.js';
import { formatMilliseconds, formatRaceTime, formatTimeDifference, raceMilliseconds } from './race-time.js';
import { shownStanding } from './run-result.js';
import type { ComparedRecord } from './run-records.js';

/**
 * What the HUD reads in one frame: the race's facts, the player's observation, the player's final input sample, the
 * Session's course, mode and the player vehicle's engine speeds from its definitions, and the record the run compares
 * against.
 */
export interface HudFacts {
  readonly race: RaceFacts;
  readonly player: CompetitorObservation;
  readonly input: DrivingInput;
  readonly session: {
    readonly courseName: string;
    readonly mode: RunRequest['mode'];
    /** The tachometer's redline and full scale, where the limiter cuts fuel. */
    readonly redlineRpm: number;
    readonly fuelCutRpm: number;
  };
  /**
   * The stored record for the selection, from the records before the run, once its route (TIME TRIAL) or goal (ARCADE)
   * is decided; `splitsMs` are a TIME TRIAL record run's gate and lap crossings. Null without one.
   */
  readonly record: ComparedRecord | null;
}

/** Seconds a passing display lasts, in the time base its fact is stamped in. */
export const HUD_DURATIONS = Object.freeze({
  /** TIME stays yellow after an extension (race time). */
  extension: 2,
  /** A finished lap's time holds in yellow (race time). */
  lapHold: 2,
  /** The gear stays yellow after a shift (simulation time). */
  shift: 0.3,
  /** The signal lamps stay green after GO (race time). */
  go: 1,
  /** The difference from the record run shows after each gate and lap crossing (race time). */
  split: 2,
});
const CAUSE_NAMES: Readonly<Record<GameOverCause, string>> = { TIME: 'TIME UP', RANK: 'RANK OUT' };

/**
 * Where every HUD element sits in the 40×30 text grid, as [column, row]; a value written right-aligned ends at its
 * column, `'center'` centres a line on its row, and a signal lamp's place is its top-left tile. Moving an element is a
 * change of these numbers only.
 */
export const HUD_LAYOUT = Object.freeze({
  timeLabel: [1, 1],
  timeValue: [3, 2],
  elapsed: [9, 2],
  positionLabel: [25, 1],
  positionValue: [25, 2],
  stageLabel: [33, 1],
  stageValue: [36, 2],
  lapLabel: [1, 4],
  lapTime: [10, 4],
  bestLabel: [1, 5],
  bestTime: [10, 5],
  pass: [27, 4],
  target: [24, 5],
  gear: [29, 27],
  speed: [29, 28],
  speedUnit: [31, 28],
  extend: ['center', 7],
  split: ['center', 7],
  courseName: ['center', 10],
  mode: ['center', 11],
  record: ['center', 12],
  lamp1: [15, 13],
  lamp2: [19, 13],
  lamp3: [23, 13],
  outcome: ['center', 16],
  cause: ['center', 17],
  steerLabel: [1, 26],
  steerBar: [7, 26],
  gasLabel: [1, 27],
  gasBar: [7, 27],
  brakeLabel: [1, 28],
  brakeBar: [7, 28],
  rpmLabel: [1, 29],
  rpmBar: [7, 29],
} as const satisfies Record<string, readonly [number | 'center', number]>);

type Place = keyof typeof HUD_LAYOUT;
const columnOf = (place: Place, length: number) => {
  const column = HUD_LAYOUT[place][0];
  return column === 'center' ? Math.floor((TEXT_COLUMNS - length) / 2) : column;
};
const write = (text: TextLayer, place: Place, line: string, palette: number = TEXT_PALETTES.WHITE) =>
  text.write(columnOf(place, line.length), HUD_LAYOUT[place][1], line, palette);
/** Right-aligned: the line's last character at the place's column. */
const writeRight = (text: TextLayer, place: Place, line: string, palette: number = TEXT_PALETTES.WHITE) =>
  text.write(columnOf(place, 1) - line.length + 1, HUD_LAYOUT[place][1], line, palette);
/** A 2×2 signal lamp, lit or unlit, in a palette. */
const writeLamp = (text: TextLayer, place: Place, lit: boolean, palette: number) => {
  const column = columnOf(place, 2),
    row = HUD_LAYOUT[place][1];
  (['TL', 'TR', 'BL', 'BR'] as const).forEach((part, i) =>
    text.put(column + (i & 1), row + (i >> 1), HUD_TILES[`LAMP_${lit ? 'ON' : 'OFF'}_${part}`]!, palette),
  );
};
/** A bar's cells; each holds 8 pixels, so a bar is 80 pixels long between its end caps. */
const BAR_CELLS = 10;
const BAR_PIXELS = BAR_CELLS * 8;
const barPixel = (fraction: number) => Math.min(BAR_PIXELS, Math.max(0, Math.round(fraction * BAR_PIXELS)));
/**
 * The one bar part: end caps at the place and after its cells, the pixels `[from, to)` filled, each cell RED from the
 * `red` pixel on (`'all'` for every cell) and WHITE before it, and 1-pixel marks drawn over the cells in their palettes.
 */
const writeBar = (
  text: TextLayer,
  place: Place,
  from: number,
  to: number,
  red: number | 'all' | null,
  marks: readonly { readonly pixel: number; readonly palette: number }[],
) => {
  const column = columnOf(place, 1),
    row = HUD_LAYOUT[place][1];
  text.put(column, row, HUD_TILES.BAR_LEFT!, TEXT_PALETTES.WHITE);
  text.put(column + BAR_CELLS + 1, row, HUD_TILES.BAR_RIGHT!, TEXT_PALETTES.WHITE);
  for (let cell = 0; cell < BAR_CELLS; cell++) {
    const start = cell * 8,
      filled = Math.max(0, Math.min(to, start + 8) - Math.max(from, start));
    const tile = filled > 0 && from > start ? `BAR_FILL_RIGHT_${filled}` : `BAR_FILL_${filled}`;
    const palette = red === 'all' || (red !== null && start >= red) ? TEXT_PALETTES.RED : TEXT_PALETTES.WHITE;
    text.put(column + 1 + cell, row, HUD_TILES[tile]!, palette);
  }
  for (const { pixel, palette } of marks) {
    const at = Math.min(BAR_PIXELS - 1, pixel);
    text.overlay(column + 1 + (at >> 3), row, HUD_TILES[`BAR_MARK_${at & 7}`]!, palette);
  }
};
const inputMark = (fraction: number) => ({ pixel: barPixel(fraction), palette: TEXT_PALETTES.YELLOW });

const extended = ({ clock }: RaceFacts) => {
  const extension = clock.lastExtension;
  return (
    extension !== null && extension.ms > 0 && clock.elapsedSeconds <= extension.atSeconds + HUD_DURATIONS.extension
  );
};
const beforeGo = ({ outcome }: RaceFacts) => outcome.status === 'WAITING' || outcome.status === 'READY';
const ended = ({ outcome }: RaceFacts) => outcome.status === 'GOAL' || outcome.status === 'GAME_OVER';

/**
 * One HUD element: when it shows, decided from Session rules and race facts, and what it writes. A passing notice in
 * the middle rows is not drawn while a menu is over the frame.
 */
interface HudElement {
  readonly middle?: true;
  when(facts: HudFacts): boolean;
  write(facts: HudFacts, text: TextLayer): void;
}

/**
 * The product HUD's elements and their conditions ([product](../../docs/product.md#9-hud)). Each element reads one
 * observation; this table alone decides which elements show.
 */
const HUD_ELEMENTS: readonly HudElement[] = [
  {
    // Seconds remaining, rounded up; red under ten seconds, yellow for two seconds after an extension.
    when: ({ race }) => race.clock.deadlineSeconds !== null,
    write({ race }, text) {
      const { clock } = race;
      const remaining = Math.max(0, clock.deadlineSeconds! - clock.elapsedSeconds);
      write(text, 'timeLabel', 'TIME');
      writeRight(
        text,
        'timeValue',
        String(Math.ceil(remaining)),
        extended(race) ? TEXT_PALETTES.YELLOW : remaining < 10 ? TEXT_PALETTES.RED : TEXT_PALETTES.WHITE,
      );
    },
  },
  {
    // Race time.
    when: () => true,
    write: ({ race }, text) => write(text, 'elapsed', formatRaceTime(race.clock.elapsedSeconds)),
  },
  {
    when: ({ race }) => shownStanding(race) !== null,
    write({ race }, text) {
      const standing = shownStanding(race)!;
      write(text, 'positionLabel', 'POS');
      write(text, 'positionValue', `${standing.rank}/${standing.count}`);
    },
  },
  {
    when: ({ race }) => race.courseType !== 'CIRCUIT',
    write({ race }, text) {
      write(text, 'stageLabel', 'STAGE');
      writeRight(text, 'stageValue', String(race.stage));
    },
  },
  {
    // The lap and its time; a finished lap's time holds in yellow.
    when: ({ race }) => race.courseType === 'CIRCUIT',
    write({ race }, text) {
      const { player, clock, lap, lapCount } = race;
      write(text, 'lapLabel', `LAP ${lap}/${lapCount}`);
      const lapStart = player.lapStartSeconds ?? 0;
      const held = player.lastLapSeconds !== null && clock.elapsedSeconds - lapStart < HUD_DURATIONS.lapHold;
      write(
        text,
        'lapTime',
        formatRaceTime(held ? player.lastLapSeconds! : clock.elapsedSeconds - lapStart),
        held ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE,
      );
    },
  },
  {
    when: ({ race }) => race.courseType === 'CIRCUIT',
    write({ race }, text) {
      write(text, 'bestLabel', 'BEST');
      const best = race.player.bestLapSeconds;
      write(text, 'bestTime', best === null ? `-'--"---` : formatRaceTime(best));
    },
  },
  {
    // Until the run ends: an ended run has no next gate to pass.
    when: ({ race }) => !ended(race) && race.nextRankLimit !== null,
    write: ({ race }, text) => write(text, 'pass', `PASS ${race.nextRankLimit}`),
  },
  {
    when: ({ race }) => (race.stageRivalGap ?? 0) > 0,
    write: ({ race }, text) => write(text, 'target', `TARGET ${Math.round(race.stageRivalGap!)}M`),
  },
  {
    // The gear, yellow briefly after a shift.
    when: () => true,
    write({ race, player: { powertrain } }, text) {
      const shifted =
        powertrain.shiftSeconds !== null && race.simulationSeconds - powertrain.shiftSeconds < HUD_DURATIONS.shift;
      writeRight(text, 'gear', String(powertrain.gear), shifted ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.WHITE);
    },
  },
  {
    when: () => true,
    write({ player }, text) {
      writeRight(text, 'speed', String(Math.round(player.speed * 3.6)));
      write(text, 'speedUnit', 'KM/H');
    },
  },
  {
    // Steering: the delivered offset fills from the centre (DARK mark); the input is the yellow mark.
    when: () => true,
    write({ player, input }, text) {
      const half = BAR_PIXELS / 2,
        actual = half + Math.round(player.control.steering * half);
      write(text, 'steerLabel', 'STEER');
      writeBar(text, 'steerBar', Math.min(half, actual), Math.max(half, actual), null, [
        { pixel: half, palette: TEXT_PALETTES.DARK },
        inputMark((1 + input.steering) / 2),
      ]);
    },
  },
  {
    when: () => true,
    write({ player, input }, text) {
      write(text, 'gasLabel', 'GAS');
      writeBar(text, 'gasBar', 0, barPixel(player.control.throttle), null, [inputMark(Number(input.throttle))]);
    },
  },
  {
    when: () => true,
    write({ player, input }, text) {
      write(text, 'brakeLabel', 'BRAKE');
      writeBar(text, 'brakeBar', 0, barPixel(player.control.brake), null, [inputMark(Number(input.brake))]);
    },
  },
  {
    // The tachometer to the fuel cut: red from the redline (a red mark), wholly red while the limiter cuts fuel.
    when: () => true,
    write({ player: { powertrain }, session }, text) {
      const redline = barPixel(session.redlineRpm / session.fuelCutRpm);
      write(text, 'rpmLabel', 'RPM');
      writeBar(
        text,
        'rpmBar',
        0,
        barPixel(powertrain.engineRpm / session.fuelCutRpm),
        powertrain.fuelCut ? 'all' : redline,
        [{ pixel: redline, palette: TEXT_PALETTES.RED }],
      );
    },
  },
  {
    // Three signal lamps: red, one more each second of READY, then all green for a second after GO.
    middle: true,
    when: ({ race }) =>
      beforeGo(race) || (race.outcome.status === 'RUNNING' && race.clock.elapsedSeconds < HUD_DURATIONS.go),
    write({ race }, text) {
      const go = !beforeGo(race),
        lit = race.countdown.signalLamps;
      (['lamp1', 'lamp2', 'lamp3'] as const).forEach((place, i) => {
        const on = go || i < lit;
        writeLamp(text, place, on, on ? (go ? TEXT_PALETTES.GREEN : TEXT_PALETTES.RED) : TEXT_PALETTES.BAR);
      });
    },
  },
  {
    middle: true,
    when: ({ race }) => beforeGo(race),
    write({ session }, text) {
      write(text, 'courseName', session.courseName);
      write(text, 'mode', MODE_NAMES[session.mode]);
    },
  },
  {
    middle: true,
    when: ({ race, record }) => beforeGo(race) && record !== null,
    write: ({ record }, text) => write(text, 'record', `RECORD ${formatMilliseconds(record!.timeMs)}`),
  },
  {
    // The difference from the record run at the latest gate or lap crossing: green when faster, red otherwise.
    middle: true,
    when: ({ race, record }) => {
      const crossings = race.player.crossingSeconds,
        latest = crossings.length - 1,
        splits = record?.splitsMs;
      return (
        !!splits &&
        latest >= 0 &&
        latest < splits.length &&
        race.clock.elapsedSeconds - crossings[latest]! < HUD_DURATIONS.split
      );
    },
    write({ race, record }, text) {
      const crossings = race.player.crossingSeconds,
        latest = crossings.length - 1;
      const difference = raceMilliseconds(crossings[latest]!) - record!.splitsMs![latest]!;
      write(text, 'split', formatTimeDifference(difference), difference < 0 ? TEXT_PALETTES.GREEN : TEXT_PALETTES.RED);
    },
  },
  {
    // The extension just awarded, in seconds and tenths.
    middle: true,
    when: ({ race }) => extended(race),
    write({ race }, text) {
      const tenths = Math.round(race.clock.lastExtension!.ms / 100);
      write(text, 'extend', `EXTEND +${Math.floor(tenths / 10)}"${tenths % 10}`, TEXT_PALETTES.YELLOW);
    },
  },
  {
    // From the ending until RESULT: GOAL, or GAME OVER and its cause.
    middle: true,
    when: ({ race }) => ended(race),
    write({ race: { outcome } }, text) {
      const goal = outcome.status === 'GOAL';
      write(text, 'outcome', goal ? 'GOAL' : 'GAME OVER', goal ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.RED);
      if (!goal) write(text, 'cause', CAUSE_NAMES[outcome.cause!]);
    },
  },
];

/** Write every HUD element whose condition holds; with `menu`, the middle rows' notices are left out. */
export function writeHud(facts: HudFacts, text: TextLayer, menu: boolean): void {
  for (const element of HUD_ELEMENTS) if (!(menu && element.middle) && element.when(facts)) element.write(facts, text);
}
