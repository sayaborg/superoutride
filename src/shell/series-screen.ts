import { ARROW_TILES, HUD_TILES, TEXT_PALETTES } from '../image/text-tiles.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { CompiledSeries } from '../content/series-catalog.js';
import { TEXT_COLUMNS, type TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { MenuCommand } from '../input/menu-input.js';
import type { MenuResponse, Screen } from './screen-host.js';
import { writeCentred } from './menu.js';

/** Fixed steps a slide takes from one series image to the next. */
export const SERIES_SLIDE_STEPS = 16;
/** The road arrows' top row and the PRESS START row. */
const ARROW_ROW = 13;
const PRESS_START_ROW = 27;

/**
 * SELECT SERIES: the series image fills the frame, the road arrow stands at either side and PRESS START (CONFIRM)
 * below. LEFT and RIGHT (and UP and DOWN) slide the next image in horizontally over `SERIES_SLIDE_STEPS` fixed steps
 * in whole pixels, the arrows and text staying put, wrapping at both ends; commands during a slide do nothing. A series
 * that offers nothing shows its image at half brightness and denies CONFIRM. `slide` hears each slide's new series.
 */
export function createSeriesScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  series: readonly CompiledSeries[],
  initial: number,
  actions: {
    offers(series: CompiledSeries): boolean;
    slide(series: CompiledSeries): void;
    confirm(series: CompiledSeries): void;
    back(): void;
  },
): Screen {
  let index = Math.max(0, Math.min(series.length - 1, initial)),
    // The slide under way: the series it leaves, its direction (+1 brings the next image in from the right) and steps.
    slide: { from: number; direction: 1 | -1; steps: number } | null = null;
  const drawImage = (at: number, x: number) => {
    const shown = series[at]!;
    shown.image.draw(frame, x, 0);
    if (actions.offers(shown)) return;
    const left = Math.max(0, x),
      right = Math.min(frame.width, x + shown.image.width);
    for (let y = 0; y < frame.height; y++)
      for (let i = y * frame.width + left; i < y * frame.width + right; i++)
        frame.pixels[i] = halveRgb555(frame.pixels[i]!);
  };
  const arrow = (column: number, side: 'LEFT' | 'RIGHT') => {
    for (let k = 0; k < ARROW_TILES * ARROW_TILES; k++)
      text.put(
        column + (k % ARROW_TILES),
        ARROW_ROW + Math.floor(k / ARROW_TILES),
        HUD_TILES[`ARROW_${side}_${k}`]!,
        TEXT_PALETTES.YELLOW,
      );
  };
  return {
    live: false,
    // The series shown, or slid to.
    get wallpaper() {
      return series[index]!.image;
    },
    tick() {
      if (slide && ++slide.steps === SERIES_SLIDE_STEPS) slide = null;
    },
    command(command: MenuCommand): MenuResponse | null {
      if (slide) return null;
      const step = ({ LEFT: -1, UP: -1, RIGHT: 1, DOWN: 1 } as const)[command as 'LEFT'];
      if (step !== undefined) {
        if (series.length < 2) return null;
        slide = { from: index, direction: step, steps: 0 };
        index = (index + step + series.length) % series.length;
        actions.slide(series[index]!);
        return 'slide';
      }
      if (command === 'CONFIRM') {
        if (!actions.offers(series[index]!)) return 'deny';
        actions.confirm(series[index]!);
        return 'confirm';
      }
      if (command === 'BACK') {
        actions.back();
        return 'back';
      }
      return null;
    },
    render() {
      if (slide) {
        const offset = Math.round((frame.width * slide.steps) / SERIES_SLIDE_STEPS) * slide.direction;
        drawImage(slide.from, -offset);
        drawImage(index, slide.direction * frame.width - offset);
      } else drawImage(index, 0);
      text.clear();
      if (series.length > 1) {
        arrow(0, 'LEFT');
        arrow(TEXT_COLUMNS - ARROW_TILES, 'RIGHT');
      }
      writeCentred(text, PRESS_START_ROW, 'PRESS START', TEXT_PALETTES.YELLOW);
      text.draw(frame);
      present();
    },
  };
}
