import { STRIP_RENDER_METHODS, type StripRenderMethod } from '../view/display-settings.js';
import { DEFAULT_STRIP_RENDER_METHOD } from '../view/display-settings.js';

/** DEV is one adapter for the product display setting; changing it preserves the live scene. */
export function mountStripControls(initial: StripRenderMethod, change: (value: StripRenderMethod) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'Ground display';
  const row = document.createElement('div');
  row.className = 'selector-buttons';
  group.append(legend, row);
  const buttons = STRIP_RENDER_METHODS.map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = value === initial ? 'selector-button active' : 'selector-button';
    button.textContent = value;
    button.setAttribute('aria-pressed', String(value === initial));
    button.addEventListener('click', () => {
      change(value);
      for (let i = 0; i < buttons.length; i++) {
        const selected = STRIP_RENDER_METHODS[i] === value;
        buttons[i]!.setAttribute('aria-pressed', String(selected));
        buttons[i]!.classList.toggle('active', selected);
      }
    });
    row.append(button);
    return button;
  });
  const help = document.createElement('p');
  help.textContent = `Changes immediately, including while paused. Reload restores ${DEFAULT_STRIP_RENDER_METHOD}.`;
  group.append(help);
  parent.prepend(group);
}
