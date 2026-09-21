import { readFile, writeFile, unlink } from 'node:fs/promises';
import ts from 'typescript';

/** Disposable experiment instrumentation: substitute only the ground-row body, never product source.
 * Camera, terrain generation, BG, ordinary Painter, sprites and frame observations stay byte-identical.
 */
export async function loadWholePlaneTrialRenderer() {
  const sourceUrl = new URL('../../dist/render/renderer.js', import.meta.url);
  const outputUrl = new URL(`../../dist/render/band-trial-renderer-${process.pid}.js`, import.meta.url);
  const text = await readFile(sourceUrl, 'utf8');
  const parsed = ts.createSourceFile(sourceUrl.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = parsed.statements.filter((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'drawTerrainLine');
  if (matches.length !== 1) throw new Error('Expected exactly one ordinary ground-row owner');
  const fn = matches[0];
  if (fn.parameters.map((p) => p.name.getText(parsed)).join(',') !== 'target,line,groundProfile,ground,out')
    throw new Error('Ground-row instrumentation contract changed');
  const first = fn.body.getStart(parsed),
    last = fn.body.end;
  const body = '{\n    return ground.drawRow(target, line, groundProfile, out);\n}';
  const instrumented = text.slice(0, first) + body + text.slice(last);
  await writeFile(outputUrl, instrumented, { flag: 'wx' });
  try {
    return { renderer: await import(outputUrl.href), source: text, instrumented };
  } finally {
    await unlink(outputUrl);
  }
}
