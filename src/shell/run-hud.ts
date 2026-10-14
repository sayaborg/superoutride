import {
  ARROW_TILES,
  DIGIT_TILES,
  HUD_PICTURE_TILES,
  HUD_TILES,
  hudPictureFrame,
  LAMP_TILES,
  ornatePalette,
  type OrnateStyle,
  type TextFont,
  TEXT_PALETTES,
  tireGaugePalette,
  type HudPicture,
} from '../image/text-tiles.js';
import { tachometerLitBars, tachometerTiles } from '../image/tachometer.js';
import { TIRE_GAUGE, tireGaugeStep } from '../image/tire-gauge.js';
import type { RaceFacts } from '../race/course-race.js';
import type { GameOverCause } from '../race/run-outcome.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { TEXT_COLUMNS, type TextLayer } from '../view/text-layer.js';
import { formatMilliseconds, formatRaceTime, formatTimeDifference } from './race-time.js';
import { shownStanding } from './run-result.js';
import type { RecordSplit } from './run-records.js';
import type { CameraState } from '../view/camera.js';
import { SIM_DT } from '../race/fixed-step.js';
import { SLOW_DOWN, type SlowDownStage } from '../race/slow-down.js';

/**
 * What the HUD reads in one frame: the race's facts, the player's observation, the camera's observation, the run's course, the name of its rules and the player vehicle's engine speeds, steering picture and tire knee from
 * its definitions, and the record the run compares against.
 */
export interface HudFacts {
  readonly race: RaceFacts;
  readonly player: CompetitorObservation;
  /** Whether the camera is held at its yaw limit, and on which side. */
  readonly camera: Pick<CameraState, 'heldAtLimit'>;
  readonly run: {
    readonly courseName: string;
    /** The name of the run's rules: its session, or FREE PLAY. */
    readonly rules: string;
    /** The tachometer's redline; its full scale is `TACHOMETER.fullScale` times it. */
    readonly redlineRpm: number;
    /** The picture of the player vehicle's steering wheel or top bridge, which its listing names. */
    readonly steeringPicture: HudPicture;
    /** The player vehicle's tire knee (`rhoKnee`), where the tire gauge is yellow. */
    readonly tireKnee: number;
    /** Whether the player's SETTINGS show SLOW DOWN. */
    readonly slowDown: boolean;
  };
  /**
   * The TIME ATTACK record READY shows, from the records before the run: its time and the display name of the vehicle it
   * was set with. Null without one.
   */
  readonly record: { readonly timeMs: number; readonly vehicle: string } | null;
  /** The difference from the record at the latest compared crossing (`createRunRecords`); null before one. */
  readonly split: RecordSplit | null;
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
/** The style of each SLOW DOWN stage that shows. */
const SLOW_DOWN_STYLES: Readonly<Record<Exclude<SlowDownStage, 0>, OrnateStyle>> = {
  1: 'YELLOW',
  2: 'ORANGE',
  3: 'RED',
};

/**
 * Where every HUD element sits in the 40×30 text grid, as [column, row]; a value written right-aligned ends at its
 * column, `'center'` centres a line on its row, and a lamp's, arrow's, digit's, picture's, meter's or the
 * tachometer's place is its top-left tile. Moving an element is a change of these numbers only.
 */
export const HUD_LAYOUT = Object.freeze({
  timeLabel: [1, 1],
  timeValue: [8, 1],
  elapsed: [11, 1],
  positionLabel: [21, 1],
  positionValue: [25, 1],
  stageLabel: [31, 1],
  stageValue: [38, 1],
  lapLabel: [1, 4],
  lapTime: [10, 4],
  bestLabel: [1, 5],
  bestTime: [10, 5],
  pass: [27, 4],
  target: [24, 5],
  extend: ['center', 7],
  split: ['center', 7],
  slowDown: ['center', 8],
  roadLeft: [0, 13],
  roadRight: [36, 13],
  courseName: ['center', 10],
  rules: ['center', 11],
  record: ['center', 12],
  lamp1: [15, 13],
  lamp2: [19, 13],
  lamp3: [23, 13],
  outcome: ['center', 16],
  cause: ['center', 18],
  speed: [1, 26],
  speedUnit: [7, 28],
  tires: [1, 22],
  steeringPicture: [17, 23],
  steeringBar: [17, 29],
  tachometer: [26, 26],
  gear: [37, 26],
  throttleBar: [26, 29],
  brakeBar: [33, 29],
} as const satisfies Record<string, readonly [number | 'center', number]>);

type Place = keyof typeof HUD_LAYOUT;
const columnOf = (place: Place, length: number) => {
  const column = HUD_LAYOUT[place][0];
  return column === 'center' ? Math.floor((TEXT_COLUMNS - length) / 2) : column;
};
/** A HUD line's font and palette. */
interface HudStyle {
  readonly font: TextFont;
  readonly palette: number;
}
const large = (style: OrnateStyle): HudStyle => ({ font: 'ornateLarge', palette: ornatePalette('ornateLarge', style) });
const small = (style: OrnateStyle): HudStyle => ({ font: 'ornateSmall', palette: ornatePalette('ornateSmall', style) });
const NORMAL: HudStyle = { font: 'normal', palette: TEXT_PALETTES.WHITE };
const write = (text: TextLayer, place: Place, line: string, { font, palette }: HudStyle = NORMAL) =>
  text.write(columnOf(place, line.length), HUD_LAYOUT[place][1], line, palette, font);
/** Right-aligned: the line's last character at the place's column. */
const writeRight = (text: TextLayer, place: Place, line: string, { font, palette }: HudStyle = NORMAL) =>
  text.write(columnOf(place, 1) - line.length + 1, HUD_LAYOUT[place][1], line, palette, font);
/** A 2×2 signal lamp, its palette giving its state. */
const writeLamp = (text: TextLayer, place: Place, palette: number) => {
  const column = columnOf(place, LAMP_TILES),
    row = HUD_LAYOUT[place][1];
  (['TL', 'TR', 'BL', 'BR'] as const).forEach((part, i) =>
    text.put(column + (i & 1), row + (i >> 1), HUD_TILES[`LAMP_${part}`]!, palette),
  );
};
/** A meter is 6 cells of 8 pixels. */
const METER_CELLS = 6;
const METER_PIXELS = METER_CELLS * 8;
const meterPixel = (fraction: number) => Math.min(METER_PIXELS, Math.max(0, Math.round(fraction * METER_PIXELS)));
const clampCell = (pixels: number, cell: number) => Math.min(8, Math.max(0, pixels - cell * 8));
/**
 * A meter from the left: its first `to` pixels filled, slot 1 before pixel `cut` and the cut part (slot 4, red) from
 * there, over the ground.
 */
const writeMeter = (text: TextLayer, place: Place, cut: number, to: number, palette: number) => {
  const column = columnOf(place, METER_CELLS),
    row = HUD_LAYOUT[place][1];
  for (let cell = 0; cell < METER_CELLS; cell++)
    text.put(
      column + cell,
      row,
      HUD_TILES[`METER_${clampCell(Math.min(cut, to), cell)}_${clampCell(to, cell)}`]!,
      palette,
    );
};
/** A meter from its centre: `pixels` of its half toward the side of `sign`, over the ground. */
const writeCentredMeter = (text: TextLayer, place: Place, sign: number, pixels: number, palette: number) => {
  const column = columnOf(place, METER_CELLS),
    row = HUD_LAYOUT[place][1],
    half = METER_CELLS / 2;
  for (let cell = 0; cell < half; cell++) {
    const right = sign > 0 ? clampCell(pixels, cell) : 0,
      left = sign < 0 ? clampCell(pixels, cell) : 0;
    text.put(column + half + cell, row, HUD_TILES[`METER_${right}_${right}`]!, palette);
    text.put(
      column + half - 1 - cell,
      row,
      HUD_TILES[left > 0 && left < 8 ? `METER_RIGHT_${left}` : `METER_${left}_${left}`]!,
      palette,
    );
  }
};
/** A 2×3-tile segment digit, or one with every segment unlit when `digit` is null. */
const writeDigit = (text: TextLayer, column: number, row: number, digit: number | null, palette: number) => {
  const tiles = DIGIT_TILES.columns * DIGIT_TILES.rows;
  for (let k = 0; k < tiles; k++)
    text.put(
      column + (k % DIGIT_TILES.columns),
      row + Math.floor(k / DIGIT_TILES.columns),
      HUD_TILES[`DIGIT_${digit ?? 'OFF'}_${k}`]!,
      palette,
    );
};
/** The speed's digits, right-aligned; the speed is held at 999 km/h. */
const SPEED_DIGITS = 3;
/** A tachometer tile's palette by its first and second colors. */
const TACHOMETER_PALETTES: Readonly<Record<string, number>> = Object.freeze({
  GREEN: TEXT_PALETTES.TACH_GREEN,
  YELLOW: TEXT_PALETTES.TACH_YELLOW,
  RED: TEXT_PALETTES.TACH_RED,
  GREEN_YELLOW: TEXT_PALETTES.TACH_GREEN_YELLOW,
  YELLOW_RED: TEXT_PALETTES.TACH_YELLOW_RED,
});
/** The road arrow, 4×4 tiles. */
const writeArrow = (text: TextLayer, place: Place, side: 'LEFT' | 'RIGHT') => {
  const [column, row] = HUD_LAYOUT[place] as readonly [number, number];
  for (let k = 0; k < ARROW_TILES * ARROW_TILES; k++)
    text.put(
      column + (k % ARROW_TILES),
      row + Math.floor(k / ARROW_TILES),
      HUD_TILES[`ARROW_${side}_${k}`]!,
      TEXT_PALETTES.ARROW,
    );
};

/**
 * The steering picture's ratio of the drawn wheel's angle to the front road wheel's, by form: a car's steering wheel,
 * a bike's top bridge.
 */
const STEERING_RATIOS = Object.freeze({ car: 18, bike: 1 });
/** A picture's frame for `angle` clockwise, in its own palette. */
const writePicture = (text: TextLayer, place: Place, picture: HudPicture, angle: number) => {
  const column = columnOf(place, HUD_PICTURE_TILES),
    row = HUD_LAYOUT[place][1],
    base = picture.first + hudPictureFrame(picture, angle) * HUD_PICTURE_TILES * HUD_PICTURE_TILES;
  for (let y = 0; y < HUD_PICTURE_TILES; y++)
    for (let x = 0; x < HUD_PICTURE_TILES; x++)
      text.put(column + x, row + y, base + y * HUD_PICTURE_TILES + x, picture.palette);
};

/** An axle's tires' palette: its utilization's step of the tire colors, or grey without load. */
const tirePalette = ({ load, utilization }: CompetitorObservation['tires']['front'], knee: number) =>
  load > 0 ? tireGaugePalette(tireGaugeStep(utilization, knee)) : TEXT_PALETTES.TIRES_AIR;

const extended = ({ clock }: RaceFacts) => {
  const extension = clock.lastExtension;
  return (
    extension !== null && extension.ms > 0 && clock.elapsedSeconds <= extension.atSeconds + HUD_DURATIONS.extension
  );
};
const beforeGo = ({ outcome }: RaceFacts) => outcome.status === 'WAITING' || outcome.status === 'READY';
const ended = ({ outcome }: RaceFacts) => outcome.status === 'GOAL' || outcome.status === 'GAME_OVER';

/**
 * One HUD element: when it shows, decided from run rules and race facts, and what it writes. A passing notice in
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
    // While the camera is held at its yaw limit, an arrow at the screen's edge on the side the road goes on: a body
    // turned right beyond the limit leaves the road to its left.
    middle: true,
    when: ({ camera }) => camera.heldAtLimit !== 0,
    write({ camera }, text) {
      if (camera.heldAtLimit > 0) writeArrow(text, 'roadLeft', 'LEFT');
      else writeArrow(text, 'roadRight', 'RIGHT');
    },
  },
  {
    // Seconds remaining, rounded up, in the ornate large font: WHITE, RED under ten seconds and SUNSET (the yellow) for
    // two seconds after an extension.
    when: ({ race }) => race.clock.deadlineSeconds !== null,
    write({ race }, text) {
      const { clock } = race;
      const remaining = Math.max(0, clock.deadlineSeconds! - clock.elapsedSeconds);
      write(text, 'timeLabel', 'TIME', large('WHITE'));
      writeRight(
        text,
        'timeValue',
        String(Math.ceil(remaining)),
        large(extended(race) ? 'SUNSET' : remaining < 10 ? 'RED' : 'WHITE'),
      );
    },
  },
  {
    // Race time.
    when: () => true,
    write: ({ race }, text) => write(text, 'elapsed', formatRaceTime(race.clock.elapsedSeconds), large('SUNSET')),
  },
  {
    when: ({ race }) => shownStanding(race) !== null,
    write({ race }, text) {
      const standing = shownStanding(race)!;
      write(text, 'positionLabel', 'POS', large('SUNSET'));
      write(text, 'positionValue', `${standing.rank}/${standing.count}`, large('SUNSET'));
    },
  },
  {
    when: ({ race }) => race.courseType !== 'CIRCUIT',
    write({ race }, text) {
      write(text, 'stageLabel', 'STAGE', large('SUNSET'));
      writeRight(text, 'stageValue', String(race.stage), large('SUNSET'));
    },
  },
  {
    // The lap and its time; a finished lap's time holds, in SUNSET (the yellow) as the lap's own time is.
    when: ({ race }) => race.courseType === 'CIRCUIT',
    write({ race }, text) {
      const { player, clock, lap, lapCount } = race;
      write(text, 'lapLabel', lapCount === null ? `LAP ${lap}` : `LAP ${lap}/${lapCount}`, small('SUNSET'));
      const lapStart = player.lapStartSeconds ?? 0;
      const held = player.lastLapSeconds !== null && clock.elapsedSeconds - lapStart < HUD_DURATIONS.lapHold;
      write(
        text,
        'lapTime',
        formatRaceTime(held ? player.lastLapSeconds! : clock.elapsedSeconds - lapStart),
        small('SUNSET'),
      );
    },
  },
  {
    when: ({ race }) => race.courseType === 'CIRCUIT',
    write({ race }, text) {
      write(text, 'bestLabel', 'BEST', small('WHITE'));
      const best = race.player.bestLapSeconds;
      write(text, 'bestTime', best === null ? `-'--"---` : formatRaceTime(best), small('WHITE'));
    },
  },
  {
    // Until the run ends: an ended run has no next gate to pass.
    when: ({ race }) => !ended(race) && race.nextRankLimit !== null,
    write: ({ race }, text) => write(text, 'pass', `PASS ${race.nextRankLimit}`, small('WHITE')),
  },
  {
    when: ({ race }) => (race.stageRivalGap ?? 0) > 0,
    write: ({ race }, text) => write(text, 'target', `TARGET ${Math.round(race.stageRivalGap!)}M`, small('WHITE')),
  },
  {
    // The speed in km/h, right-aligned segment digits; a missing leading digit is unlit.
    when: () => true,
    write({ player }, text) {
      const speed = String(Math.min(10 ** SPEED_DIGITS - 1, Math.round(player.speed * 3.6))),
        [column, row] = HUD_LAYOUT.speed;
      for (let i = 0; i < SPEED_DIGITS; i++) {
        const digit = speed[i - (SPEED_DIGITS - speed.length)];
        writeDigit(
          text,
          column + i * DIGIT_TILES.columns,
          row,
          digit === undefined ? null : Number(digit),
          TEXT_PALETTES.SEG_VFD,
        );
      }
      write(text, 'speedUnit', 'km/h');
    },
  },
  {
    // The gear, yellow briefly after a shift.
    when: () => true,
    write({ race, player: { powertrain } }, text) {
      const shifted =
        powertrain.shiftSeconds !== null && race.simulationSeconds - powertrain.shiftSeconds < HUD_DURATIONS.shift;
      const [column, row] = HUD_LAYOUT.gear;
      writeDigit(text, column, row, powertrain.gear % 10, shifted ? TEXT_PALETTES.SEG_YELLOW : TEXT_PALETTES.SEG_VFD);
    },
  },
  {
    // The front road wheel's actual angle, as the vehicle's steering picture turns with it.
    when: () => true,
    write({ player, run }, text) {
      writePicture(text, 'steeringPicture', run.steeringPicture, player.frontSteerAngle * STEERING_RATIOS[player.form]);
    },
  },
  {
    // The tire gauge in the vehicle's form, each axle's tires in its own palette; the middle row holds only lines,
    // which every palette draws alike.
    when: () => true,
    write({ player: { form, tires }, run }, text) {
      const [column, row] = HUD_LAYOUT.tires;
      const front = tirePalette(tires.front, run.tireKnee),
        rear = tirePalette(tires.rear, run.tireKnee);
      for (let k = 0; k < TIRE_GAUGE.columns * TIRE_GAUGE.rows; k++) {
        const tileRow = Math.floor(k / TIRE_GAUGE.columns);
        text.put(
          column + (k % TIRE_GAUGE.columns),
          row + tileRow,
          HUD_TILES[`TIRES_${form.toUpperCase()}_${k}`]!,
          tileRow < TIRE_GAUGE.rows - 1 ? front : rear,
        );
      }
    },
  },
  {
    // The steering actuator from the centre toward its side, white.
    when: () => true,
    write({ player: { control } }, text) {
      const half = METER_PIXELS / 2;
      writeCentredMeter(
        text,
        'steeringBar',
        Math.sign(control.steering),
        Math.min(half, Math.round(Math.abs(control.steering) * half)),
        TEXT_PALETTES.WHITE,
      );
    },
  },
  {
    // The throttle actuator, green, and in red its part beyond the effective opening the protections leave.
    when: () => true,
    write({ player: { control, powertrain } }, text) {
      const effective = Math.min(control.throttle, powertrain.effectiveOpening);
      writeMeter(text, 'throttleBar', meterPixel(effective), meterPixel(control.throttle), TEXT_PALETTES.GREEN);
    },
  },
  {
    // The brake actuator, yellow, and in red its part the protections take from the station they take most from.
    when: () => true,
    write({ player: { control } }, text) {
      const applied = control.brake * Math.min(control.frontBrakeApplied, control.rearBrakeApplied);
      writeMeter(text, 'brakeBar', meterPixel(applied), meterPixel(control.brake), TEXT_PALETTES.YELLOW);
    },
  },
  {
    // The tachometer to 110 % of redline: a bar is lit once the engine reaches its speed; green, yellow for the bars just
    // before the redline and red from it, and wholly red while the limiter cuts fuel.
    when: () => true,
    write({ player: { powertrain }, run }, text) {
      const [column, row] = HUD_LAYOUT.tachometer;
      const lit = tachometerLitBars(powertrain.engineRpm, run.redlineRpm);
      // A tile holds at most two colors, its pattern splitting its bars where they meet.
      for (const tile of tachometerTiles(lit, powertrain.fuelCut))
        text.put(
          column + tile.column,
          row + tile.row,
          HUD_TILES.TACH_0! + tile.pattern,
          TACHOMETER_PALETTES[tile.second ? `${tile.first}_${tile.second}` : tile.first]!,
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
        writeLamp(
          text,
          place,
          go ? TEXT_PALETTES.LAMP_GREEN : i < lit ? TEXT_PALETTES.LAMP_RED : TEXT_PALETTES.LAMP_OFF,
        );
      });
    },
  },
  {
    middle: true,
    when: ({ race }) => beforeGo(race),
    write({ run }, text) {
      write(text, 'courseName', run.courseName, small('WHITE'));
      write(text, 'rules', run.rules, small('WHITE'));
    },
  },
  {
    middle: true,
    when: ({ race, record }) => beforeGo(race) && record !== null,
    write: ({ record }, text) =>
      write(text, 'record', `RECORD ${formatMilliseconds(record!.timeMs)} ${record!.vehicle}`, small('WHITE')),
  },
  {
    // The difference from the record run at the latest compared crossing: green when faster, red otherwise.
    middle: true,
    when: ({ race, split }) => split !== null && race.clock.elapsedSeconds - split.atSeconds < HUD_DURATIONS.split,
    write({ split }, text) {
      const { differenceMs } = split!;
      write(text, 'split', formatTimeDifference(differenceMs), small(differenceMs < 0 ? 'GREEN' : 'RED'));
    },
  },
  {
    // The extension just awarded, in seconds and tenths.
    middle: true,
    when: ({ race }) => extended(race),
    write({ race }, text) {
      const tenths = Math.round(race.clock.lastExtension!.ms / 100);
      write(text, 'extend', `EXTEND +${Math.floor(tenths / 10)}"${tenths % 10}`, small('SUNSET'));
    },
  },
  {
    // SLOW DOWN while the race shows a stage and SETTINGS allow, in the stage's color; the red stage blinks by fixed
    // steps.
    middle: true,
    when: ({ race, run }) =>
      run.slowDown &&
      race.slowDown > 0 &&
      (race.slowDown < 3 || Math.floor(Math.round(race.simulationSeconds / SIM_DT) / SLOW_DOWN.blinkSteps) % 2 === 0),
    write: ({ race }, text) =>
      write(text, 'slowDown', 'SLOW DOWN', large(SLOW_DOWN_STYLES[race.slowDown as Exclude<SlowDownStage, 0>])),
  },
  {
    // From the ending until RESULT: GOAL, or GAME OVER and its cause.
    middle: true,
    when: ({ race }) => ended(race),
    write({ race: { outcome } }, text) {
      const goal = outcome.status === 'GOAL';
      write(text, 'outcome', goal ? 'GOAL' : 'GAME OVER', large(goal ? 'SUNSET' : 'RED'));
      if (!goal) write(text, 'cause', CAUSE_NAMES[outcome.cause!], large('RED'));
    },
  },
];

/** Write every HUD element whose condition holds; with `menu`, the middle rows' notices are left out. */
export function writeHud(facts: HudFacts, text: TextLayer, menu: boolean): void {
  for (const element of HUD_ELEMENTS) if (!(menu && element.middle) && element.when(facts)) element.write(facts, text);
}
