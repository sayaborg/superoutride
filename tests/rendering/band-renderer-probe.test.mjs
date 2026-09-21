import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { loadWholePlaneTrialRenderer } from '../../tools/performance/band-renderer-probe.mjs';

function exceptGroundBody(text) {
  const file = ts.createSourceFile('renderer.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const owners = file.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'drawTerrainLine');
  assert.equal(owners.length, 1);
  const body = owners[0].body;
  return { rest: text.slice(0, body.getStart(file)) + text.slice(body.end), body: body.getText(file) };
}

test('whole-plane experiment keeps every non-ground renderer byte and exposes no extra product export', async () => {
  const original = await readFile('dist/render/renderer.js', 'utf8');
  const { renderer: module, instrumented } = await loadWholePlaneTrialRenderer();
  assert.ok(!(await readdir('dist/render')).some((name) => name.startsWith('band-trial-renderer-')));
  const before = exceptGroundBody(original),
    after = exceptGroundBody(instrumented);
  assert.equal(after.rest, before.rest);
  assert.equal(after.body, '{\n    return ground.drawRow(target, line, groundProfile, out);\n}');
  assert.equal(typeof module.renderDriving, 'function');
  assert.deepEqual(Object.keys(module).sort(), ['createRenderWorkspace', 'renderDriving']);
  assert.equal(await readFile('dist/render/renderer.js', 'utf8'), original);
});
