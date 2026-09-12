import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

// Regression/diagnostic modules may be outside production reachability, but must have a consumer.
const isRegressionSource = (file) => /[\/]src[\/]dev[\/](?:fixtures|diagnostics)[\/]/.test(file);

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
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'URL' &&
        node.arguments?.length === 2 &&
        node.arguments[1].getText(syntax) === 'import.meta.url' &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text.endsWith('.js')
      ) {
        dependencies.push(path.resolve(path.dirname(file), node.arguments[0].text).replace(/\.js$/, '.ts'));
      }
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
    unreachable.filter((file) => !isRegressionSource(file)).map((file) => path.relative(repositoryRoot, file)),
    [],
    'unreachable source modules',
  );
  // Test/build consumers must still exercise each fixture and diagnostic.
  for (const file of tests) visit(file);
  for (const file of sourceFiles.filter(isRegressionSource)) {
    assert.ok(reached.has(file), `unused regression source: ${path.relative(repositoryRoot, file)}`);
  }
  for (const file of sourceFiles.filter((file) => file.includes(`${path.sep}dev${path.sep}courses${path.sep}`))) {
    for (const dependency of graph.get(file) ?? []) {
      assert.ok(!isRegressionSource(dependency), `shipped content imports regression source: ${file}`);
    }
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

test('entry documents use the sole specification index and its current restart checkpoint', async () => {
  const index = path.join(repositoryRoot, 'docs/README.md');
  for (const entry of ['AGENTS.md', 'README.md']) {
    const source = await readFile(path.join(repositoryRoot, entry), 'utf8');
    const targets = documentReferences(source).map((ref) => path.resolve(repositoryRoot, path.dirname(entry), ref));
    assert.ok(targets.includes(index), `${entry} lacks specification index`);
  }
  const indexSource = await readFile(index, 'utf8');
  const targets = documentReferences(indexSource).map((ref) => path.resolve(path.dirname(index), ref));
  assert.ok(targets.includes(path.join(repositoryRoot, currentHandoff)), 'index lacks current checkpoint');
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

// Import direction includes type-only contracts: a reader is owned by its consumer.
const layerDependencies = {
  core: [],
  graphics: ['core'],
  course: ['core'],
  input: ['core'],
  physics: ['core', 'course', 'input'],
  audio: ['core'],
  vehicle: ['physics', 'audio'],
  camera: ['core', 'physics'],
  gameplay: ['core', 'input', 'physics'],
  visual: ['core', 'course', 'graphics'],
  road: ['core', 'course', 'visual'],
  groundmap: ['core', 'course', 'graphics', 'road'],
  render: ['camera', 'core', 'course', 'graphics', 'groundmap', 'physics', 'road', 'vehicle', 'visual'],
  runtime: ['core', 'course', 'gameplay', 'groundmap', 'input', 'physics', 'render', 'road', 'visual'],
  browser: ['audio', 'camera', 'core', 'gameplay', 'graphics', 'input', 'physics', 'render', 'vehicle'],
};

test('engine ownership follows an acyclic dependency direction, including type imports', async () => {
  const graph = new Map();
  for (const file of await collectFiles(sourceRoot, ['.ts'])) {
    const relative = path.relative(sourceRoot, file);
    const layer = relative.split(path.sep)[0];
    if (layer === 'dev' || !relative.includes(path.sep)) continue;
    assert.ok(Object.hasOwn(layerDependencies, layer), `unowned layer: ${layer}`);
    const targets = graph.get(layer) ?? new Set();
    graph.set(layer, targets);
    const syntax = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      const ref =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
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

// Resolve JavaScript consumers against source symbols rather than an old dist build or matching name strings.
test('every source export has a named consumer outside its defining module', async () => {
  const sourceFiles = await collectFiles(sourceRoot, ['.ts']);
  const consumerFiles = [
    ...(await collectFiles(path.join(repositoryRoot, 'tests'), ['.mjs'])),
    ...(await collectFiles(path.join(repositoryRoot, 'tools'), ['.mjs'])),
  ];
  const virtual = new Map();
  for (const file of [
    path.join(repositoryRoot, 'index.html'),
    ...(await collectFiles(path.join(repositoryRoot, 'tools'), ['.html'])),
  ]) {
    const text = await readFile(file, 'utf8');
    for (const [index, match] of [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
      virtual.set(`${file}.${index}.mjs`, match[1]);
    }
  }
  const options = {
    allowJs: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile,
    exists = host.fileExists;
  host.readFile = (file) => virtual.get(file) ?? read(file);
  host.fileExists = (file) => virtual.has(file) || exists(file);
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      const source = path
        .resolve(path.dirname(containingFile), name)
        .replace(`${path.sep}dist${path.sep}`, `${path.sep}src${path.sep}`)
        .replace(/\.js$/, '.ts');
      return name.startsWith('.') && host.fileExists(source)
        ? { resolvedFileName: source, extension: ts.Extension.Ts }
        : ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
    });
  const files = [...sourceFiles, ...consumerFiles, ...virtual.keys()];
  const program = ts.createProgram(files, options, host);
  const checker = program.getTypeChecker();
  const consumers = new Set();
  const unalias = (symbol) =>
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  for (const file of files) {
    const syntax = program.getSourceFile(file);
    function visit(node) {
      if (ts.isIdentifier(node)) {
        const symbol = unalias(checker.getSymbolAtLocation(node));
        if (symbol?.declarations?.some((declaration) => declaration.getSourceFile().fileName !== file))
          consumers.add(symbol);
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  const unused = [];
  for (const file of sourceFiles) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file));
    if (!module) continue;
    for (const symbol of checker.getExportsOfModule(module)) {
      if (!consumers.has(unalias(symbol))) unused.push(`${path.relative(repositoryRoot, file)}: ${symbol.name}`);
    }
  }
  assert.deepEqual(unused, [], 'keep unconsumed declarations module-local; remove unused implementations');
});
