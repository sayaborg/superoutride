import { HUD_TILES, TEXT_PALETTES } from '../image/text-tiles.js';
import type { createCourseRace } from '../race/course-race.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { TEXT_COLUMNS, type TextLayer } from '../view/text-layer.js';
import { formatRaceTime } from './race-status-hud.js';

type CourseRace = ReturnType<typeof createCourseRace>;

/** What the HUD reads in one frame: the race's facts, the player's observation and the Session's course and mode. */
export interface HudFacts {
  readonly race: CourseRace;
  readonly player: CompetitorObservation;
  readonly session: { readonly courseName: string; readonly mode: string };
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
});
const MODE_NAMES: Readonly<Record<string, string>> = {
  ARCADE: 'ARCADE',
  FREE_PLAY: 'FREE PLAY',
  TIME_TRIAL: 'TIME TRIAL',
};
const CAUSE_NAMES: Readonly<Record<string, string>> = { TIME: 'TIME UP', RANK: 'RANK OUT' };

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
  courseName: ['center', 10],
  mode: ['center', 11],
  lamp1: [15, 13],
  lamp2: [19, 13],
  lamp3: [23, 13],
  outcome: ['center', 16],
  cause: ['center', 17],
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
const extended = ({ clock }: CourseRace) => {
  const extension = clock.lastExtension;
  return (
    extension !== null && extension.ms > 0 && clock.elapsedSeconds <= extension.atSeconds + HUD_DURATIONS.extension
  );
};
const beforeGo = ({ outcome }: CourseRace) => outcome.status === 'WAITING' || outcome.status === 'READY';
const ended = ({ outcome }: CourseRace) => outcome.status === 'GOAL' || outcome.status === 'GAME_OVER';

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
    when: ({ race }) => race.standing.count > 1,
    write({ race: { standing } }, text) {
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
      const { player, clock, lapCount } = race;
      write(text, 'lapLabel', `LAP ${Math.min(lapCount, player.progress.acceptedFinishCount + 1)}/${lapCount}`);
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
    when: ({ race }) => race.nextRankLimit !== null,
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
      write(text, 'mode', MODE_NAMES[session.mode]!);
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
      if (!goal) write(text, 'cause', CAUSE_NAMES[outcome.cause!]!);
    },
  },
];

/** Write every HUD element whose condition holds; with `menu`, the middle rows' notices are left out. */
export function writeHud(facts: HudFacts, text: TextLayer, menu: boolean): void {
  for (const element of HUD_ELEMENTS) if (!(menu && element.middle) && element.when(facts)) element.write(facts, text);
}
