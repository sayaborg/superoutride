import type { MenuInputMode } from '../input/menu-input.js';

/**
 * The small screen-corner buttons: BACK top left in menus and PAUSE top right while driving. They appear once the
 * player has used touch; a press on them starts no driving or menu touch.
 */
export function createCornerButtons(documentRef: Document, press: (command: 'BACK' | 'PAUSE') => void) {
  const button = (command: 'BACK' | 'PAUSE', label: string) => {
    const element = documentRef.createElement('button');
    element.type = 'button';
    element.className = `corner-button corner-${command.toLowerCase()}`;
    element.textContent = label;
    element.setAttribute('aria-label', command);
    element.setAttribute('data-driving-input', 'ignore');
    element.hidden = true;
    element.addEventListener('click', () => press(command));
    documentRef.body.appendChild(element);
    return element;
  };
  const back = button('BACK', '◀'),
    pause = button('PAUSE', 'II');
  let touched = false,
    mode: MenuInputMode = 'off';
  const show = () => {
    back.hidden = !touched || mode !== 'menu';
    pause.hidden = !touched || mode !== 'driving';
  };
  return Object.freeze({
    /** Touch has been used: show the buttons from now on. */
    touched() {
      touched = true;
      show();
    },
    setMode(next: MenuInputMode) {
      mode = next;
      show();
    },
  });
}
