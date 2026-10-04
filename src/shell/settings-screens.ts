import type { MenuDefinition, MenuItem } from './menu.js';
import { VOLUME_NAMES, type PlayerRecord, type VolumeName } from './player-record.js';

/** SETTINGS changes each volume by this many percent. */
const VOLUME_STEP = 5;
const VOLUME_LABELS: Readonly<Record<VolumeName, string>> = { master: 'MASTER', music: 'MUSIC', effects: 'EFFECTS' };
/** The CONTROLS screen's text. */
const CONTROLS = Object.freeze([
  'KEYBOARD',
  'LEFT/RIGHT STEER  UP OR X ACCELERATE',
  'DOWN OR Z BRAKE  ESC PAUSE',
  '',
  'TOUCH',
  'LEFT HALF: SLIDE TO STEER',
  'RIGHT HALF: SLIDE UP GAS, DOWN BRAKE',
  'II PAUSE',
  '',
  'GAMEPAD',
  'STICK OR D-PAD STEER  RT OR A GAS',
  'LT OR B BRAKE  START PAUSE',
]);

/** The next volume a step reaches: the adjacent multiple of the step, within 0–100. */
function stepVolume(value: number, by: -1 | 1): number {
  const next =
    by > 0 ? Math.floor(value / VOLUME_STEP + 1) * VOLUME_STEP : Math.ceil(value / VOLUME_STEP - 1) * VOLUME_STEP;
  return Math.min(100, Math.max(0, next));
}

/**
 * SETTINGS: MASTER, MUSIC and EFFECTS volumes, which LEFT and RIGHT change in steps of five and the player record
 * keeps; CONTROLS, a screen listing the controls; and CLEAR RECORDS, which asks once (NO first) before emptying the
 * records and keeps the settings. MASTER applies at once through `setMasterVolume`. BACK leaves.
 */
export function showSettings(
  player: PlayerRecord,
  devices: { menu(definition: MenuDefinition, initial?: number): void; setMasterVolume(percent: number): void },
  back: () => void,
) {
  // SETTINGS with the cursor on the item labelled `current` (the first item when null).
  const settings = (current: string | null = null) => {
    const items = (): readonly MenuItem[] => [
      ...VOLUME_NAMES.map((name): MenuItem => ({
        label: VOLUME_LABELS[name],
        value: String(player.settings.volumes[name]),
        adjust: (by) => {
          const value = stepVolume(player.settings.volumes[name], by);
          if (name === 'master') devices.setMasterVolume(value);
          else player.updateSettings({ volumes: { ...player.settings.volumes, [name]: value } });
        },
      })),
      { label: 'CONTROLS', confirm: controls },
      { label: 'CLEAR RECORDS', confirm: clearRecords },
    ];
    devices.menu(
      { title: 'SETTINGS', items, back },
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
