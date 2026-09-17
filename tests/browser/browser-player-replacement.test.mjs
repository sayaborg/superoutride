import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

for (const mode of ['linear', 'branching', 'circuit', 'fisco']) {
  test(`${mode}: loaded product retries failure, replaces vehicles before ticks, draws and shuts down`, async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--experimental-vm-modules', fileURLToPath(new URL('../helpers/product-root-probe.mjs', import.meta.url)), mode],
      { timeout: 30000 },
    );
    const result = JSON.parse(stdout.trim());
    assert.equal(result.mode, mode);
    assert.ok(result.frames >= 20);
    assert.equal(result.disposed, true);
    assert.deepEqual(result.replacements, ['RC30', 'F110']);
  });
}
