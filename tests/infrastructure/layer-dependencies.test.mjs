import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceRoot = path.join(repositoryRoot, 'src');
const toolRoot = path.join(repositoryRoot, 'tools');
const relativePath = (file) => path.relative(repositoryRoot, file).split(path.sep).join('/');

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(target)));
    else if (entry.isFile() && /\.(?:[cm]?[jt]s|tsx|html)$/.test(entry.name)) files.push(target);
  }
  return files;
}

// Lower domains precede their consumers. Imports within one domain are unrestricted.
const layers = ['core', 'image', 'audio', 'course', 'vehicle', 'input', 'race', 'view', 'shell'];
const rank = new Map(layers.map((layer, index) => [layer, index]));

function layerOf(relative) {
  const layer = relative.split('/')[1];
  assert.ok(rank.has(layer), `unowned layer: ${relative}`);
  return layer;
}

function moduleReferences(file, text) {
  if (file.endsWith('.html')) {
    const references = new Set();
    // Extract script containers only; module dependencies inside them are parsed as JavaScript.
    for (const [, attributes, body] of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const src = attributes.match(/(?:^|\s)src\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (src) references.add(src);
      else for (const ref of moduleReferences(`${file}.mjs`, body)) references.add(ref);
    }
    return [...references];
  }
  const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const references = new Set();
  function visit(node) {
    let ref;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ref = node.moduleSpecifier;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) ref = node.argument.literal;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      ref = node.moduleReference.expression;
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      ref = node.arguments[0];
    else if (
      (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Worker') ||
      (ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'addModule')
    ) {
      const entry = node.arguments?.[0];
      ref =
        entry && ts.isNewExpression(entry) && ts.isIdentifier(entry.expression) && entry.expression.text === 'URL'
          ? entry.arguments?.[0]
          : entry;
    }
    if (ref && ts.isStringLiteralLike(ref)) references.add(ref.text);
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return [...references];
}

function dependencyTarget(file, ref, options) {
  if (ref.startsWith('.') || ref.startsWith('/') || ref.startsWith('file:'))
    return relativePath(fileURLToPath(new URL(ref, pathToFileURL(file))));
  const resolved = ts.resolveModuleName(ref, file, options, ts.sys).resolvedModule;
  return resolved ? relativePath(resolved.resolvedFileName) : null;
}

function checkDirection(from, to) {
  const edge = `${from} -> ${to}`;
  if (from.startsWith('src/')) {
    assert.ok(!to.startsWith('tools/'), `product depends on authoring: ${edge}`);
    if (to.startsWith('src/')) {
      const source = layerOf(from),
        target = layerOf(to);
      assert.ok(source === target || rank.get(target) < rank.get(source), `upward domain dependency: ${edge}`);
    }
  }
  // Tools share race and view compositions, never the browser shell; browser tools may use its DOM
  // lookup, and the audio audition tools' shell controls remain until their own reorganization.
  if (from.startsWith('tools/') && !from.startsWith('tools/audio/'))
    assert.ok(!to.startsWith('src/shell/') || /^src\/shell\/dom\.[jt]s$/.test(to), `tool depends on shell: ${edge}`);
  assert.ok(!to.startsWith('dist/'), `source imports delivery output: ${edge}`);
}

test('module discovery includes type imports, re-exports, dynamic imports and worker entries', () => {
  const text = `
    import type { A } from './a.js';
    export type { B } from './b.js';
    type C = import('./c.js').C;
    const d = import('./d.js');
    const e = require('./e.cjs');
    import f = require('./f.cjs');
    new Worker(new URL('./worker.ts', import.meta.url));
    context.audioWorklet.addModule(new URL('./processor.js', import.meta.url));
    new URL('../../dist/content/', import.meta.url);
    // import './not-a-dependency.js';
  `;
  assert.deepEqual(moduleReferences('fixture.ts', text), [
    './a.js',
    './b.js',
    './c.js',
    './d.js',
    './e.cjs',
    './f.cjs',
    './worker.ts',
    './processor.js',
  ]);
});

test('HTML tool scripts include inline imports, module sources and worklet entries', () => {
  const text = `<script type="module" src="./external.mjs"></script>
    <script type="module">import './inline.js';
      context.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));</script>`;
  assert.deepEqual(moduleReferences('fixture.html', text), ['./external.mjs', './inline.js', './worklet.js']);
});

test('root and layer direction rejects inverse dependencies without broad exemptions', () => {
  assert.throws(() => checkDirection('src/core/a.ts', 'tools/build/b.ts'), /product depends on authoring/);
  assert.throws(() => checkDirection('src/core/a.ts', 'src/image/b.ts'), /upward domain dependency/);
  assert.throws(() => checkDirection('tools/build/a.ts', 'dist/core/b.js'), /source imports delivery output/);
  assert.throws(() => checkDirection('src/image/a.ts', 'dist/core/b.js'), /source imports delivery output/);
  assert.throws(() => checkDirection('tools/graphics/a.ts', 'dist/core/b.js'), /source imports delivery output/);
  assert.throws(() => checkDirection('tools/audio/a.ts', 'dist/core/b.js'), /source imports delivery output/);
  assert.doesNotThrow(() => checkDirection('tools/build/a.ts', 'src/core/b.ts'));
  assert.throws(() => checkDirection('tools/course/a.ts', 'src/shell/b.ts'), /tool depends on shell/);
  assert.doesNotThrow(() => checkDirection('tools/graphics/a.ts', 'src/shell/dom.ts'));
  assert.doesNotThrow(() => checkDirection('src/image/a.ts', 'src/core/b.ts'));
});

test('engine and authoring dependencies follow their declared directions, including type imports', async () => {
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
  for (const root of [sourceRoot, toolRoot]) {
    const configPath = path.join(repositoryRoot, root === sourceRoot ? 'tsconfig.json' : 'tsconfig.tools.json');
    const config = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) =>
          assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
      },
    );
    assert.ok(config, 'dependency resolution has a valid TypeScript configuration');
    for (const file of await collectFiles(root)) {
      const from = relativePath(file);
      for (const ref of moduleReferences(file, await readFile(file, 'utf8'))) {
        const to = dependencyTarget(file, ref, config.options);
        if (!to) continue;
        checkDirection(from, to);
        if (from.startsWith('src/') && to.startsWith('src/')) {
          const source = layerOf(from),
            target = layerOf(to);
          if (source === target) continue;
          const targets = graph.get(source) ?? new Set();
          targets.add(target);
          graph.set(source, targets);
        }
      }
    }
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
