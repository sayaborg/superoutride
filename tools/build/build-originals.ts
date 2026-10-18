import { spawnSync } from 'node:child_process';
import { ORIGINALS_VARIABLE } from './originals.js';

/**
 * `npm run build:originals`: the build with the local originals in place of the published files of their paths
 * ([Development](../../docs/development.md#local-originals)). A CI build refuses it.
 */
const { status } = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, [ORIGINALS_VARIABLE]: '1' },
});
process.exit(status ?? 1);
