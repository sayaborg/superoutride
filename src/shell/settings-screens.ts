import type { Card } from './card-rows.js';
import type { CardStyle } from './card-styles.js';
import {
  NO_RECORDS,
  STEERING_UTILIZATIONS,
  VOLUME_NAMES,
  type PlayerRecord,
  type VolumeName,
} from './player-record.js';
import type { VehicleForm } from '../vehicle/definition-document.js';
import { STEERING_REFERENCES, type SteeringRule } from '../vehicle/steering-rule.js';

/** SETTINGS changes each volume by this many percent. */
const VOLUME_STEP = 5;
const VOLUME_LABELS: Readonly<Record<VolumeName, string>> = { master: 'MASTER', music: 'MUSIC', effects: 'EFFECTS' };
/** The camera setting of each vehicle form, by its label. */
const CAMERA_LABELS: Readonly<Record<VehicleForm, string>> = { car: 'CAR CAMERA', bike: 'BIKE CAMERA' };
/** The steering settings of each vehicle form, by their labels. */
const STEERING_LABELS: Readonly<Record<VehicleForm, string>> = { car: 'CAR STEERING', bike: 'BIKE STEERING' };
const STEERING_USE_LABELS: Readonly<Record<VehicleForm, string>> = {
  car: 'CAR STEERING USE',
  bike: 'BIKE STEERING USE',
};
/** The controls' text, which the CONTROLS card is to show once its contents are designed. */
export const CONTROLS_TEXT = Object.freeze([
  'KEYBOARD',
  'LEFT/RIGHT STEER  UP OR Z ACCELERATE',
  'DOWN OR X BRAKE  ESC PAUSE',
  '',
  'TOUCH',
  'LEFT HALF: SLIDE TO STEER',
  'RIGHT HALF: SLIDE UP GAS, DOWN BRAKE',
  'II PAUSE',
  '',
  'MENUS',
  'LEFT/RIGHT CHOOSE  UP/DOWN CHANGE',
  'Z OR ENTER CONFIRM  X OR ESC BACK',
  '',
  'GAMEPAD',
  'STICK OR D-PAD STEER  RT OR A GAS',
  'LT OR B BRAKE  START PAUSE',
]);

/** The choice `by` steps from `value` among `choices`, wrapping at either end. */
function stepChoice<T>(choices: readonly T[], value: T, by: -1 | 1): T {
  return choices[(choices.indexOf(value) + by + choices.length) % choices.length]!;
}

/** The next volume a step reaches: the adjacent multiple of the step, within 0–100. */
function stepVolume(value: number, by: -1 | 1): number {
  const next =
    by > 0 ? Math.floor(value / VOLUME_STEP + 1) * VOLUME_STEP : Math.ceil(value / VOLUME_STEP - 1) * VOLUME_STEP;
  return Math.min(100, Math.max(0, next));
}

/**
 * SETTINGS' cards, one a setting, each showing its value, which UP (the next, or more) and DOWN change and the player
 * record keeps: MASTER, MUSIC and EFFECTS volumes in steps of five, stopping at 0 and 100 and applied at once through
 * `setVolume`; CAR CAMERA and BIKE CAMERA (FACING or MOVING); CAR STEERING and BIKE STEERING (FRONT or CENTER); CAR
 * STEERING USE and BIKE STEERING USE (100%, 95% or 90%); SLOW DOWN (ON or OFF), the choices wrapping; CARD DESIGN, the
 * cards' style while their design is tried (K, 2026-11-12), which lasts for the page and no record keeps; then CONTROLS
 * and CLEAR RECORDS, whose CONFIRM opens their own rows. CONFIRM on a value does nothing. While the MUSIC card is in focus,
 * `audition` plays a track.
 */
export function settingCards(
  player: PlayerRecord,
  devices: {
    setVolume(name: VolumeName, percent: number): void;
    /** Play a track as an audition; the returned function stops it. */
    audition(): () => void;
  },
  open: { controls(): void; clearRecords(): void },
  cardStyle: { current(): CardStyle; step(by: -1 | 1): void },
): readonly Card[] {
  // A value card: its name, its value read as drawn, and what UP and DOWN set; whether the value changed.
  const value = (name: string, shown: () => string, set: (by: -1 | 1) => void, extra: Partial<Card> = {}): Card => ({
    name,
    line: shown,
    change: (by) => {
      const before = shown();
      set(by);
      return shown() !== before;
    },
    ...extra,
  });
  return Object.freeze([
    ...VOLUME_NAMES.map((name) =>
      value(
        VOLUME_LABELS[name],
        () => String(player.settings.volumes[name]),
        (by) => devices.setVolume(name, stepVolume(player.settings.volumes[name], by)),
        name === 'music' ? { focus: devices.audition } : {},
      ),
    ),
    ...(['car', 'bike'] as const).map((form) =>
      value(
        CAMERA_LABELS[form],
        () => player.settings.cameras[form],
        () => {
          const cameras = player.settings.cameras;
          player.updateSettings({ cameras: { ...cameras, [form]: cameras[form] === 'FACING' ? 'MOVING' : 'FACING' } });
        },
      ),
    ),
    ...(['car', 'bike'] as const).flatMap((form) => {
      const rule = () => player.settings.steering[form];
      const set = (change: Partial<SteeringRule>) =>
        player.updateSettings({ steering: { ...player.settings.steering, [form]: { ...rule(), ...change } } });
      return [
        value(
          STEERING_LABELS[form],
          () => rule().reference.toUpperCase(),
          (by) => set({ reference: stepChoice(STEERING_REFERENCES, rule().reference, by) }),
        ),
        value(
          STEERING_USE_LABELS[form],
          () => `${Math.round(rule().utilization * 100)}%`,
          (by) => set({ utilization: stepChoice(STEERING_UTILIZATIONS, rule().utilization, by) }),
        ),
      ];
    }),
    value(
      'SLOW DOWN',
      () => (player.settings.slowDown ? 'ON' : 'OFF'),
      () => player.updateSettings({ slowDown: !player.settings.slowDown }),
    ),
    value('CARD DESIGN', () => cardStyle.current().name, cardStyle.step),
    { name: 'CONTROLS', confirm: () => (open.controls(), 'confirm' as const) },
    { name: 'CLEAR RECORDS', confirm: () => (open.clearRecords(), 'confirm' as const) },
  ]);
}

/** CLEAR RECORDS?'s cards, NO first: YES empties the records and keeps the settings; either returns by `back`. */
export function clearRecordCards(player: PlayerRecord, back: () => void): readonly Card[] {
  const line = () => 'CLEAR RECORDS?';
  return Object.freeze([
    { name: 'NO', line, confirm: () => (back(), 'confirm' as const) },
    {
      name: 'YES',
      line,
      confirm: () => {
        player.updateRecords(NO_RECORDS);
        back();
        return 'confirm' as const;
      },
    },
  ]);
}
