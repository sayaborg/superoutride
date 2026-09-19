import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { coursePortLateral } from '../../dist/compiler/course-links.js';
import { presentationDocument } from './course-presentation-documents.mjs';

const anchor = (s) => ({ kind: 'absolute', s });
const ok = (r) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.value;
};

/** Real saved nonempty overlap content; envelope is declared test input, not measured product coverage. */
export async function commonPresentationDocument(name = 'linked-linear', configure = () => {}) {
  const fixture = await presentationDocument(name);
  configure(fixture.document);
  const geometry = ok(await compileCourseDocument(fixture.document, fixture.inputs));
  const { document } = fixture;
  document.sceneryInstances = [];
  for (const [index, section] of document.sections.entries()) {
    section.presentation.ground.left = 30;
    section.presentation.ground.right = 30;
    section.presentation.scenery = [];
    for (const [i, binding] of section.presentation.ground.bands.entries()) {
      const band = geometry.sections[index].bandPartition.bands[i];
      if (binding.sections[0].paint === null) continue;
      binding.sections[0].paint.phaseL = (band.left.knots.at(-1).l + band.right.knots.at(-1).l) / 2;
      binding.sections[0].paint.alternate = { paletteRgb555: [0, 0x001f, 0x7fff], spanS: 5, spanL: 2 };
    }
  }
  const instances = new Set();
  for (const link of geometry.links) {
    const instanceId = `entry-${link.destination.section.id}`;
    if (!instances.has(instanceId)) {
      document.sceneryInstances.push({ id: instanceId, assetId: 'tree' });
      instances.add(instanceId);
    }
    for (const port of [link.source, link.destination]) {
      const index = geometry.sections.indexOf(port.section),
        p = document.sections[index].presentation;
      const id = `${instanceId}-${port.kind}`;
      if (p.scenery.some((placement) => placement.id === id)) continue;
      p.scenery.push({
        id,
        instanceId,
        anchor: anchor(port.anchor.s + 4),
        l: coursePortLateral(port) + 2,
        groundOffset: 1,
      });
      p.ground.stamps.push({ id, assetId: 'stamp', anchor: anchor(port.anchor.s + 5), l: coursePortLateral(port) + 1 });
    }
  }
  return fixture;
}

/** One approach, three parallel supported choices and static peel-away; no sibling copies/VOID holes. */
export function cameraForkDocument() {
  return commonPresentationDocument('fork-merge', (document) => {
    for (const section of document.sections) {
      section.primitives[0].length = 2000;
      for (const boundary of section.boundaries)
        for (const knot of boundary.knots)
          if (knot.anchor.kind === 'absolute' && knot.anchor.s === 300) knot.anchor.s = 2000;
      for (const port of section.ports) port.anchor = anchor(port.kind === 'entry' ? 500 : 1400);
    }
    for (const link of document.links) link.overlap = { behind: 500, ahead: 500 };
    const parent = document.sections[0];
    for (const boundary of parent.boundaries) {
      const initial = boundary.knots[0].l;
      const center = Math.abs(initial) > 8 ? Math.sign(initial) * 400 : 0;
      const last = center + (boundary.id.endsWith('left') ? -4 : 4);
      boundary.knots = [
        { anchor: anchor(0), l: initial },
        { anchor: anchor(800), l: initial },
        { anchor: anchor(900), l: last },
        { anchor: anchor(2000), l: last },
      ];
    }
    for (const band of parent.bands) band.start = anchor(200);
    for (const binding of parent.physicalBindings) binding.sections[0].anchor = anchor(200);
    for (const binding of parent.presentation.ground.bands) binding.sections[0].anchor = anchor(200);
    for (let i = 0; i < 2; i += 1) {
      const id = `median-${i}`;
      parent.bands.push({
        id,
        start: anchor(200),
        end: anchor(2000),
        leftBoundaryId: `road-${i}-right`,
        rightBoundaryId: `road-${i + 1}-left`,
        role: 'median',
      });
      parent.physicalBindings.push({ bandId: id, sections: [{ anchor: anchor(200), material: 'GRASS' }] });
      parent.presentation.ground.bands.push({ bandId: id, sections: [{ anchor: anchor(200), paint: null }] });
    }
    parent.bands.push({
      id: 'approach',
      start: anchor(0),
      end: anchor(200),
      leftBoundaryId: 'road-0-left',
      rightBoundaryId: 'road-2-right',
      role: 'pavement',
    });
    parent.physicalBindings.push({ bandId: 'approach', sections: [{ anchor: anchor(0), material: 'ASPHALT' }] });
    parent.carriageways.push({ id: 'approach', bandIds: ['approach'] });
    parent.presentation.ground.bands.push({
      bandId: 'approach',
      sections: [{ anchor: anchor(0), paint: structuredClone(parent.presentation.ground.bands[0].sections[0].paint) }],
    });
  }).then((fixture) => {
    for (const section of fixture.document.sections) {
      section.presentation.ground.left = 1000;
      section.presentation.ground.right = 1000;
      for (const binding of section.presentation.ground.bands) {
        const paint = binding.sections[0].paint;
        if (paint) {
          paint.phaseS += 1 / 64;
          paint.phaseL += 1 / 64;
        }
      }
    }
    return fixture;
  });
}

export function presentationDemand() {
  const pose = { behind: 1, ahead: 1, left: 1, right: 1 },
    step = { behind: 1, ahead: 1, left: 1, right: 1 },
    footprint = { behind: 8, ahead: 18, left: 4, right: 4 };
  return {
    pose,
    step,
    consumers: { cameraRender: { ...footprint }, groundFilter: { ...footprint }, scenery: { ...footprint } },
  };
}

export async function authoredForkDocument() {
  const fixture = await cameraForkDocument();
  fixture.document.sections[0].fork = { lock: anchor(200), closure: anchor(750) };
  return fixture;
}
