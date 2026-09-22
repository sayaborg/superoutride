import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceRoot = path.join(repositoryRoot, 'src');

async function collectFiles(directory, suffixes) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target, suffixes)));
    else if (entry.isFile() && suffixes.some((suffix) => entry.name.endsWith(suffix))) {
      files.push(target);
    }
  }
  return files;
}

const layerDependencies = {
  core: [],
  graphics: ['core'],
  course: ['core'],
  compiler: ['core', 'course', 'graphics', 'groundmap', 'physics', 'visual'],
  authoring: ['course', 'compiler'],
  input: ['core'],
  physics: ['core', 'course', 'input'],
  audio: ['core'],
  vehicle: ['physics', 'audio'],
  camera: ['core', 'physics'],
  gameplay: ['core', 'input', 'physics'],
  visual: ['core', 'course', 'graphics'],
  terrain: ['core', 'course', 'visual'],
  groundmap: ['core', 'course', 'graphics', 'terrain', 'visual'],
  render: ['camera', 'core', 'course', 'graphics', 'groundmap', 'physics', 'terrain', 'vehicle', 'visual'],
  runtime: [
    'camera',
    'core',
    'course',
    'compiler',
    'gameplay',
    'groundmap',
    'input',
    'physics',
    'render',
    'terrain',
    'visual',
  ],
  dev: ['graphics'],
  browser: ['audio', 'camera', 'core', 'gameplay', 'graphics', 'groundmap', 'input', 'physics', 'render', 'vehicle'],
};

test('engine ownership follows an acyclic dependency direction, including type imports', async () => {
  const graph = new Map();
  for (const file of await collectFiles(sourceRoot, ['.ts'])) {
    const relative = path.relative(sourceRoot, file);
    const layer = relative.split(path.sep)[0];
    if (!relative.includes(path.sep)) continue;
    assert.ok(Object.hasOwn(layerDependencies, layer), `unowned layer: ${layer}`);
    const targets = graph.get(layer) ?? new Set();
    graph.set(layer, targets);
    const syntax = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      const ref =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined;
      if (ref && ts.isStringLiteral(ref) && ref.text.startsWith('.')) {
        const target = path.relative(sourceRoot, path.resolve(path.dirname(file), ref.text)).split(path.sep)[0];
        if (target !== layer) {
          assert.ok(layerDependencies[layer].includes(target), `${relative} imports ${target}`);
          targets.add(target);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  const complete = new Set();
  function visit(layer, trail = []) {
    assert.ok(!trail.includes(layer), `layer cycle: ${[...trail, layer].join(' -> ')}`);
    if (complete.has(layer)) return;
    for (const target of graph.get(layer) ?? []) visit(target, [...trail, layer]);
    complete.add(layer);
  }
  for (const layer of graph.keys()) visit(layer);
});
