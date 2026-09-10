import ts from 'typescript';

/** Inspect calls structurally so formatting is not mistaken for architectural behavior. */
export function callsTo(source, name) {
  const ast = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      calls.push(node.arguments.map((argument) => argument.getText(ast)));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return calls;
}
