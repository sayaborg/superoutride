import { CREST_TRIAL_KMH } from '../content/crest-trials.js';

/**
 * DEV selection of the crests rule's speed ([Original road data](../../docs/original-road-data.md#crests)) an original's
 * course is laid with as it loads, its trial's profiles (none at first: the courses as saved); a choice applies from
 * the next course loaded and is not persisted.
 */
export function mountCrestControls(change: (kmh: number | null) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'CREST SPEED';
  group.append(legend);
  const buttons = document.createElement('div');
  buttons.className = 'selector-buttons';
  const choices = [null, ...CREST_TRIAL_KMH];
  const all = choices.map((kmh) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = kmh === null ? 'selector-button active' : 'selector-button';
    button.textContent = kmh === null ? 'NONE' : `${kmh} km/h`;
    button.setAttribute('aria-pressed', String(kmh === null));
    button.addEventListener('click', () => {
      change(kmh);
      for (let i = 0; i < all.length; i++) {
        const selected = choices[i] === kmh;
        all[i]!.setAttribute('aria-pressed', String(selected));
        all[i]!.classList.toggle('active', selected);
      }
    });
    buttons.append(button);
    return button;
  });
  group.append(buttons);
  const help = document.createElement('p');
  help.textContent =
    "At this speed no crest of an original's road lifts the car. From the next course loaded; reload restores NONE.";
  group.append(help);
  parent.prepend(group);
}
