import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import type { CourseElement, ResolvedLine, SectionPlan, SectionStructure } from '../authoring/course-structure.js';

/** Element layers an author shows or hides. */
export const PLAN_LAYERS = [
  'strips',
  'boundaries',
  'carriageways',
  'walls',
  'sprites',
  'objects',
  'gates',
  'environments',
  'pis',
] as const;
export type PlanLayer = (typeof PLAN_LAYERS)[number];

const LAYER_OF: Partial<Record<CourseElement['kind'], PlanLayer>> = {
  strip: 'strips',
  'strip-knot': 'strips',
  arrow: 'strips',
  text: 'strips',
  curb: 'strips',
  boundary: 'boundaries',
  'boundary-knot': 'boundaries',
  'boundary-vertex': 'boundaries',
  carriageway: 'carriageways',
  wall: 'walls',
  'wall-strip': 'walls',
  'wall-strip-knot': 'walls',
  'open-limit': 'walls',
  sprite: 'sprites',
  object: 'objects',
  gate: 'gates',
  'grid-slot': 'gates',
  environment: 'environments',
  pi: 'pis',
  'arc-end': 'pis',
};

/** Metres between plan samples along a line, enough for a curve's radius at plan scale. */
const SAMPLE_METERS = 2;
/** Screen pixels within which a click picks an element. */
const PICK_PIXELS = 8;

/** The colour of a Strip's RGB555 value, or null for transparent or unchanged colour. */
export function stripColor(value: unknown): string | null {
  if (typeof value !== 'number') return null;
  const { r, g, b } = unpackRgba(rgb555ToRgba(value));
  return `rgb(${r} ${g} ${b})`;
}

export interface PlanStyle {
  /** The colour an element is drawn in, or null for its own. */
  colorOf(element: CourseElement): string | null;
  /** Extra marks drawn over an element (a reference's line to its Boundary, a selection's PI). */
  marks(element: CourseElement, draw: PlanDraw): void;
}

/** What a style draws with: plan points, lines in metres and screen pixels. */
export interface PlanDraw {
  readonly context: CanvasRenderingContext2D;
  readonly pixel: number;
  world(s: number, l: number): { x: number; z: number };
}

/**
 * The plan of one Section: its Strips filled in their colours, Boundaries, Carriageway lane centres, walls, open
 * limits, the centreline with its entry and exit cut lines, environments, gates and grid, sprites and objects, PIs and
 * the arc ends they derive, the cursor and the selection; north (+z) up, x right, with a scale bar. The wheel zooms at
 * the pointer, a drag pans, and a click picks the nearest element or, away from any, moves the cursor.
 */
export function createPlanView(
  canvas: HTMLCanvasElement,
  events: { pick(element: CourseElement | null): void; cursor(s: number): void },
) {
  let section: SectionStructure | null = null,
    plan: SectionPlan | null = null;
  let cursor = 0,
    selected: string | null = null,
    highlighted = new Set<string>();
  let layers = new Set<PlanLayer>(PLAN_LAYERS);
  let style: PlanStyle = { colorOf: () => null, marks: () => {} };
  let problems = new Set<string>();
  // The view: plan point at the canvas centre and pixels per metre.
  let centre = { x: 0, z: 0 },
    scale = 1;
  // Plan polylines of the open Section, in metres, built once per Section.
  let paths: { element: CourseElement; path: Path2D; fill: boolean; dashed?: boolean }[] = [];
  let centreline = new Path2D();

  const world = (s: number, l: number) => plan!.toWorld(s, l);
  const line = (points: ResolvedLine) => {
    const path = new Path2D();
    densify(points).forEach(({ s, l }, i) => {
      const p = world(s, l);
      if (i) path.lineTo(p.x, p.z);
      else path.moveTo(p.x, p.z);
    });
    return path;
  };
  const band = (left: ResolvedLine, right: ResolvedLine) => {
    const path = new Path2D();
    const a = densify(left),
      b = densify(right).reverse();
    [...a, ...b].forEach(({ s, l }, i) => {
      const p = world(s, l);
      if (i) path.lineTo(p.x, p.z);
      else path.moveTo(p.x, p.z);
    });
    path.closePath();
    return path;
  };
  const build = () => {
    paths = [];
    centreline = new Path2D();
    if (!section || !plan) return;
    for (let s = 0; s <= plan.length; s += Math.min(SAMPLE_METERS, plan.length - s || SAMPLE_METERS)) {
      const p = world(s, 0);
      if (s) centreline.lineTo(p.x, p.z);
      else centreline.moveTo(p.x, p.z);
      if (s === plan.length) break;
    }
    for (const element of section.elements) {
      const { left, right, line: own } = element.lines;
      if (left && right) paths.push({ element, path: band(left, right), fill: true });
      else if (left || right) paths.push({ element, path: line((left ?? right)!), fill: false });
      if (own) paths.push({ element, path: line(own), fill: false });
      // A Carriageway's lane centres.
      for (const [key, lane] of Object.entries(element.lines))
        if (key.startsWith('lane')) paths.push({ element, path: line(lane), fill: false, dashed: true });
    }
  };
  const fit = () => {
    if (!section) return;
    const points = section.elements.filter((e) => e.x !== null && e.z !== null);
    if (!points.length) return;
    const xs = points.map((e) => e.x!),
      zs = points.map((e) => e.z!);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    centre = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    scale = Math.min(canvas.width / Math.max(1, x1 - x0 + 40), canvas.height / Math.max(1, z1 - z0 + 40));
  };
  const toScreen = (x: number, z: number) => ({
    x: canvas.width / 2 + (x - centre.x) * scale,
    y: canvas.height / 2 - (z - centre.z) * scale,
  });
  const toPlan = (px: number, py: number) => ({
    x: centre.x + (px - canvas.width / 2) / scale,
    z: centre.z - (py - canvas.height / 2) / scale,
  });
  const shown = (element: CourseElement) => {
    const layer = LAYER_OF[element.kind];
    return !layer || layers.has(layer);
  };

  const draw = () => {
    const context = canvas.getContext('2d')!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0f14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!section || !plan) return;
    context.setTransform(
      scale,
      0,
      0,
      -scale,
      canvas.width / 2 - centre.x * scale,
      canvas.height / 2 + centre.z * scale,
    );
    const pixel = 1 / scale;
    const drawn: PlanDraw = { context, pixel, world };
    for (const { element, path, fill, dashed } of paths) {
      if (!shown(element)) continue;
      const own = style.colorOf(element);
      if (fill) {
        const color = own ?? stripColor(element.values.color);
        if (color) {
          context.globalAlpha = own ? 0.45 : 0.85;
          context.fillStyle = color;
          context.fill(path);
          context.globalAlpha = 1;
        } else {
          context.setLineDash([4 * pixel, 4 * pixel]);
          context.strokeStyle = '#5a6672';
          context.lineWidth = pixel;
          context.stroke(path);
          context.setLineDash([]);
        }
      } else {
        context.strokeStyle = own ?? (element.kind === 'wall' ? '#d2a8ff' : dashed ? '#e3b341' : '#8e9aa6');
        context.lineWidth = (element.kind === 'wall' ? 3 : 1.2) * pixel;
        if (dashed) context.setLineDash([3 * pixel, 5 * pixel]);
        context.stroke(path);
        context.setLineDash([]);
      }
    }
    context.strokeStyle = '#e8edf2';
    context.lineWidth = pixel;
    context.setLineDash([6 * pixel, 4 * pixel]);
    context.stroke(centreline);
    context.setLineDash([]);
    // The entry and exit cut lines across the Section's ends.
    for (const s of [0, plan.length]) crossLine(drawn, s, 30, '#ffd33d');
    for (const element of section.elements) {
      if (!shown(element) || element.x === null || element.z === null) continue;
      const color = style.colorOf(element);
      if (element.kind === 'gate' || element.kind === 'environment')
        crossLine(
          drawn,
          element.s!,
          element.kind === 'gate' ? 12 : 20,
          color ?? (element.kind === 'gate' ? '#7ee787' : '#6cb6ff'),
        );
      else if (element.kind !== 'boundary' && element.kind !== 'strip' && element.kind !== 'wall')
        point(drawn, element, color);
      style.marks(element, drawn);
    }
    // Problems, the selection and the cursor over everything.
    for (const element of section.elements)
      if ((problems.has(element.pointer) || element.problem) && element.x !== null) ring(drawn, element, '#ff7b72', 9);
    for (const element of section.elements)
      if (element.x !== null && (element.pointer === selected || highlighted.has(element.pointer)))
        ring(drawn, element, element.pointer === selected ? '#ffffff' : '#ffd33d', 7);
    const at = world(Math.min(Math.max(cursor, 0), plan.length), 0);
    context.fillStyle = '#ff7b72';
    context.beginPath();
    context.arc(at.x, at.z, 5 * pixel, 0, Math.PI * 2);
    context.fill();
    crossLine(drawn, cursor, 25, '#ff7b72');
    overlay(context, canvas, scale);
    context.fillStyle = '#ff7b72';
    context.fillText(`${section.id} · s ${cursor.toFixed(1)} m`, 16, 20);
  };

  const pickAt = (px: number, py: number): CourseElement | null => {
    if (!section) return null;
    let best: CourseElement | null = null,
      distance = PICK_PIXELS;
    for (const element of section.elements) {
      if (!shown(element) || element.x === null || element.z === null) continue;
      const p = toScreen(element.x, element.z);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < distance) {
        best = element;
        distance = d;
      }
    }
    return best;
  };
  const local = (event: MouseEvent) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * canvas.width,
      y: ((event.clientY - box.top) / box.height) * canvas.height,
    };
  };
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const at = local(event);
    const before = toPlan(at.x, at.y);
    scale *= Math.exp(-event.deltaY * 0.0015);
    const after = toPlan(at.x, at.y);
    centre = { x: centre.x + before.x - after.x, z: centre.z + before.z - after.z };
    draw();
  });
  // A press that moves pans the view; one that does not picks or moves the cursor.
  let press: { x: number; y: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    press = { ...local(event), moved: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!press) return;
    const at = local(event);
    if (!press.moved && Math.hypot(at.x - press.x, at.y - press.y) < 3) return;
    press.moved = true;
    centre = { x: centre.x - (at.x - press.x) / scale, z: centre.z + (at.y - press.y) / scale };
    press = { ...at, moved: true };
    draw();
  });
  canvas.addEventListener('pointerup', () => {
    if (press && !press.moved) {
      const element = pickAt(press.x, press.y);
      if (element) events.pick(element);
      else if (plan) {
        const p = toPlan(press.x, press.y);
        events.cursor(plan.nearest(p.x, p.z).s);
      }
    }
    press = null;
  });

  return {
    /** Show a Section; a new Section fits the view. */
    setSection(next: SectionStructure | null, nextPlan: SectionPlan | null) {
      const changed = next?.id !== section?.id;
      section = next;
      plan = nextPlan;
      build();
      if (changed) fit();
      draw();
    },
    setCursor(s: number) {
      cursor = s;
      draw();
    },
    /** The selected element's Pointer and the others drawn with it (a repeat's copies). */
    setSelection(pointer: string | null, others: Iterable<string> = []) {
      selected = pointer;
      highlighted = new Set(others);
      draw();
    },
    setLayers(next: Iterable<PlanLayer>) {
      layers = new Set(next);
      draw();
    },
    setStyle(next: PlanStyle) {
      style = next;
      draw();
    },
    /** Pointers of elements with diagnostics. */
    setProblems(pointers: Iterable<string>) {
      problems = new Set(pointers);
      draw();
    },
    /** Centre the view on a plan point. */
    centreOn(x: number, z: number) {
      centre = { x, z };
      draw();
    },
    draw,
  };
}

/** A line's vertices with samples between them every few metres, its lateral interpolated linearly in s. */
function densify(points: ResolvedLine): { s: number; l: number }[] {
  const result: { s: number; l: number }[] = [];
  points.forEach((point, i) => {
    const next = points[i + 1];
    result.push(point);
    if (!next) return;
    const steps = Math.floor((next.s - point.s) / SAMPLE_METERS);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      result.push({ s: point.s + (next.s - point.s) * t, l: point.l + (next.l - point.l) * t });
    }
  });
  return result;
}

/** A line across the road at station `s`, `half` metres each side. */
function crossLine(draw: PlanDraw, s: number, half: number, color: string) {
  const a = draw.world(s, -half),
    b = draw.world(s, half);
  draw.context.strokeStyle = color;
  draw.context.lineWidth = 2 * draw.pixel;
  draw.context.beginPath();
  draw.context.moveTo(a.x, a.z);
  draw.context.lineTo(b.x, b.z);
  draw.context.stroke();
}

/** An element's point mark: written points filled, derived points hollow; its shape by kind. */
function point(draw: PlanDraw, element: CourseElement, color: string | null) {
  const { context, pixel } = draw;
  const size = (element.kind === 'pi' ? 6 : element.kind === 'object' ? 4.5 : 3.5) * pixel;
  context.fillStyle = context.strokeStyle =
    color ??
    (
      { pi: '#ffd33d', 'arc-end': '#ffd33d', sprite: '#7ee787', object: '#ffa657', 'grid-slot': '#7ee787' } as Record<
        string,
        string
      >
    )[element.kind] ??
    '#c9d1d9';
  context.lineWidth = 1.5 * pixel;
  context.beginPath();
  if (element.kind === 'pi' || element.kind === 'object' || element.kind === 'grid-slot')
    context.rect(element.x! - size, element.z! - size, size * 2, size * 2);
  else context.arc(element.x!, element.z!, size, 0, Math.PI * 2);
  if (element.point === 'derived') context.stroke();
  else context.fill();
}

function ring(draw: PlanDraw, element: CourseElement, color: string, radius: number) {
  draw.context.strokeStyle = color;
  draw.context.lineWidth = 2 * draw.pixel;
  draw.context.beginPath();
  draw.context.arc(element.x!, element.z!, radius * draw.pixel, 0, Math.PI * 2);
  draw.context.stroke();
}

/** The scale bar and the north arrow, in screen pixels. */
function overlay(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, scale: number) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  const target = 120 / scale;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const metres = [1, 2, 5, 10].map((k) => k * magnitude).find((m) => m >= target * 0.5) ?? magnitude;
  const width = metres * scale;
  context.strokeStyle = context.fillStyle = '#e8edf2';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(16, canvas.height - 16);
  context.lineTo(16 + width, canvas.height - 16);
  context.stroke();
  context.font = '12px system-ui, sans-serif';
  context.fillText(`${metres} m`, 16, canvas.height - 22);
  context.beginPath();
  context.moveTo(canvas.width - 24, 40);
  context.lineTo(canvas.width - 30, 56);
  context.lineTo(canvas.width - 18, 56);
  context.closePath();
  context.fill();
  context.fillText('N (+z)', canvas.width - 56, 32);
}
