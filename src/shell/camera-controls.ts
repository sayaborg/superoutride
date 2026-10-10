import type { CameraDefinition } from '../view/camera.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';

type CameraTuningKey = 'horizonRow' | 'heightFrequency' | 'yawSource' | 'yawLimit' | 'yawResponseSeconds';

/** DEV camera settings: each a choice of values for one camera definition field. */
const CAMERA_TUNING: readonly {
  readonly key: CameraTuningKey;
  readonly label: string;
  readonly unit: string;
  readonly choices: readonly (number | string)[];
  /** The displayed value per definition unit of a numeric choice; 1 when they agree. */
  readonly scale?: number;
}[] = [
  { key: 'horizonRow', label: 'Horizon row', unit: '', choices: [60, 70, 80, 90, 100, 110, 120] },
  { key: 'heightFrequency', label: 'Camera height frequency', unit: 'Hz', choices: [0.5, 1, 2, 3, 5, 10] },
  { key: 'yawSource', label: 'Camera yaw source', unit: '', choices: ['BODY', 'TRAVEL'] },
  {
    key: 'yawLimit',
    label: 'Camera yaw limit',
    unit: '°',
    choices: [15, 30, 45, 60, 90, 180].map((degrees) => (degrees * Math.PI) / 180),
    scale: 180 / Math.PI,
  },
  { key: 'yawResponseSeconds', label: 'Camera yaw response', unit: 's', choices: [0, 0.1, 0.25, 0.5, 1] },
];

/**
 * DEV adjustment of the camera definition; a change applies at once and is not persisted. The product definition
 * is each group's initial value.
 */
export function mountCameraControls(change: (definition: CameraDefinition) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  let definition: CameraDefinition = CAMERA_DEFINITION;
  const groups = CAMERA_TUNING.map(({ key, label, unit, choices, scale = 1 }) => {
    const group = document.createElement('fieldset');
    group.className = 'selector-group';
    const legend = document.createElement('legend');
    legend.textContent = label;
    const row = document.createElement('div');
    row.className = 'selector-buttons';
    group.append(legend, row);
    const buttons = choices.map((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      const shown = typeof value === 'number' ? Math.round(value * scale * 1000) / 1000 : value;
      button.textContent = unit ? `${shown} ${unit}` : String(shown);
      button.addEventListener('click', () => {
        definition = Object.freeze({ ...definition, [key]: value });
        show();
        change(definition);
      });
      row.append(button);
      return { value, button };
    });
    return { key, buttons, group };
  });
  const show = () => {
    for (const { key, buttons } of groups)
      for (const { value, button } of buttons) {
        const selected = definition[key] === value;
        button.className = selected ? 'selector-button active' : 'selector-button';
        button.setAttribute('aria-pressed', String(selected));
      }
  };
  show();
  const help = document.createElement('p');
  help.textContent = 'Camera settings change at once and are not saved; reload restores the camera definition.';
  groups.at(-1)!.group.append(help);
  for (const { group } of [...groups].reverse()) parent.prepend(group);
}
