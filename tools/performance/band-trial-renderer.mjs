import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

/** Disposable offline substitution of the ground primitive, preserving the surrounding renderer verbatim.
 * No product source is edited, no private export is added, and no GroundBase path is retained in the trial.
 */
export async function loadBandTrialRenderer() {
  const url = new URL('../../dist/render/renderer.js', import.meta.url);
  const source = await readFile(url, 'utf8');
  const syntax = ts.createSourceFile(url.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const matches = syntax.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'drawTerrainLine',
  );
  if (matches.length !== 1 || !matches[0].body)
    throw new Error('Product terrain primitive is not uniquely identifiable');
  const body = matches[0].body;
  const generated =
    source.slice(0, body.getStart(syntax)) +
    '{ return ground.drawLine(target, line, groundProfile, out); }' +
    source.slice(body.end);
  const output = new URL('../../dist/render/band-trial-renderer.js', import.meta.url);
  await writeFile(output, generated);
  return (await import(output.href)).renderDriving;
}
