import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { TextLayer } from '../view/text-layer.js';
import type { MenuCommand } from '../input/menu-input.js';
import type { MenuResponse, Screen } from './screen-host.js';
import { createMenu, SCREEN_BACKGROUND, writeCentred, writeChoice, type MenuItem } from './menu.js';
import { halveTextRows } from './picture-menu-screen.js';

/** The logo's top text row (y 16) and the PRESS START and mode row, with the band darkened behind the mode. */
const LOGO_Y = 16;
const LINE_ROW = 28;
const BAND: readonly [number, number] = [27, 29];
/** PRESS START blinks: shown this many fixed steps, then hidden as many as the second. */
const BLINK = Object.freeze({ on: 32, off: 16 });

/** What TITLE stands over: the attract demo draws its frame and its overlay lines, or nothing over black. */
export interface TitleBackground {
  /** Draw the background into the frame and write its text; false leaves the frame to TITLE's black. */
  draw(frame: SoftwareSurface, text: TextLayer): boolean;
  /** Advance one fixed step while TITLE is current. */
  tick(): void;
  /** TITLE is shown: start, or resume with the next class. */
  enter(): void;
  /** TITLE is left: stop. */
  leave(): void;
}

/** TITLE's state that outlives the screen: whether PRESS START was confirmed, which it is once for the page. */
export interface TitleState {
  pressed: boolean;
}

/**
 * TITLE: the logo centred at y 16 over its background. Before the first gesture PRESS START blinks on row 28; CONFIRM
 * there is the gesture (`start`, which sounds `press-start`) and replaces it with the mode line for the rest of the
 * page: the mode, YELLOW (DARK when it offers nothing), between WHITE `◀` and `▶` on row 28, rows 27–29 at half
 * brightness, LEFT and RIGHT changing it like a carousel. BACK does nothing on TITLE.
 */
export function createTitleScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  logo: TilePicture,
  background: TitleBackground,
  state: TitleState,
  modes: readonly MenuItem[],
  initial: number,
  actions: { press(): void },
): Screen {
  const menu = createMenu({ title: '', items: () => modes }, initial);
  let steps = 0;
  background.enter();
  return {
    live: false,
    tick() {
      steps++;
      background.tick();
    },
    command(command: MenuCommand): MenuResponse | null {
      if (state.pressed) return command === 'BACK' ? null : menu.command(command);
      if (command !== 'CONFIRM') return null;
      state.pressed = true;
      actions.press();
      return 'start';
    },
    leave() {
      menu.leave();
      background.leave();
    },
    render() {
      text.clear();
      if (!background.draw(frame, text)) frame.clear(SCREEN_BACKGROUND);
      logo.draw(frame, Math.floor((frame.width - logo.width) / 2), LOGO_Y);
      if (state.pressed) {
        halveTextRows(frame, ...BAND);
        const item = modes[menu.index];
        if (item) writeChoice(text, LINE_ROW, item.label, item.disabled ? TEXT_PALETTES.DARK : TEXT_PALETTES.YELLOW);
      } else if (steps % (BLINK.on + BLINK.off) < BLINK.on)
        writeCentred(text, LINE_ROW, 'PRESS START', TEXT_PALETTES.YELLOW);
      text.draw(frame);
      present();
    },
  };
}
