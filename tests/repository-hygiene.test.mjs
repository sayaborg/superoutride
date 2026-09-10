import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
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

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

// These modules are retained executable regression inputs, not production validators.
// Keep each exemption named: importing a new general module from a test never makes it live.
const regressionOnlyModules = new Map([
  ['src/dev/driving-input-trace.ts', 'Recorded input schedules for causal control regressions'],
  ['src/dev/m3-debug-height-profile.ts', 'Fixed hill/dip source for renderer and route regressions'],
  ['src/dev/m3-debug-visual.ts', 'Fixed transparent/cliff visual source'],
  ['src/dev/m5-debug-surface-map.ts', 'Fixed material transitions for contact tests'],
  ['src/dev/m6-18-stage-road-views.ts', 'Focused stage-local road projection fixture'],
  ['src/dev/m6-19-stage-runtime-content.ts', 'Stage registry ownership fixture'],
  ['src/dev/m6-20-live-runtime-content.ts', 'Focused single-fork registry fixture'],
  ['src/dev/m6-20-live-point-to-point.ts', 'Focused single-fork route assembly'],
  ['src/dev/m6-23-child-environment-content.ts', 'Child environment continuation fixture'],
  ['src/dev/m6-23-live-runtime-content.ts', 'Child environment registry fixture'],
  ['src/dev/m6-24-live-runtime-content.ts', 'Declarative environment registry fixture'],
  ['src/dev/m6-28-declarative-live-route.ts', 'Minimal declarative route fixture'],
  ['src/dev/m6-35-second-live-fork.ts', 'Focused left second-fork fixture'],
  ['src/dev/m6-37-symmetric-right-second-live-fork.ts', 'Focused right second-fork fixture'],
  ['src/dev/m6-43-course-mode.ts', 'Route-mode contract fixture'],
  ['src/dev/m6-51-circuit-live-runtime.ts', 'Stadium finite circuit fixture'],
  ['src/dev/m6-54-circuit-multi-actor.ts', 'Stadium multi-actor race fixture'],
  ['src/dev/m6-debug-route-boundary-gates.ts', 'Minimal physical route-gate fixture'],
  ['src/dev/m6-debug-route-dag.ts', 'Minimal route graph fixture'],
  ['src/dev/m6-debug-route-stage-content.ts', 'Minimal stage manifest fixture'],
  ['src/dev/m9-1-low-mid-speed-mountain-circuit.ts', 'Fixed mountain handling acceptance course'],
  ['src/dev/vehicle-telemetry.ts', 'Read-only diagnostic telemetry, also used by offline probes'],
]);

test('every source module is reachable from a composition/build/tool entry or an explicit regression fixture', async () => {
  const sourceFiles = await collectFiles(sourceRoot, ['.ts']);
  const toolFiles = await collectFiles(path.join(repositoryRoot, 'tools'), ['.mjs', '.html']);
  const tests = await collectFiles(path.join(repositoryRoot, 'tests'), ['.mjs']);
  const graph = new Map();
  for (const file of [...sourceFiles, ...toolFiles.filter((file) => file.endsWith('.mjs')), ...tests]) {
    const source = await readFile(file, 'utf8');
    const dependencies = [];
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visitSyntax(node) {
      const reference =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;
      if (reference && ts.isStringLiteral(reference) && reference.text.startsWith('.')) {
        dependencies.push(
          path
            .resolve(path.dirname(file), reference.text)
            .replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`)
            .replace(/\.js$/, '.ts'),
        );
      }
      ts.forEachChild(node, visitSyntax);
    }
    visitSyntax(syntax);
    graph.set(file, dependencies);
  }
  const reached = new Set();
  function visit(file) {
    if (reached.has(file)) return;
    reached.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
  }
  // Dynamic boot selection deliberately assembles exactly these browser roots.
  for (const relative of ['src/boot.ts', 'src/main.ts', 'src/main-linear.ts', 'src/main-circuit.ts']) {
    visit(path.join(repositoryRoot, relative));
  }
  for (const tool of toolFiles) visit(tool);
  const unreachable = sourceFiles.filter((file) => !reached.has(file));
  assert.deepEqual(
    unreachable.map((file) => path.relative(repositoryRoot, file)).filter((file) => !regressionOnlyModules.has(file)),
    [],
    'unreachable source modules',
  );
  // Regression exemptions must themselves still exist and have a test or diagnostic consumer.
  for (const file of tests) visit(file);
  for (const [file, reason] of regressionOnlyModules) {
    assert.ok(await pathExists(path.join(repositoryRoot, file)), `stale fixture exemption: ${file}`);
    assert.ok(reason.length > 0);
    assert.ok(reached.has(path.join(repositoryRoot, file)), `unused exempt fixture: ${file}`);
  }
});

// Discover all maintained documents: a new topic must not escape link/encoding checks.
const currentHandoff = 'docs/NEXT.md';
async function currentDocuments() {
  return [
    'AGENTS.md',
    'README.md',
    ...(await collectFiles(path.join(repositoryRoot, 'docs'), ['.md'])),
    ...(await collectFiles(sourceRoot, ['.md'])),
  ].map((file) => path.resolve(repositoryRoot, file));
}
function documentReferences(source) {
  return [...source.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref))
    .map((ref) => ref.split(/[?#]/)[0])
    .filter(Boolean);
}

test('all maintained Markdown has valid UTF-8 and existing local link targets', async () => {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const missing = [];
  for (const file of await currentDocuments()) {
    const source = decoder.decode(await readFile(file));
    assert.doesNotMatch(source, /\uFFFD/, `encoding damage: ${file}`);
    for (const reference of documentReferences(source)) {
      const target = path.resolve(path.dirname(file), reference);
      if (!(await pathExists(target))) missing.push(`${path.relative(repositoryRoot, file)}: ${reference}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every entry points directly to the sole current restart checkpoint', async () => {
  for (const entry of ['AGENTS.md', 'README.md', 'docs/README.md']) {
    const source = await readFile(path.join(repositoryRoot, entry), 'utf8');
    const targets = documentReferences(source).map((ref) => path.resolve(repositoryRoot, path.dirname(entry), ref));
    assert.ok(targets.includes(path.join(repositoryRoot, currentHandoff)), `${entry} lacks restart link`);
  }
  const source = await readFile(path.join(repositoryRoot, currentHandoff), 'utf8');
  assert.match(source, /DEV_UNCALIBRATED/);
  assert.doesNotMatch(
    source,
    /sandbox:|\/mnt\/data\/|\/private\/tmp\/|file_[0-9a-f]{16,}/,
    'restart must not require a former session directory or attachment',
  );
});

test('general engine source remains independent of development milestone names', async () => {
  for (const file of await collectFiles(sourceRoot, ['.ts'])) {
    const relative = path.relative(sourceRoot, file);
    if (relative.startsWith('dev/') || /^main(?:-.*)?\.ts$/.test(relative)) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bM[0-9]+(?:[._][0-9]+)?\b/, relative);
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isIdentifier(node)) assert.doesNotMatch(node.text, /^(?:[a-z]+)?M[0-9]/, relative);
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
});
