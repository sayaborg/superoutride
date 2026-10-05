import { expandRgb555Pixels } from '../../src/image/rgb555.js';
import type { CourseQuery, QueryResponse } from './compile-protocol.js';

/**
 * The game's frame at the cursor, asked of the compile worker: the product scene and renderer at a station and
 * lateral with a catalog vehicle. The frame comes from the latest compile that succeeded; when that is older than the
 * document, or the document does not compile, the frame is marked stale.
 */
export function createGameView(
  canvas: HTMLCanvasElement,
  status: HTMLElement,
  ask: (query: CourseQuery) => Promise<QueryResponse>,
) {
  let wanted: Extract<CourseQuery, { kind: 'render' }> | null = null,
    current = 0;
  // Only the newest request is drawn; one in flight at a time, the latest wanted asked next.
  let asking = false,
    shown: number | null = null,
    text = '';

  const draw = async () => {
    if (asking || !wanted) return;
    asking = true;
    const query = wanted,
      ticket = current;
    const answer = await ask(query);
    asking = false;
    if (ticket !== current) return void draw();
    if (answer.kind === 'render') {
      const { width, height, pixels } = answer.frame;
      const rgba = new Uint32Array(pixels.length);
      expandRgb555Pixels(pixels, rgba);
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), width, height), 0, 0);
      shown = answer.generation;
      text = `${answer.frame.vehicle} at s ${answer.frame.s.toFixed(1)} m, l ${answer.frame.l.toFixed(1)} m · ${answer.milliseconds.toFixed(0)} ms`;
    } else if (answer.kind === 'failed') {
      shown = null;
      text = answer.message;
    }
    showStale();
  };
  let compiled: { step: number; current: boolean } = { step: -1, current: false };
  const showStale = () => {
    const stale = shown !== null && (!compiled.current || shown !== compiled.step);
    status.classList.toggle('stale', stale);
    status.textContent = `${stale ? 'Stale (an older compile): ' : ''}${text}`;
  };

  return {
    /** Ask for the frame at this position. */
    show(query: Extract<CourseQuery, { kind: 'render' }> | null) {
      if (JSON.stringify(query) === JSON.stringify(wanted)) return;
      wanted = query;
      current++;
      void draw();
    },
    /** The latest compile that succeeded, and whether it is the document as it stands; asks again when it moved. */
    compiled(step: number, isCurrent: boolean) {
      const moved = step !== compiled.step;
      compiled = { step, current: isCurrent };
      if (moved) {
        current++;
        void draw();
      } else showStale();
    },
  };
}
