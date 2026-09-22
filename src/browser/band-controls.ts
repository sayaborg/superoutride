import { BAND_FILTERS, BAND_S_MODES, type renderDriving } from '../render/renderer.js';

type Filter = NonNullable<Parameters<typeof renderDriving>[2]['bandFilter']>;
type SMode = NonNullable<Parameters<typeof renderDriving>[2]['bandSMode']>;

function selector<T extends string>(label: string, choices: readonly T[], initial: T, change: (value: T) => void) {
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
    button.className = value === initial ? 'selector-button active' : 'selector-button';
    button.textContent = value;
    button.setAttribute('aria-pressed', String(value === initial));
    button.addEventListener('click', () => {
      for (let i = 0; i < buttons.length; i++) {
        const selected = choices[i] === value;
        buttons[i]!.setAttribute('aria-pressed', String(selected));
        buttons[i]!.classList.toggle('active', selected);
      }
      change(value);
    });
    row.append(button);
    return button;
  });
  return group;
}

/** Independent live selectors retain the current scene, camera, Session and compiled profiles. */
export function mountBandControls(
  sMode: SMode,
  filter: Filter,
  changeS: (value: SMode) => void,
  changeL: (value: Filter) => void,
) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const longitudinal = selector('Band longitudinal (s)', BAND_S_MODES, sMode, changeS);
  const lateral = selector('Band lateral (l)', BAND_FILTERS, filter, changeL);
  const help = document.createElement('p');
  help.textContent = 'Both directions update immediately, including while paused. Reload restores EXACT / BOX.';
  lateral.append(help);
  parent.prepend(longitudinal, lateral);
}
