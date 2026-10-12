import type { MenuDefinition, MenuItem } from './menu.js';
import { STEERING_UTILIZATIONS, VOLUME_NAMES, type PlayerRecord, type VolumeName } from './player-record.js';
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
/** The CONTROLS screen's text. */
const CONTROLS = Object.freeze([
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
  'ENTER OR Z CONFIRM  ESC OR X BACK',
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
 * SETTINGS: MASTER, MUSIC and EFFECTS volumes, which LEFT and RIGHT change in steps of five and the player record
 * keeps; CAR CAMERA and BIKE CAMERA, which LEFT and RIGHT switch between FACING and MOVING and the player record keeps;
 * CAR STEERING and BIKE STEERING (FRONT or CENTER) and CAR STEERING USE and BIKE STEERING USE (100%, 95% or 90%), which
 * LEFT and RIGHT switch and the player record keeps;
 * CONTROLS, a screen listing the controls; and CLEAR RECORDS, which asks once (NO first) before emptying the
 * records and keeps the settings. Each volume applies at once through `setVolume`. While the cursor is on MUSIC, the
 * latest track plays as an audition. BACK leaves.
 */
export function showSettings(
  player: PlayerRecord,
  devices: {
    menu(definition: MenuDefinition, initial?: number): void;
    setVolume(name: VolumeName, percent: number): void;
    /** Play the latest track as an audition; the returned function stops it. */
    audition(): () => void;
  },
  back: () => void,
) {
  // SETTINGS with the cursor on the item labelled `current` (the first item when null).
  const settings = (current: string | null = null) => {
    const items = (): readonly MenuItem[] => [
      ...VOLUME_NAMES.map((name): MenuItem => ({
        label: VOLUME_LABELS[name],
        value: String(player.settings.volumes[name]),
        adjust: (by) => {
          devices.setVolume(name, stepVolume(player.settings.volumes[name], by));
        },
        ...(name === 'music' ? { focus: devices.audition } : {}),
      })),
      ...(['car', 'bike'] as const).map((form): MenuItem => ({
        label: CAMERA_LABELS[form],
        value: player.settings.cameras[form],
        adjust: () => {
          const cameras = player.settings.cameras;
          player.updateSettings({ cameras: { ...cameras, [form]: cameras[form] === 'FACING' ? 'MOVING' : 'FACING' } });
        },
      })),
      ...(['car', 'bike'] as const).flatMap((form): MenuItem[] => {
        const rule = player.settings.steering[form];
        const set = (change: Partial<SteeringRule>) =>
          player.updateSettings({ steering: { ...player.settings.steering, [form]: { ...rule, ...change } } });
        return [
          {
            label: STEERING_LABELS[form],
            value: rule.reference.toUpperCase(),
            adjust: (by) => set({ reference: stepChoice(STEERING_REFERENCES, rule.reference, by) }),
          },
          {
            label: STEERING_USE_LABELS[form],
            value: `${Math.round(rule.utilization * 100)}%`,
            adjust: (by) => set({ utilization: stepChoice(STEERING_UTILIZATIONS, rule.utilization, by) }),
          },
        ];
      }),
      { label: 'CONTROLS', confirm: controls },
      { label: 'CLEAR RECORDS', confirm: clearRecords },
    ];
    devices.menu(
      { title: 'SETTINGS', layout: 'list', items, back },
      Math.max(
        0,
        items().findIndex((item) => item.label === current),
      ),
    );
  };
  const controls = () =>
    devices.menu({ title: 'CONTROLS', lines: CONTROLS, items: () => [], back: () => settings('CONTROLS') });
  const clearRecords = () => {
    const back = () => settings('CLEAR RECORDS');
    const items: readonly MenuItem[] = [
      { label: 'NO', confirm: back },
      {
        label: 'YES',
        confirm: () => {
          player.updateRecords({ timeTrial: {}, arcade: {} });
          back();
        },
      },
    ];
    devices.menu({ title: 'CLEAR RECORDS?', items: () => items, back });
  };
  settings();
}
