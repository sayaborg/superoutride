import type { CameraDefinition } from '../view/camera.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';
import { LOGICAL_WIDTH } from '../view/display-scale.js';

type CameraTuningKey =
  | 'focalLength'
  | 'baseDownPitch'
  | 'heightFrequency'
  | 'heightDampingRatio'
  | 'minimumClearance'
  | 'yawSource'
  | 'yawLimit'
  | 'yawResponseSeconds';

/** DEV camera settings: each a choice of values for one camera definition field. */
const CAMERA_TUNING: readonly {
  readonly key: CameraTuningKey;
  readonly label: string;
  readonly unit: string;
  readonly choices: readonly (number | string)[];
  /** The displayed value per definition unit of a numeric choice; 1 when they agree. */
  readonly scale?: number;
}[] = [
  // The field of view in focal length px, shown as a 35 mm equivalent (the frame's width being 36 mm). Each choice's
  // player depth (f / 40 px/m) is exact in binary, so the camera station and the player's depth subtract exactly.
  {
    key: 'focalLength',
    label: 'Camera field of view (35 mm equivalent)',
    unit: 'mm',
    choices: [200, 220, 240, 260, 280, 320, 400],
    scale: 36 / LOGICAL_WIDTH,
  },
  {
    key: 'baseDownPitch',
    label: 'Camera down pitch',
    unit: '°',
    choices: [12, 10, 8, 6, 4, 2, 0].map((degrees) => (degrees * Math.PI) / 180),
    scale: 180 / Math.PI,
  },
  { key: 'heightFrequency', label: 'Camera height frequency', unit: 'Hz', choices: [0.5, 1, 2, 3, 5, 10] },
  { key: 'heightDampingRatio', label: 'Camera height damping ratio', unit: '', choices: [0.5, 0.7, 1, 1.5, 2] },
  { key: 'minimumClearance', label: 'Camera minimum clearance', unit: 'm', choices: [0, 0.3, 0.6, 1] },
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
