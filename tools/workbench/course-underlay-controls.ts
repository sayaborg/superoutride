import {
  COURSE_UNDERLAYS_DIRECTORY,
  COURSE_UNDERLAYS_FORMAT,
  planToUnderlay,
  readCourseUnderlays,
  scaleUnderlay,
  type CourseUnderlays,
  type UnderlayAlignment,
} from '../authoring/course-underlays.js';
import type { ContentStore } from '../authoring/content-store.js';
import { contentDigest } from '../../src/core/content-digest.js';
import type { PlanDrag } from './course-plan-view.js';
import { make } from './dom.js';
import { confirmField, finiteNumber } from './pending-edit.js';

type Placement = Omit<UnderlayAlignment, 'image' | 'sha256'>;

/** What the underlay controls read and do. */
export interface UnderlayHost {
  store(): ContentStore;
  course(): string | null;
  section(): string | null;
  /** The plan point at the centre of the view, where a new underlay starts. */
  centre(): { x: number; z: number };
  show(underlay: { image: CanvasImageSource; alignment: Placement; opacity: number } | null): void;
  /** Replace the course's underlay document: one step. */
  save(path: string, value: CourseUnderlays, label: string): void;
}

/**
 * An image under a Section's plan, to trace a course from: a PNG or JPEG opened in the browser, never saved. It is
 * scaled from two points on it and the distance between them, moved by dragging or by number, turned by number and
 * shown at a chosen opacity. "Save alignment" saves the numbers (the image's file name and SHA-256, scale, position
 * and rotation, by Section) as production-only data, one step; opening the same image again lays it where it was
 * saved, and a different image is named as such.
 */
export function createUnderlayControls(host: UnderlayHost) {
  const panel = make('details', '', { class: 'course-underlay' });
  const file = make('input', '', { type: 'file', accept: 'image/png,image/jpeg' });
  const opacity = make('input', '', { type: 'range', min: '0', max: '1', step: '0.05', value: '0.5' });
  const fields = {
    scale: make('input', '', { type: 'number', step: 'any', min: '0' }),
    x: make('input', '', { type: 'number', step: 'any' }),
    z: make('input', '', { type: 'number', step: 'any' }),
    rotation: make('input', '', { type: 'number', step: 'any' }),
  };
  const move = make('input', '', { type: 'checkbox' });
  const twoPoints = make('button', 'Scale from two points', { type: 'button' });
  const distance = make('input', '', { type: 'number', step: 'any', min: '0', value: '10' });
  const save = make('button', 'Save alignment', { type: 'button' });
  const status = make('p', '', { class: 'hint', role: 'status' });
  const field = (text: string, control: HTMLElement) => {
    const label = make('label', `${text} `);
    label.append(control);
    return label;
  };
  panel.append(
    make('summary', 'Underlay'),
    field('Image', file),
    field('Opacity', opacity),
    make('br'),
    field('Scale (m/px)', fields.scale),
    field('x', fields.x),
    field('z', fields.z),
    field('Rotation (°)', fields.rotation),
    field('Move by dragging', move),
    make('br'),
    twoPoints,
    field('distance (m)', distance),
    ' ',
    save,
    status,
  );

  let image: { bitmap: ImageBitmap; name: string; sha256: string } | null = null;
  let placement: Placement | null = null;
  let picking: { u: number; v: number }[] | null = null;
  const path = () => `${COURSE_UNDERLAYS_DIRECTORY}/${host.course()}.json`;
  const saved = async (): Promise<CourseUnderlays | null> => {
    const bytes = await host
      .store()
      .read(path())
      .catch(() => null);
    if (!bytes) return null;
    const read = readCourseUnderlays(JSON.parse(new TextDecoder().decode(bytes)), path());
    return read.ok ? read.value : null;
  };
  const show = () => {
    for (const [key, input] of Object.entries(fields))
      input.value = placement ? String(Number(placement[key as keyof Placement].toFixed(6))) : '';
    host.show(
      image && placement ? { image: image.bitmap, alignment: placement, opacity: Number(opacity.value) } : null,
    );
  };
  /**
   * Lay the open image for the open Section: where it was saved, else at the view's centre at 1 m per pixel. Its
   * numbers stay as adjusted until the image, the course or the Section changes.
   */
  let placed = '';
  const place = async (again = false) => {
    const key = `${host.course()} ${host.section()}`;
    if (!again && key === placed) return;
    placed = key;
    if (!image) return show();
    const entry = (await saved())?.sections[host.section() ?? ''];
    if (entry) {
      placement = { scale: entry.scale, x: entry.x, z: entry.z, rotation: entry.rotation };
      status.textContent =
        entry.sha256 === image.sha256
          ? `Laid where it was saved (${entry.image}).`
          : `This image differs from the one saved for this Section (${entry.image}, SHA-256 ${entry.sha256.slice(0, 12)}…); laid with its numbers.`;
    } else {
      const { x, z } = host.centre();
      placement = { scale: 1, x, z, rotation: 0 };
      status.textContent = 'No saved alignment for this Section.';
    }
    show();
  };

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    image = {
      bitmap: await createImageBitmap(new Blob([bytes])),
      name: chosen.name,
      sha256: await contentDigest(bytes),
    };
    await place(true);
  });
  opacity.addEventListener('input', show);
  for (const [key, input] of Object.entries(fields))
    confirmField(input, finiteNumber, (value) => {
      if (!placement || (key === 'scale' && !(value > 0))) return show();
      placement = { ...placement, [key]: value };
      show();
    });
  twoPoints.addEventListener('click', () => {
    if (!placement) return;
    picking = [];
    status.textContent = 'Click the first point on the image, then the second.';
  });
  save.addEventListener('click', async () => {
    const section = host.section();
    if (!image || !placement || !section) return;
    const before = await saved();
    const sections = {
      ...(before?.sections ?? {}),
      [section]: {
        image: image.name,
        sha256: image.sha256,
        scale: placement.scale,
        x: placement.x,
        z: placement.z,
        rotation: placement.rotation,
      },
    };
    host.save(path(), { ...COURSE_UNDERLAYS_FORMAT, sections }, `Save underlay alignment of ${section}`);
    status.textContent = `Saved for ${section}.`;
  });

  /** A press on the plan the underlay takes: a point for the scale, or a drag that moves the image. */
  const grab = (at: { x: number; z: number }): PlanDrag | null => {
    if (!placement) return null;
    if (picking) {
      picking.push(planToUnderlay(placement, at.x, at.z));
      if (picking.length === 2) {
        try {
          placement = scaleUnderlay(placement, picking[0]!, picking[1]!, finiteNumber(distance.value) ?? 0);
          status.textContent = `Scale ${placement.scale.toFixed(6)} m per pixel.`;
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
        }
        picking = null;
        show();
      } else status.textContent = 'Now the second point.';
      return { move() {}, end() {} };
    }
    if (!move.checked) return null;
    const start = placement;
    return {
      move(p) {
        placement = { ...start, x: start.x + p.x - at.x, z: start.z + p.z - at.z };
        show();
      },
      end() {},
    };
  };
  return { element: panel, grab, place };
}
