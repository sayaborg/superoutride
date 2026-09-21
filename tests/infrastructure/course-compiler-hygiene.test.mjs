import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// This module has a narrower direct-import contract than the runtime directory.
// Check dependency structure, not helper names, comments or statement spelling.
for (const [entry, owners, restricted = {}] of [
  [
    'compiler/compiled-course.ts',
    ['core', 'course', 'compiler', 'visual'],
    { visual: ['visual/course-presentation.js'] },
  ],
  [
    'compiler/course-image-source.ts',
    ['core', 'course', 'graphics'],
    { graphics: ['graphics/sprite.js', 'graphics/tile-background-image.js'] },
  ],
  ['compiler/course-physical-content.ts', ['core', 'course', 'physics'], { physics: ['physics/surface-map.js'] }],
  ['compiler/course-physical-overlap.ts', ['course', 'compiler', 'physics'], { physics: ['physics/surface-map.js'] }],
  ['compiler/course-overlap-domain.ts', ['course', 'compiler']],
  ['compiler/course-consumer-demand.ts', ['course']],
  ['compiler/course-fork.ts', ['core', 'course', 'compiler', 'graphics'], { graphics: ['graphics/sprite.js'] }],
  [
    'compiler/course-presentation-overlap.ts',
    ['core', 'course', 'compiler', 'graphics', 'visual'],
    { graphics: ['graphics/sprite.js'], visual: ['visual/course-presentation.js'] },
  ],
  [
    'compiler/course-graph.ts',
    ['core', 'course', 'compiler', 'physics', 'visual'],
    { physics: ['physics/surface-map.js'], visual: ['visual/course-presentation.js'] },
  ],
  [
    'compiler/course-presentation.ts',
    ['core', 'course', 'compiler', 'graphics', 'visual'],
    {
      graphics: ['graphics/sprite.js', 'graphics/tile-background-image.js'],
      visual: ['visual/course-presentation.js'],
    },
  ],
  ['compiler/course-links.ts', ['core', 'course', 'compiler']],
  ['authoring/course-project.ts', ['course', 'compiler']],
  ['gameplay/physical-race-gate.ts', ['core', 'gameplay'], { gameplay: ['gameplay/world-crossing-gate.js'] }],
]) {
  test(`${entry} imports only its declared compiler domain owners`, async () => {
    const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
    const file = path.join(sourceRoot, entry);
    const syntax = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const allowed = new Set(owners);
    const dependencies = [];

    function visit(node) {
      let reference;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        reference = node.moduleSpecifier;
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        reference = node.arguments[0];
        assert.ok(reference && ts.isStringLiteral(reference), 'dynamic dependencies must be explicit');
      } else if (ts.isImportTypeNode(node)) {
        assert.ok(ts.isLiteralTypeNode(node.argument), 'type dependencies must be explicit');
        reference = node.argument.literal;
      }
      if (reference) {
        assert.ok(ts.isStringLiteral(reference), 'module dependency must be a string literal');
        assert.ok(reference.text.startsWith('.'), `external dependency: ${reference.text}`);
        const target = path.relative(sourceRoot, path.resolve(path.dirname(file), reference.text));
        const layer = target.split(path.sep)[0];
        assert.ok(allowed.has(layer), `course compiler directly imports ${target}`);
        if (restricted[layer])
          assert.ok(restricted[layer].includes(target), `${entry} imports forbidden domain ${target}`);
        dependencies.push(target);
      }
      ts.forEachChild(node, visit);
    }

    visit(syntax);
    assert.ok(dependencies.length > 0, 'the compiler boundary must remain under inspection');
  });
}
