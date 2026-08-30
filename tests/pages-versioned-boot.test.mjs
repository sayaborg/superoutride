import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Pages boot resolves all three top-level compositions through one commit-versioned ESM path', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

  assert.match(index, /const entryName = 'boot\.js'/);
  assert.match(index, /const fallbackEntry = `\.\/dist\/\$\{entryName\}`/);
  assert.match(index, /fetch\(`\.\/version\.txt\?t=\$\{Date\.now\(\)\}`/);
  assert.match(index, /\.\/build\/\$\{version\}\/\$\{entryName\}/);
  assert.match(workflow, /BUILD_ID="\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /cp -R dist\/\. "_site\/build\/\$\{BUILD_ID\}\/"/);
  assert.match(workflow, /printf '%s\\n' "\$\{BUILD_ID\}" > _site\/version\.txt/);
  assert.match(workflow, /cp -R dist _site\/dist/);
});

test('visible Pages milestone labels match the package milestone', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const [, milestoneMajor, milestoneMinor] = packageJson.version.split('.');
  const milestone = `M${milestoneMajor}.${milestoneMinor}`;
  const [index, hud, linear, branching, circuit] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/browser/vehicle-debug-hud.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-linear.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main-circuit.ts', import.meta.url), 'utf8'),
  ]);

  assert.ok(index.includes(milestone), `index.html must show ${milestone}`);
  assert.ok(hud.includes(milestone), `shared HUD must show ${milestone}`);
  for (const [name, source] of [['LINEAR', linear], ['BRANCHING', branching], ['CIRCUIT', circuit]]) {
    assert.match(source, /drawVehicleDebugHud\(/, `${name} must use the shared HUD`);
  }
});
