import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import ts from 'typescript';
import { readSpriteLodAsset } from '../../dist/graphics/sprite.js';

test('built Sprite LOD preview resolves every module within the same complete build', async () => {
  const file = fileURLToPath(new URL('../../dist/tools/graphics/sprite-lod.mjs', import.meta.url));
  const source = await readFile(file, 'utf8');
  const build = fileURLToPath(new URL('../../dist/', import.meta.url));
  assert.doesNotMatch(source, /\.\.\/\.\.\/dist\//);
  for (const match of source.matchAll(/from '([^']+)'/g)) {
    const path = resolve(dirname(file), match[1]);
    assert.ok(path.startsWith(build));
    assert.ok((await readFile(path, 'utf8')).length > 0);
  }
  const html = await readFile(new URL('../../dist/tools/graphics/sprite-lod.html', import.meta.url), 'utf8');
  assert.match(html, /src="sprite-lod\.mjs"/);
  const sample = readSpriteLodAsset(
    JSON.parse(await readFile(new URL('../../dist/tools/graphics/sprite-lod-linear.json', import.meta.url), 'utf8')),
  );
  assert.ok(sample.levels.length > 1);
  assert.equal(sample.levels[1].paletteRgb555.length, 16);
  assert.doesNotMatch(html, /encoded-srgb|sprite-lod-encoded/);
});

test('published Sprite Tool keeps its transitive modules and decoder in the same complete build', async () => {
  const root = fileURLToPath(new URL('../../dist/', import.meta.url));
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.ok(file.startsWith(root), 'editor import escaped its versioned build');
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\.\.\/\.\.\/dist\//);
    const references = [];
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function imports(node) {
      const reference =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;
      if (reference) {
        assert.ok(ts.isStringLiteral(reference), 'editor dependencies must be statically identified');
        references.push(reference.text);
      }
      ts.forEachChild(node, imports);
    }
    imports(syntax);
    for (const reference of references) {
      assert.ok(reference.startsWith('.'), 'no bare or remote runtime dependency');
      await visit(resolve(dirname(file), reference));
    }
  }
  const folder = join(root, 'tools/graphics');
  await visit(join(folder, 'sprite-tool.mjs'));
  const html = await readFile(join(folder, 'sprite-tool.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g))
    assert.ok((await readFile(resolve(folder, match[1]))).length > 0);
  assert.ok(visited.has(join(folder, 'png-codec.mjs')));
  assert.ok((await readFile(join(folder, 'png-codec-LICENSE.txt'), 'utf8')).includes('MIT'));
  assert.ok((await readFile(join(folder, 'sprite-source-example.png'))).length > 0);
});

test('actual Pages staging binds HTML to immutable CSS, retaining the complete build and local fallback', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'outride-pages-style-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const [index, styles, workflow] = await Promise.all(
    ['index.html', 'styles.css', '.github/workflows/pages.yml'].map((path) =>
      readFile(new URL(`../../${path}`, import.meta.url), 'utf8'),
    ),
  );
  await writeFile(join(root, 'index.html'), index);
  await writeFile(join(root, 'styles.css'), styles);
  await mkdir(join(root, 'dist', 'audio'), { recursive: true });
  await writeFile(join(root, 'dist', 'boot.js'), 'export {};');
  await writeFile(join(root, 'dist', 'audio', 'voice.js'), 'export const voice = 1;');
  await mkdir(join(root, '.test-assets'));
  await writeFile(join(root, '.test-assets', 'stadium-ground-map.bin'), 'test-only');
  const stage = workflow
    .split('      - name: Stage static site\n')[1]
    .split('      - name: Setup Pages')[0]
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^          /, ''))
    .join('\n');
  const sha = '1234567890abcdef1234567890abcdef12345678';
  execFileSync('bash', ['-eu', '-c', stage], { cwd: root, env: { ...process.env, GITHUB_SHA: sha } });
  const published = await readFile(join(root, '_site', 'index.html'), 'utf8');
  assert.ok(published.includes(`href="./build/${sha}/styles.css"`));
  assert.ok(!published.includes('href="./styles.css"'));
  assert.ok(index.includes('href="./styles.css"'), 'local source still works without deployment');
  assert.equal(await readFile(join(root, '_site', 'build', sha, 'styles.css'), 'utf8'), styles);
  assert.equal(
    await readFile(join(root, '_site', 'build', sha, 'audio', 'voice.js'), 'utf8'),
    'export const voice = 1;',
  );
  assert.equal(await readFile(join(root, '_site', 'dist', 'boot.js'), 'utf8'), 'export {};');
  assert.equal((await readFile(join(root, '_site', 'version.txt'), 'utf8')).trim(), sha);
  const files = await readdir(join(root, '_site'), { recursive: true });
  assert.ok(files.every((path) => !path.includes('stadium-ground-map') && !path.includes('.test-assets')));
});

test('Pages boot resolves all three top-level compositions through one commit-versioned ESM path', async () => {
  const index = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');

  assert.match(index, /const entryName = 'boot\.js'/);
  assert.match(index, /const fallbackEntry = `\.\/dist\/\$\{entryName\}`/);
  assert.match(index, /fetch\(`\.\/version\.txt\?t=\$\{Date\.now\(\)\}`/);
  assert.match(index, /\.\/build\/\$\{version\}\/\$\{entryName\}/);
  assert.match(workflow, /BUILD_ID="\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /cp -R dist\/\. "_site\/build\/\$\{BUILD_ID\}\/"/);
  assert.match(workflow, /printf '%s\\n' "\$\{BUILD_ID\}" > _site\/version\.txt/);
  assert.match(workflow, /cp -R dist _site\/dist/);
});
