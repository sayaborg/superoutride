import type { CourseElement, SectionPlan, SectionStructure } from '../authoring/course-structure.js';
import type { ProfileReader } from '../../src/course/geometry/profile.js';
import type { PlanStyle } from './course-plan-view.js';

/** Metres between profile samples. */
const SAMPLE_METERS = 2;
const PICK_PIXELS = 8;
const MARGIN = { left: 48, right: 12, top: 28, bottom: 30 };

/**
 * The profile of one Section: station s across, road height up. The road height is the compiler's profile, sampled;
 * PVIs are written points (filled), vertical-curve ends derived (hollow), each tangent's grade written on it; PIs
 * mark their stations along the top and gates along the bottom. The cursor and the selection are the plan's. A click
 * picks the nearest point or moves the cursor.
 */
export function createProfileView(
  canvas: HTMLCanvasElement,
  events: { pick(element: CourseElement | null): void; cursor(s: number): void },
) {
  let section: SectionStructure | null = null,
    plan: SectionPlan | null = null,
    profile: ProfileReader | null = null;
  let cursor = 0,
    selected: string | null = null,
    highlighted = new Set<string>();
  let style: Pick<PlanStyle, 'colorOf'> = { colorOf: () => null };
  let low = 0,
    high = 1;

  const x = (s: number) => MARGIN.left + (s / (plan?.length || 1)) * (canvas.width - MARGIN.left - MARGIN.right);
  const y = (h: number) =>
    canvas.height - MARGIN.bottom - ((h - low) / (high - low)) * (canvas.height - MARGIN.top - MARGIN.bottom);
  const sOf = (px: number) => ((px - MARGIN.left) / (canvas.width - MARGIN.left - MARGIN.right)) * (plan?.length ?? 0);

  const points = () =>
    (section?.elements ?? []).filter(
      (e) => (e.kind === 'pvi' || e.kind === 'curve-end' || e.kind === 'gate') && e.s !== null,
    );
  // A PVI stands at its written height, where its tangents meet; other points lie on the road.
  const heightOf = (e: CourseElement) =>
    e.kind === 'pvi' ? Number(e.values.y) : (e.y ?? (profile && e.s !== null ? profile.sample(e.s) : 0));

  const draw = () => {
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#0b0f14';
    c.fillRect(0, 0, canvas.width, canvas.height);
    if (!section || !plan) return;
    if (!profile) {
      c.fillStyle = '#ff7b72';
      c.fillText('The profile does not compile.', MARGIN.left, MARGIN.top + 12);
      return;
    }
    const samples: { s: number; h: number }[] = [];
    for (let s = 0; ; s = Math.min(plan.length, s + SAMPLE_METERS)) {
      samples.push({ s, h: profile.sample(s) });
      if (s === plan.length) break;
    }
    const heights = [
      ...samples.map((p) => p.h),
      ...points()
        .filter((e) => e.kind === 'pvi')
        .map(heightOf),
    ];
    low = Math.min(...heights) - 2;
    high = Math.max(...heights) + 2;
    c.font = '11px system-ui, sans-serif';
    // Axes: heights at the left, stations along the bottom.
    c.strokeStyle = '#2a333d';
    c.fillStyle = '#8e9aa6';
    for (let i = 0; i <= 4; i++) {
      const h = low + ((high - low) * i) / 4;
      c.beginPath();
      c.moveTo(MARGIN.left, y(h));
      c.lineTo(canvas.width - MARGIN.right, y(h));
      c.stroke();
      c.fillText(`${h.toFixed(1)} m`, 4, y(h) + 4);
    }
    // PI stations along the top.
    c.fillStyle = '#ffd33d';
    for (const [id, s] of plan.stations) {
      c.fillRect(x(s) - 0.5, MARGIN.top - 8, 1, 8);
      c.fillText(id, x(s) + 2, MARGIN.top - 10);
    }
    // The road height, then the grade of each tangent between PVIs.
    c.strokeStyle = '#e8edf2';
    c.lineWidth = 1.5;
    c.beginPath();
    samples.forEach((p, i) => (i ? c.lineTo(x(p.s), y(p.h)) : c.moveTo(x(p.s), y(p.h))));
    c.stroke();
    const pvis = section.elements.filter((e) => e.kind === 'pvi' && e.s !== null);
    c.fillStyle = '#8e9aa6';
    for (let i = 1; i < pvis.length; i++) {
      const a = pvis[i - 1]!,
        b = pvis[i]!;
      const grade = ((heightOf(b) - heightOf(a)) / (b.s! - a.s!)) * 100;
      c.fillText(`${grade.toFixed(2)} %`, (x(a.s!) + x(b.s!)) / 2 - 16, y((heightOf(a) + heightOf(b)) / 2) - 8);
    }
    for (const e of points()) {
      const px = x(e.s!);
      if (e.kind === 'gate') {
        c.fillStyle = style.colorOf(e) ?? '#7ee787';
        c.fillRect(px - 0.5, canvas.height - MARGIN.bottom, 1, 10);
        c.fillText(String(e.values.id ?? e.values.kind), px + 2, canvas.height - MARGIN.bottom + 20);
        continue;
      }
      const py = y(heightOf(e));
      c.strokeStyle = c.fillStyle = style.colorOf(e) ?? '#ffd33d';
      c.lineWidth = 1.5;
      c.beginPath();
      if (e.kind === 'pvi') c.rect(px - 4, py - 4, 8, 8);
      else c.arc(px, py, 3.5, 0, Math.PI * 2);
      if (e.point === 'derived') c.stroke();
      else c.fill();
      if (e.pointer === selected || highlighted.has(e.pointer)) {
        c.strokeStyle = e.pointer === selected ? '#ffffff' : '#ffd33d';
        c.beginPath();
        c.arc(px, py, 8, 0, Math.PI * 2);
        c.stroke();
      }
    }
    // The cursor.
    c.strokeStyle = '#ff7b72';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x(cursor), MARGIN.top);
    c.lineTo(x(cursor), canvas.height - MARGIN.bottom);
    c.stroke();
    c.fillStyle = '#ff7b72';
    c.fillText(
      `s ${cursor.toFixed(1)} m · ${profile.sample(Math.min(cursor, plan.length)).toFixed(2)} m`,
      x(cursor) + 4,
      MARGIN.top + 12,
    );
  };

  canvas.addEventListener('click', (event) => {
    if (!section || !plan) return;
    const box = canvas.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * canvas.width,
      py = ((event.clientY - box.top) / box.height) * canvas.height;
    let best: CourseElement | null = null,
      distance = PICK_PIXELS;
    for (const e of points()) {
      const d = Math.hypot(x(e.s!) - px, (e.kind === 'gate' ? canvas.height - MARGIN.bottom + 5 : y(heightOf(e))) - py);
      if (d < distance) {
        best = e;
        distance = d;
      }
    }
    if (best) events.pick(best);
    else events.cursor(Math.max(0, Math.min(plan.length, sOf(px))));
  });

  return {
    setSection(next: SectionStructure | null, nextPlan: SectionPlan | null, nextProfile: ProfileReader | null) {
      section = next;
      plan = nextPlan;
      profile = nextProfile;
      draw();
    },
    setCursor(s: number) {
      cursor = s;
      draw();
    },
    setSelection(pointer: string | null, others: Iterable<string> = []) {
      selected = pointer;
      highlighted = new Set(others);
      draw();
    },
    setStyle(next: Pick<PlanStyle, 'colorOf'>) {
      style = next;
      draw();
    },
    draw,
  };
}
