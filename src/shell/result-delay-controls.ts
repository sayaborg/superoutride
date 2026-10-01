/** Seconds from GOAL or GAME OVER to RESULT, while the field keeps driving; a DEV setting. */
export const DEFAULT_RESULT_DELAY_SECONDS = 3;
const RESULT_DELAY_CHOICES = [0, 1, 2, 3, 5, 10] as const;

/** DEV selection of the RESULT delay; it applies at once and is not persisted. */
export function mountResultDelayControls(initial: number, change: (seconds: number) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'RESULT delay';
  const row = document.createElement('div');
  row.className = 'selector-buttons';
  group.append(legend, row);
  const buttons = RESULT_DELAY_CHOICES.map((seconds) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = seconds === initial ? 'selector-button active' : 'selector-button';
    button.textContent = `${seconds} s`;
    button.setAttribute('aria-pressed', String(seconds === initial));
    button.addEventListener('click', () => {
      change(seconds);
      for (let i = 0; i < buttons.length; i++) {
        const selected = RESULT_DELAY_CHOICES[i] === seconds;
        buttons[i]!.setAttribute('aria-pressed', String(selected));
        buttons[i]!.classList.toggle('active', selected);
      }
    });
    row.append(button);
    return button;
  });
  const help = document.createElement('p');
  help.textContent = `Seconds from GOAL or GAME OVER to RESULT. Reload restores ${DEFAULT_RESULT_DELAY_SECONDS} s.`;
  group.append(help);
  parent.prepend(group);
}
