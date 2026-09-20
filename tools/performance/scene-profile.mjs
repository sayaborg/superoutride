/** Exclusive attribution: coordinate work is separated from its physics/driver caller. */
function category(stack) {
  if (stack.some((f) => /\/render\/|\/terrain\/|\/graphics\/|\/groundmap\//.test(f.url))) return 'render';
  if (stack.some((f) => /course-driving-view|guide-curve|guide-coordinate-frame/.test(f.url))) return 'view';
  if (stack.some((f) => /\/physics\//.test(f.url))) return 'physics';
  if (stack.some((f) => /(?:rival|reference)-driver/.test(f.url))) return 'driver';
  if (
    stack.some((f) =>
      /(?:race-progress|crossing-gate|checkpoint-clock|course-fork-field|course-driving-session)/.test(f.url),
    )
  )
    return 'progress';
  return 'other';
}

export function summarizeSceneProfile(profile, frames, cpu = false) {
  const totals = {},
    functions = new Map(),
    paths = new Map();
  const visit = (node, stack) => {
    const path = [...stack, node.callFrame];
    paths.set(node.id, path);
    if (!cpu) record(path, node.selfSize);
    for (const child of node.children ?? []) visit(child, path);
  };
  const record = (stack, value) => {
    if (cpu && stack.some((f) => f.url.startsWith('node:inspector'))) return;
    const group = category(stack),
      f = stack.at(-1);
    totals[group] = (totals[group] ?? 0) + value / frames;
    const key = `${f.functionName || '(anonymous)'} ${f.url.replace(/^.*\/dist\//, 'dist/').replace(/^.*\/tools\//, 'tools/')}:${f.lineNumber + 1}`;
    functions.set(key, (functions.get(key) ?? 0) + value / frames);
  };
  if (cpu) {
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const walk = (id, stack) => {
      const n = nodes.get(id),
        path = [...stack, n.callFrame];
      paths.set(id, path);
      for (const child of n.children ?? []) walk(child, path);
    };
    walk(profile.nodes[0].id, []);
    for (let i = 0; i < profile.samples.length; i++)
      record(paths.get(profile.samples[i]), profile.timeDeltas[i] / 1000);
  } else visit(profile.head, []);
  return {
    categoriesPerFrame: totals,
    functionsPerFrame: [...functions]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 35)
      .map(([functionName, value]) => ({ functionName, value })),
  };
}
