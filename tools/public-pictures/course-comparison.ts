import { mkdir, writeFile } from 'node:fs/promises';
import { createCourseFrameRenderer } from '../authoring/course-views.js';
import type { CompiledContent } from '../authoring/compile-content.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import { rgb555Png } from './road-preview.js';
import { PUBLIC_COURSE_ID } from './derive.js';

/** Paired product-renderer frames at the same chainage, section, lateral position and vehicle/camera setup. */
export async function writePublicCourseComparison(content: CompiledContent, out: URL) {
  const original = content.courses.find((c) => c.id === 'enduro-racer'),
    publicCourse = content.courses.find((c) => c.id === PUBLIC_COURSE_ID);
  if (!original || !publicCourse) return;
  await mkdir(out, { recursive: true });
  const route = enumerateCourseRoutes(original.entry, original.type)[0]!;
  const sections = [original.entry, ...route.map((link) => link.to.section)];
  const cards: string[] = [],
    records = [];
  let start = 0,
    station = 0;
  for (const section of sections) {
    const counterpart = publicCourse.sections.find((s) => s.id === section.id)!;
    const a = createCourseFrameRenderer(content, original, section),
      b = createCourseFrameRenderer(content, publicCourse, counterpart);
    const end = start + section.coordinates.domain.end;
    for (; station < end; station += 500) {
      const s = station - start,
        first = a.render(s, 0),
        second = b.render(s, 0);
      const pixels = new Uint16Array(640 * 240);
      for (let y = 0; y < 240; y++) {
        pixels.set(first.pixels.subarray(y * 320, (y + 1) * 320), y * 640);
        pixels.set(second.pixels.subarray(y * 320, (y + 1) * 320), y * 640 + 320);
      }
      const file = `${String(station).padStart(5, '0')}.png`;
      await writeFile(new URL(file, out), rgb555Png(640, 240, pixels));
      records.push({ station, section: section.id, s, l: 0, vehicle: first.vehicle, file });
      cards.push(
        `<figure><figcaption>${station} m · ${section.id} · 原本（左） / 公開版（右）</figcaption><img src="${file}" width="1280" height="480" alt="${station} mの同じ位置・カメラの比較"/></figure>`,
      );
    }
    start = end;
  }
  await writeFile(new URL('frames.json', out), JSON.stringify(records, null, 2) + '\n');
  await writeFile(
    new URL('index.html', out),
    `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENDURO RACER コース比較</title><style>body{background:#142128;color:#e4edf0;font:16px system-ui;margin:24px}figure{margin:24px 0;overflow:auto}img{image-rendering:pixelated}a{color:#6ed7ed}</style><h1>ENDURO RACER — 500 mごとの比較</h1><p>左が原本、右が公開版。同じ車両・位置・横位置・停止姿勢から、ゲーム共通のカメラと描画で表示しています。</p><p><a href="../public-pictures/index.html">絵と基準点・当たり幅の一覧</a> · <a href="frames.json">位置データ</a></p>${cards.join('')}</html>`,
  );
}
