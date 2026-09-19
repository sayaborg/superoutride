import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// This module has a narrower direct-import contract than the runtime directory.
// Check dependency structure, not helper names, comments or statement spelling.
test('declarative course compilation imports only its coordinate and route assembly owners', async () => {
  const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const file = path.join(sourceRoot, 'runtime', 'declarative-live-route.ts');
  const syntax = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const allowed = new Set(['core', 'gameplay', 'runtime']);
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
      dependencies.push(target);
    }
    ts.forEachChild(node, visit);
  }

  visit(syntax);
  assert.ok(dependencies.length > 0, 'the compiler boundary must remain under inspection');
});
