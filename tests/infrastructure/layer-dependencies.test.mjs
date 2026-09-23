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

// Lower domains precede their consumers. Imports within one domain are unrestricted.
const layers = ['core', 'image', 'audio', 'course', 'vehicle', 'input', 'race', 'view', 'shell'];
const rank = new Map(layers.map((layer, index) => [layer, index]));

// The remaining query-depth and combined physical/rendering sources are separated in 5-4f-2.
const deferredImports = new Set([
  'race/course-driving-session.ts -> view/camera.js',
  'race/course-driving-session.ts -> view/course-driving-view.js',
]);

function layerOf(relative) {
  const layer = relative.split('/')[0];
  assert.ok(relative.includes('/') && rank.has(layer), `unowned layer: ${relative}`);
  return layer;
}

test('engine ownership follows an acyclic dependency direction, including type imports', async () => {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  assert.deepEqual(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    [...layers].sort(),
    'src contains exactly the nine domain directories',
  );
  assert.ok(
    entries.every((entry) => entry.isDirectory()),
    'src has no root-level files',
  );
  const graph = new Map();
  const seenDeferredImports = new Set();
  for (const file of await collectFiles(sourceRoot, ['.ts'])) {
    const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
    const layer = layerOf(relative);
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
      if (ref && ts.isStringLiteralLike(ref) && ref.text.startsWith('.')) {
        const targetFile = path
          .relative(sourceRoot, path.resolve(path.dirname(file), ref.text))
          .split(path.sep)
          .join('/');
        const target = layerOf(targetFile);
        if (target !== layer) {
          const edge = `${relative} -> ${targetFile}`;
          if (deferredImports.has(edge)) {
            seenDeferredImports.add(edge);
          } else {
            assert.ok(rank.get(target) < rank.get(layer), `upward domain dependency: ${edge}`);
            // Known violations are excluded; every other dependency participates in cycle detection.
            targets.add(target);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  assert.deepEqual(seenDeferredImports, deferredImports, 'remove resolved deferred import exceptions');
  const complete = new Set();
  function visit(layer, trail = []) {
    assert.ok(!trail.includes(layer), `layer cycle: ${[...trail, layer].join(' -> ')}`);
    if (complete.has(layer)) return;
    for (const target of graph.get(layer) ?? []) visit(target, [...trail, layer]);
    complete.add(layer);
  }
  for (const layer of graph.keys()) visit(layer);
});
