import { PNG } from 'pngjs';
import { createNodeContentStore } from './node-content-store.js';
import { reportError, requireInput } from '../course/authoring-io.js';
import { courseImageFile, importSpriteSource } from '../graphics/sprite-import.js';

/**
 * The sprite command: the workbench's sprite operations over `content/`. `import` makes a course image master from a
 * saved source and recipe (`content/sprite-sources/<name>.png` and `.json`) and writes it as its named file.
 */
const USAGE = 'Usage: npm run sprite -- import <name>';
const store = createNodeContentStore();

const [verb, subject, ...args] = process.argv.slice(2);
try {
  requireInput(verb === 'import' && subject && !args.length, '/arguments', USAGE);
  const { master } = await importSpriteSource(store, subject!, PNG);
  const file = courseImageFile(master);
  await store.write(file.path, file.bytes);
  console.log(JSON.stringify({ ok: true, image: `content/${file.path}`, name: master.name }));
} catch (error) {
  // An operation's or the PNG decoder's refusal is the caller's input error.
  reportError(
    error instanceof RangeError
      ? { diagnostics: [{ kind: 'tool', code: 'invalid_input', path: '/arguments', message: error.message }] }
      : error,
  );
}
