/** Synthetic admission workloads, never imported master-course geometry. */
export function courseCapacityDocument(template, name, limits) {
  const document = structuredClone(template),
    section = document.sections[0];
  document.id = `synthetic-${name}`;
  const straight = (id, length) => ({ id, kind: 'straight', length });
  const circles = (count, radius) =>
    Array.from({ length: count }, (_, i) => ({ id: `circle-${i}`, kind: 'arc', radius, turn: 360 }));
  if (name === 'long-curved') {
    const count = 66,
      radius = (20800 - 400) / (count * 72 * 2 * Math.sin(Math.PI / 72));
    section.primitives = [straight('approach', 200), ...circles(count, radius), straight('runout', 200)];
  } else if (name === 'primitive-limit') {
    section.primitives = Array.from({ length: limits.primitives }, (_, i) =>
      straight(i === limits.primitives - 1 ? 'runout' : `straight-${i}`, 40),
    );
    section.ports[0].anchor = { kind: 'absolute', s: 35 };
    section.ports[1].anchor = { kind: 'primitive', primitiveId: 'runout', fraction: 0.125 };
  } else if (name === 'raster-limit') {
    const count = Math.floor((limits.rasterSegments - 8) / 72);
    const endSegments = limits.rasterSegments - count * 72 - 4;
    section.primitives = [straight('approach', 200), ...circles(count, 20), straight('runout', endSegments * 50)];
    section.ports[0].anchor = { kind: 'absolute', s: 100 };
    section.ports[1].anchor = { kind: 'primitive', primitiveId: 'runout', fraction: 0.5 };
  } else throw new RangeError(`Unknown capacity workload ${name}`);
  return document;
}
