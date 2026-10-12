import path from 'node:path';
import { loadCourse, atomicWrite, reportError } from './authoring-io.js';
import { createCourseFrameRenderer } from '../authoring/course-views.js';
import { blit, createRaster, encodePng, fillRect, writeText } from '../graphics/drawn/raster.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';

/**
 * OUTRUN TEST's contact sheets, for review by eye: `npm run outrun-test-sheets -- [stage ...] [--out directory]`
 * compiles the content once and writes, for each named stage (every stage by default), `<stage>.png`: frames of the
 * game's logical frame through the product scene with TESTAROSSA at rest on lane a's centre, from the stage's start
 * through every eighth of it to its fork or goal, each labelled with its station. Disposable outputs; nothing reads them.
 */
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = path.resolve(outIndex >= 0 ? args[outIndex + 1]! : 'dist/outrun-test-sheets');
const names = args.filter((arg, i) => !arg.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
const COLUMNS = 4;

try {
  const { course, content } = await loadCourse(
    new URL('../../content/courses/outrun-test.course.json', import.meta.url).pathname,
  );
  const written: string[] = [];
  for (const section of course.sections.filter((s) => !names.length || names.includes(s.id))) {
    const length = section.coordinates.domain.end;
    // Lane a's centre, the centreline.
    const stations = [10, ...Array.from({ length: 7 }, (_, i) => ((i + 1) * length) / 8)];
    if (section.fork) stations.push(section.fork.lock.s - 120, section.fork.lock.s + 40, section.fork.closure.s + 100);
    else stations.push(length - 600, length - 470, length - 300);
    stations.push(length - 5);
    const renderer = createCourseFrameRenderer(content, course, section, {
      vehicle: 'TESTAROSSA',
      ...(section.outgoing[0] ? { exit: section.outgoing[0].id, through: length } : {}),
    });
    const rows = Math.ceil(stations.length / COLUMNS);
    const sheet = createRaster(COLUMNS * 322, rows * 252 + 14);
    fillRect(sheet, 0, 0, sheet.width, sheet.height, 0x101018);
    writeText(sheet, 4, 3, `${section.id.toUpperCase()} ${Math.round(length)} M`, 1, 0xf8d030);
    stations.forEach((s, i) => {
      const frame = renderer.render(Math.min(length, Math.max(0, s)), 0);
      const tile = createRaster(frame.width, frame.height);
      frame.pixels.forEach((value, k) => {
        const { r, g, b } = unpackRgba(rgb555ToRgba(value));
        tile.pixels[k] = 0x1000000 | (r << 16) | (g << 8) | b;
      });
      const x = (i % COLUMNS) * 322 + 1,
        y = 14 + Math.floor(i / COLUMNS) * 252;
      blit(sheet, tile, x, y);
      writeText(sheet, x, y + 242, `S ${Math.round(s)}`, 1, 0xe0e0e0);
    });
    const file = path.join(out, `${section.id}.png`);
    await atomicWrite(file, encodePng(sheet));
    written.push(file);
  }
  console.log(JSON.stringify({ ok: true, written }));
} catch (error) {
  reportError(error);
}
