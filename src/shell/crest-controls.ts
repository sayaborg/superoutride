import type { CurvatureBounds } from '../course/geometry/profile-bound.js';
import { CREST_CHOICES, DIP_CHOICES, crestBounds } from '../race/crest-bounds.js';

/**
 * DEV selection of the crests' and dips' bounds the originals' courses' profiles are laid within as they load (none at
 * first: the
 * courses as saved); a choice applies from the next course loaded and is not persisted.
 */
export function mountCrestControls(change: (bounds: CurvatureBounds | null) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  let [a, b] = [null as number | null, null as number | null];
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'CRESTS and DIPS';
  group.append(legend);
  const row = (label: string, choices: readonly (number | null)[], set: (value: number | null) => void) => {
    const buttons = document.createElement('div');
    buttons.className = 'selector-buttons';
    const name = document.createElement('span');
    name.textContent = label;
    buttons.append(name);
    const all = choices.map((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = value === null ? 'selector-button active' : 'selector-button';
      button.textContent = value === null ? 'NONE' : `${value} g`;
      button.setAttribute('aria-pressed', String(value === null));
      button.addEventListener('click', () => {
        set(value);
        change(crestBounds(a, b));
        for (let i = 0; i < all.length; i++) {
          const selected = choices[i] === value;
          all[i]!.setAttribute('aria-pressed', String(selected));
          all[i]!.classList.toggle('active', selected);
        }
      });
      buttons.append(button);
      return button;
    });
    group.append(buttons);
  };
  row('CREST', CREST_CHOICES, (value) => (a = value));
  row('DIP', DIP_CHOICES, (value) => (b = value));
  const help = document.createElement('p');
  help.textContent =
    'At 200 km/h a crest lifts the car by at most a g, a dip presses it by at most b g. From the next course loaded; reload restores NONE.';
  group.append(help);
  parent.prepend(group);
}
