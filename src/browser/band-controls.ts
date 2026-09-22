import { BAND_RENDER_MODES, DEFAULT_BAND_RENDER_MODE, type BandRenderMode } from '../graphics/display-settings.js';

/** DEV is one adapter for the product display setting; changing it preserves the live scene. */
export function mountBandControls(initial: BandRenderMode, change: (value: BandRenderMode) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'Ground display';
  const row = document.createElement('div');
  row.className = 'selector-buttons';
  group.append(legend, row);
  const buttons = BAND_RENDER_MODES.map((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = value === initial ? 'selector-button active' : 'selector-button';
    button.textContent = value;
    button.setAttribute('aria-pressed', String(value === initial));
    button.addEventListener('click', () => {
      change(value);
      for (let i = 0; i < buttons.length; i++) {
        const selected = BAND_RENDER_MODES[i] === value;
        buttons[i]!.setAttribute('aria-pressed', String(selected));
        buttons[i]!.classList.toggle('active', selected);
      }
    });
    row.append(button);
    return button;
  });
  const help = document.createElement('p');
  help.textContent = `Changes immediately, including while paused. Reload restores ${DEFAULT_BAND_RENDER_MODE}.`;
  group.append(help);
  parent.prepend(group);
}
