import type { CourseReport } from './course-report.js';
/** Deterministic SVG plots from numeric compiled observations. No raster or Python dependency. */
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const colors = ['#176b9b', '#36805a', '#a4475e', '#926323', '#7553a3', '#187a80', '#ae5a28'];
const text = (x: number, y: number, value: unknown, attrs = '') =>
  `<text x="${x}" y="${y}" ${attrs}>${escape(value)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke = '#dae1e7') =>
  `<path d="M${x1},${y1}L${x2},${y2}" fill="none" stroke="${stroke}"/>`;
const range = (values: readonly number[]): [number, number] => {
  let min = Math.min(...values),
    max = Math.max(...values);
  if (max === min) {
    min -= 0.5;
    max += 0.5;
  }
  return [min, max];
};
const scale =
  ([min, max]: readonly [number, number], a: number, b: number) =>
  (value: number) =>
    a + ((value - min) / (max - min)) * (b - a);
const path = (points: readonly (readonly [number, number] | null)[], stroke: string) =>
  `<path d="${points.map((p, i) => (p ? `${i && points[i - 1] ? 'L' : 'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}` : '')).join(' ')}" stroke="${stroke}" fill="none" stroke-width="1.6"/>`;
const svg = (width: number, height: number, title: string, content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><title>${escape(title)}</title><rect width="100%" height="100%" fill="#f8fafb"/><g font-family="sans-serif" font-size="12" fill="#203040">${content}</g></svg>\n`;

export function plotCourseReport(data: CourseReport) {
  const x = scale([0, data.lengthMeters], 100, 1140);
  let regions =
    text(40, 30, `${data.course} / ${data.section}`, 'font-size="21"') +
    text(40, 52, `Compiled source profiles · ${data.lengthMeters.toFixed(1)} m`);
  function panel(
    top: number,
    title: string,
    series: { name: string; values: (readonly [number, number] | null)[] }[],
    domains?: readonly number[],
  ) {
    const ys = domains ?? series.flatMap((s) => s.values.filter((p) => p !== null).map((p) => p[1]));
    const limits = range(ys.length ? ys : [0, 1]);
    const y = scale(limits, top + 120, top + 25);
    regions += text(100, top + 8, title, 'font-weight="bold"');
    for (let i = 0; i <= 4; i += 1) {
      const v = limits[0] + ((limits[1] - limits[0]) * i) / 4;
      regions += line(100, y(v), 1140, y(v)) + text(90, y(v) + 4, v.toPrecision(3), 'text-anchor="end"');
    }
    for (let i = 0; i <= 5; i += 1) {
      const s = (data.lengthMeters * i) / 5;
      regions += line(x(s), top + 25, x(s), top + 120) + text(x(s), top + 138, s.toFixed(0), 'text-anchor="middle"');
    }
    for (let i = 0; i < series.length; i += 1) {
      const seriesColor = colors[i % colors.length]!;
      regions += path(
        series[i]!.values.map((p) => p && [x(p[0]), y(p[1])]),
        seriesColor,
      );
      regions += text(
        100 + (i % 4) * 265,
        top + 158 + Math.floor(i / 4) * 16,
        series[i]!.name,
        `fill="${seriesColor}"`,
      );
    }
    return top + 182 + Math.floor((Math.max(series.length, 1) - 1) / 4) * 16;
  }
  let top = panel(80, 'Guide curvature (1/km)', [
    { name: 'Curvature', values: data.samples.map((p) => [p.s, p.curvaturePerMeter * 1000]) },
  ]);
  top = panel(top, 'Physical height (m)', [{ name: 'Height', values: data.samples.map((p) => [p.s, p.heightMeters]) }]);
  top = panel(
    top,
    'Boundary lateral position (m)',
    data.boundaries.map((name, i) => ({
      name,
      values: data.samples.map((p) => (p.boundaries[i] === null ? null : [p.s, p.boundaries[i]!])),
    })),
  );
  const sceneryRange = range(data.scenery.length ? data.scenery.map((p) => p.l) : [0, 1]);
  const sceneryY = scale(sceneryRange, top + 120, top + 25);
  const assets = [...new Set(data.scenery.map((p) => p.asset))].sort();
  const sceneryTop = top;
  top = panel(
    top,
    'Scenery lateral position (m)',
    assets.map((name) => ({ name, values: [] })),
    sceneryRange,
  );
  for (const p of data.scenery)
    regions += line(
      x(p.s),
      sceneryY(p.l) - 4,
      x(p.s),
      sceneryY(p.l) + 4,
      colors[assets.indexOf(p.asset) % colors.length],
    );
  top = Math.max(top, sceneryTop + 182);
  regions += text(100, top + 8, 'Environment', 'font-weight="bold"');
  data.environments.forEach((e, i) => {
    const end = data.environments[i + 1]?.s ?? data.lengthMeters;
    regions += `<rect x="${x(e.s)}" y="${top + 25}" width="${x(end) - x(e.s)}" height="45" fill="${colors[i % colors.length]}" opacity="0.2"/>`;
    regions += text((x(e.s) + x(end)) / 2, top + 53, e.name, 'text-anchor="middle"');
  });
  regions += text(620, top + 96, 'Source station s (m)', 'text-anchor="middle"');

  const [xmin, xmax] = range(data.samples.map((p) => p.x));
  const [zmin, zmax] = range(data.samples.map((p) => p.z));
  const k = Math.min(660 / (xmax - xmin), 900 / (zmax - zmin));
  const px = (v: number) => 420 + (v - (xmin + xmax) / 2) * k;
  const pz = (v: number) => 550 - (v - (zmin + zmax) / 2) * k;
  let plan =
    text(35, 30, `${data.section} · source plan`, 'font-size="21"') +
    text(35, 54, 'Occurrence transforms are not geographical connections');
  plan += path(
    data.samples.map((p) => [px(p.x), pz(p.z)]),
    colors[0]!,
  );
  for (const [point, label, color] of [
    [data.samples[0]!, 'START', colors[1]],
    [data.samples.at(-1)!, 'END', colors[2]],
  ] as const) {
    plan +=
      `<circle cx="${px(point.x)}" cy="${pz(point.z)}" r="4" fill="${color}"/>` +
      text(px(point.x) + 8, pz(point.z) - 8, label);
  }
  const ruler = 100 / k;
  plan += line(70, 1050, 170, 1050, '#203040') + text(70, 1072, `${ruler.toPrecision(3)} m · x right / z up`);
  return {
    regions: svg(1200, top + 120, `${data.course} profiles`, regions),
    plan: svg(840, 1100, `${data.section} plan`, plan),
  };
}
