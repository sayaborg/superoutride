/**
 * The footage tool: `npm run footage -- <command>` ([Development](../../docs/development.md#footage-commands)). Each
 * command prints one JSON result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { reportError, requireInput } from '../course/authoring-io.js';
import { writeFakeFootage } from './fake-footage.js';

const [command, ...rest] = process.argv.slice(2);
/** Options as `--name value...`: every value up to the next option. */
function parse(args: readonly string[]) {
  const options = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const arg of args)
    if (arg.startsWith('--')) options.set(arg, (current = []));
    else {
      requireInput(current, '/arguments', `Unexpected argument ${arg}`);
      current.push(arg);
    }
  return options;
}

try {
  const options = parse(rest);
  const root = path.resolve(options.get('--out')?.[0] ?? 'reference-media');
  switch (command) {
    case 'fake': {
      const written = await writeFakeFootage(root, options.get('--video') ?? [], {
        seconds: Number(options.get('--seconds')?.[0] ?? Infinity),
        exact: Number(options.get('--exact')?.[0] ?? 0),
        encode: !options.has('--no-video'),
      });
      console.log(JSON.stringify({ ok: true, written }));
      break;
    }
    default:
      requireInput(false, '/arguments', `Unknown footage command ${command ?? ''}`);
  }
} catch (error) {
  reportError(error);
}
