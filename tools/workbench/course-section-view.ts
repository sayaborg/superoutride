import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { CourseElement, ResolvedLine, SectionStructure } from '../authoring/course-structure.js';
import { stripColor } from './course-plan-view.js';

const MARGIN = { left: 12, right: 12, top: 16, bottom: 40 };
const ROW = 12;

/** A resolved line's lateral at `s`, read as the course reads a Boundary; null outside it. */
function lateralAt(line: ResolvedLine | undefined, s: number): number | null {
  if (!line?.length || s < line[0]!.s || s > line.at(-1)!.s) return null;
  return courseBoundaryAt({ id: '', vertices: line.map((vertex) => ({ at: { s: vertex.s }, l: vertex.l })) }, s);
}

/**
 * The cross section at the cursor's station, to look at: Boundaries with their names, lane centres,
 * the Strips covering the station in their order (later rows lie over earlier ones), each with its colour and material,
 * walls from their bottom to their top and objects near the station. A click on a Boundary selects it.
 */
export function createSectionView(canvas: HTMLCanvasElement, events: { pick(element: CourseElement | null): void }) {
  let section: SectionStructure | null = null,
    s = 0,
    selected: string | null = null;
  let boundaryX: { element: CourseElement; x: number }[] = [];

  const draw = () => {
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#0b0f14';
    c.fillRect(0, 0, canvas.width, canvas.height);
    boundaryX = [];
    if (!section) return;
    c.font = '11px system-ui, sans-serif';
    const of = (kind: CourseElement['kind']) => section!.elements.filter((e) => e.kind === kind);
    const boundaries = of('boundary').flatMap((element) => {
      const l = lateralAt(element.lines.line, s);
      return l === null ? [] : [{ element, l }];
    });
    const strips = of('strip').flatMap((element) => {
      const left = element.lines.left ? lateralAt(element.lines.left, s) : -Infinity,
        right = element.lines.right ? lateralAt(element.lines.right, s) : Infinity;
      const covers = (element.positions.start?.s ?? Infinity) <= s && s <= (element.positions.end?.s ?? -Infinity);
      return covers && left !== null && right !== null ? [{ element, left, right }] : [];
    });
    const finite = [...boundaries.map((b) => b.l), ...strips.flatMap((p) => [p.left, p.right]).filter(Number.isFinite)];
    const lo = Math.min(-10, ...finite) - 3,
      hi = Math.max(10, ...finite) + 3;
    const x = (l: number) =>
      MARGIN.left + ((Math.max(lo, Math.min(hi, l)) - lo) / (hi - lo)) * (canvas.width - MARGIN.left - MARGIN.right);
    // Walls rise from the road; heights are metres above it.
    const walls = of('wall').filter(
      (w) => (w.positions.start?.s ?? Infinity) <= s && s <= (w.positions.end?.s ?? -Infinity),
    );
    const knots = of('wall-strip-knot');
    const wallPieces = walls.flatMap((wall) => {
      const l = lateralAt(wall.lines.line, s);
      if (l === null) return [];
      return of('wall-strip')
        .filter((strip) => strip.pointer.startsWith(`${wall.pointer}/strips/`))
        .flatMap((strip) => {
          const own = knots.filter(
            (k) => k.pointer.startsWith(`${strip.pointer}/knots/`) && k.s !== null && sameCopy(k, strip),
          );
          const i = own.findIndex((k, j) => j > 0 && k.s! >= s && own[j - 1]!.s! <= s);
          if (i < 1) return [];
          const a = own[i - 1]!,
            b = own[i]!,
            t = (s - a.s!) / (b.s! - a.s! || 1);
          const at = (key: 'bottom' | 'top') =>
            Number(a.values[key]) + (Number(b.values[key]) - Number(a.values[key])) * t;
          return [{ l, bottom: at('bottom'), top: at('top'), color: strip.values.color }];
        });
    });
    const top = Math.max(2, ...wallPieces.map((p) => p.top)),
      bottom = Math.min(-0.5, ...wallPieces.map((p) => p.bottom));
    const ground =
      MARGIN.top + ((canvas.height - MARGIN.top - MARGIN.bottom - strips.length * ROW) * top) / (top - bottom);
    const yOf = (h: number) =>
      ground - (h / (top - bottom)) * (canvas.height - MARGIN.top - MARGIN.bottom - strips.length * ROW);
    // Strips in their order: each a row under the road line, later rows lower; its colour and material.
    strips.forEach(({ element, left, right }, i) => {
      const y = ground + 4 + i * ROW;
      const color = stripColor(element.values.color);
      c.fillStyle = color ?? '#2a333d';
      c.fillRect(x(left), y, x(right) - x(left), ROW - 2);
      if (element.values.material) {
        c.fillStyle = '#e8edf2';
        c.fillText(String(element.values.material), x(Math.max(left, lo)) + 2, y + ROW - 3);
      }
    });
    // Walls.
    for (const piece of wallPieces) {
      c.fillStyle = stripColor(piece.color) ?? '#d2a8ff';
      c.fillRect(x(piece.l) - 3, yOf(piece.top), 6, Math.max(1, yOf(piece.bottom) - yOf(piece.top)));
    }
    // The road line and the lane centres.
    c.strokeStyle = '#e8edf2';
    c.beginPath();
    c.moveTo(MARGIN.left, ground);
    c.lineTo(canvas.width - MARGIN.right, ground);
    c.stroke();
    c.fillStyle = '#e3b341';
    for (const lane of of('lane')) {
      const l = lateralAt(lane.lines.lane!, s);
      if (l !== null) c.fillRect(x(l) - 1, ground - 6, 2, 6);
    }
    // Objects within a metre of the station.
    for (const object of of('object'))
      if (object.s !== null && Math.abs(object.s - s) <= 1 && object.l !== null) {
        c.fillStyle = '#ffa657';
        c.fillRect(x(object.l) - 4, ground - 14, 8, 14);
      }
    // Boundaries, named; the selected one in white.
    boundaries.forEach(({ element, l }, i) => {
      const px = x(l);
      boundaryX.push({ element, x: px });
      c.strokeStyle = c.fillStyle = element.pointer === selected ? '#ffffff' : '#8e9aa6';
      c.beginPath();
      c.moveTo(px, MARGIN.top);
      c.lineTo(px, ground);
      c.stroke();
      c.fillText(String(element.values.id), px + 2, canvas.height - MARGIN.bottom + 12 + (i % 2) * 12);
    });
    c.fillStyle = '#ff7b72';
    c.fillText(`s ${s.toFixed(1)} m · l ${lo.toFixed(0)} … ${hi.toFixed(0)} m`, MARGIN.left, 12);
  };

  canvas.addEventListener('click', (event) => {
    const box = canvas.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * canvas.width;
    const near = boundaryX.reduce<{ element: CourseElement; x: number } | null>(
      (best, b) => (Math.abs(b.x - px) < 6 && (!best || Math.abs(b.x - px) < Math.abs(best.x - px)) ? b : best),
      null,
    );
    if (near) events.pick(near.element);
  });

  return {
    setSection(next: SectionStructure | null) {
      section = next;
      draw();
    },
    setCursor(next: number) {
      s = next;
      draw();
    },
    setSelection(pointer: string | null) {
      selected = pointer;
      draw();
    },
  };
}

/** Whether a knot is the same repetition as its Strip. */
function sameCopy(knot: CourseElement, strip: CourseElement): boolean {
  return JSON.stringify(knot.copies.map((c) => c.index)) === JSON.stringify(strip.copies.map((c) => c.index));
}
