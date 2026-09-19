const anchor = (s) => ({ kind: 'absolute', s });
const port = (id, kind, s, carriagewayId = 'road') => ({ id, kind, anchor: anchor(s), carriagewayId });
const link = (id, from, to, sourcePort = 'out') => ({
  id,
  source: { sectionId: from, portId: sourcePort },
  destination: { sectionId: to, portId: 'in' },
  overlap: { behind: 30, ahead: 30 },
});

export function forkCourseDocument(doc, count = 3) {
  const template = structuredClone(doc.sections[0]);
  template.start = { x: 0, z: 0, heading: 0 };
  template.boundaries[0].knots.forEach((k) => {
    k.l = -4;
  });
  template.boundaries[1].knots.forEach((k) => {
    k.l = 4;
  });
  const make = (id, heading) => {
    const s = structuredClone(template);
    s.id = id;
    s.start = { x: heading * 7, z: heading * 3, heading };
    s.ports = [port('in', 'entry', 60), port('out', 'exit', 240)];
    return s;
  };
  const parent = make('parent', 0);
  parent.ports = [];
  parent.boundaries = [];
  parent.bands = [];
  parent.physicalBindings = [];
  parent.carriageways = [];
  for (let i = 0; i < count; i++) {
    const road = `road-${i}`,
      center = (i - 1) * 14;
    for (const [side, l] of [
      ['left', center - 4],
      ['right', center + 4],
    ])
      parent.boundaries.push({
        id: `${road}-${side}`,
        knots: [
          { anchor: anchor(0), l },
          { anchor: anchor(300), l },
        ],
      });
    parent.bands.push({
      ...structuredClone(template.bands[0]),
      id: road,
      leftBoundaryId: `${road}-left`,
      rightBoundaryId: `${road}-right`,
    });
    parent.carriageways.push({ id: road, bandIds: [road] });
    parent.physicalBindings.push({ bandId: road, sections: [{ anchor: anchor(0), material: 'ASPHALT' }] });
    parent.ports.push(port(`out-${i}`, 'exit', 230, road));
  }
  const children = Array.from({ length: count }, (_, i) => make(`child-${i}`, 35 + i * 37));
  const shared = make('shared', -80);
  shared.ports.pop();
  doc.type = 'BRANCH';
  doc.entrySectionId = parent.id;
  doc.sections = [parent, ...children, shared];
  doc.links = children.flatMap((child, i) => [
    link(`fork-${i}`, parent.id, child.id, `out-${i}`),
    link(`merge-${i}`, child.id, shared.id),
  ]);
  return doc;
}
