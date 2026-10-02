import type { CameraDefinition } from '../view/camera.js';
import { CAMERA_DEFINITION } from '../view/camera-definition.js';

type CameraTuningKey = 'heightFrequency' | 'heightDampingRatio' | 'minimumClearance';

/** DEV camera settings: each a choice of values for one camera definition field. */
const CAMERA_TUNING: readonly {
  readonly key: CameraTuningKey;
  readonly label: string;
  readonly unit: string;
  readonly choices: readonly number[];
}[] = [
  { key: 'heightFrequency', label: 'Camera height frequency', unit: 'Hz', choices: [0.5, 1, 2, 3, 5, 10] },
  { key: 'heightDampingRatio', label: 'Camera height damping ratio', unit: '', choices: [0.5, 0.7, 1, 1.5, 2] },
  { key: 'minimumClearance', label: 'Camera minimum clearance', unit: 'm', choices: [0, 0.3, 0.6, 1] },
];

/**
 * DEV adjustment of the camera definition; a change applies at once and is not persisted. The product definition
 * is each group's initial value.
 */
export function mountCameraControls(change: (definition: CameraDefinition) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  let definition: CameraDefinition = CAMERA_DEFINITION;
  const groups = CAMERA_TUNING.map(({ key, label, unit, choices }) => {
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
      button.textContent = unit ? `${value} ${unit}` : String(value);
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
