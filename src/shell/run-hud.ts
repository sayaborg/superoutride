import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { createCourseRace } from '../race/course-race.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { TextLayer } from '../view/text-layer.js';
import { formatRaceTime } from './race-status-hud.js';

type CourseRace = ReturnType<typeof createCourseRace>;

/** What the HUD reads in one frame: the race's facts and the player's observation. */
export interface HudFacts {
  readonly race: CourseRace;
  readonly player: CompetitorObservation;
}

/** Seconds a passing display lasts, in the time base its fact is stamped in. */
export const HUD_DURATIONS = Object.freeze({
  /** TIME stays yellow after an extension (race time). */
  extension: 2,
  /** A finished lap's time holds in yellow (race time). */
  lapHold: 2,
  /** The gear stays yellow after a shift (simulation time). */
  shift: 0.3,
});

/**
 * Where every HUD element sits in the 40×30 text grid, as [column, row]; a value written right-aligned ends at its
 * column. Moving an element is a change of these numbers only.
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
} as const satisfies Record<string, readonly [number, number]>);

type Place = keyof typeof HUD_LAYOUT;
const write = (text: TextLayer, place: Place, line: string, palette: number = TEXT_PALETTES.WHITE) =>
  text.write(HUD_LAYOUT[place][0], HUD_LAYOUT[place][1], line, palette);
/** Right-aligned: the line's last character at the place's column. */
const writeRight = (text: TextLayer, place: Place, line: string, palette: number = TEXT_PALETTES.WHITE) =>
  text.write(HUD_LAYOUT[place][0] - line.length + 1, HUD_LAYOUT[place][1], line, palette);

/** One HUD element: when it shows, decided from Session rules and race facts, and what it writes. */
interface HudElement {
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
    write({ race: { clock } }, text) {
      const remaining = Math.max(0, clock.deadlineSeconds! - clock.elapsedSeconds);
      const extension = clock.lastExtension;
      const extended =
        extension !== null && extension.ms > 0 && clock.elapsedSeconds <= extension.atSeconds + HUD_DURATIONS.extension;
      write(text, 'timeLabel', 'TIME');
      writeRight(
        text,
        'timeValue',
        String(Math.ceil(remaining)),
        extended ? TEXT_PALETTES.YELLOW : remaining < 10 ? TEXT_PALETTES.RED : TEXT_PALETTES.WHITE,
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
];

/** Write every HUD element whose condition holds. */
export function writeHud(facts: HudFacts, text: TextLayer): void {
  for (const element of HUD_ELEMENTS) if (element.when(facts)) element.write(facts, text);
}
