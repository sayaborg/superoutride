import { BAND_FILTERS, type renderDriving } from '../render/renderer.js';

type Filter = NonNullable<Parameters<typeof renderDriving>[2]['bandFilter']>;
/** Live selection changes only the renderer. The current scene/camera/Session and decoded profiles are retained. */
export function mountBandControls(initial: Filter, change: (value: Filter) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'Band lateral filter';
  group.append(legend);
  const choices = BAND_FILTERS;
  const buttons = choices.map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.textContent = value;
    button.setAttribute('aria-pressed', String(value === initial));
    button.addEventListener('click', () => {
      for (let i = 0; i < buttons.length; i++) buttons[i]!.setAttribute('aria-pressed', String(choices[i] === value));
      change(value);
    });
    group.append(button);
    return button;
  });
  const help = document.createElement('p');
  help.textContent = 'Pause the run to compare the same frame. Filters also update while paused.';
  group.append(help);
  parent.prepend(group);
}
