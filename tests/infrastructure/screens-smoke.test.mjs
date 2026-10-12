import { PNG } from 'pngjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { loadTextTiles } from '../../src/content/text-tiles-catalog.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadCourseIndex } from '../../src/content/course-index.js';
import { loadSeriesCatalog } from '../../src/content/series-catalog.js';
import { loadScreenPictures } from '../../src/content/screen-picture-catalog.js';
import { loadFreePlayRules } from '../../src/content/free-play-rules.js';
import { loadMusic } from '../../src/content/recording-catalog.js';
import { createTextLayer, TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createSelectionFlow } from '../../src/shell/selection-flow.js';
import { openPlayerRecord } from '../../src/shell/player-record.js';

// The screens smoke: the front end's screens render headlessly through the same screens the page shows, from the
// delivered content. Each drawn frame is saved to `dist/screens/<name>.png` at twice the frame's size, as the reference
// mockups are drawn, for inspection by eye; no test compares their pixels.
test('the front end screens render from the delivered content', async () => {
  const content = await readDeliveredContent();
  const { vehicles, driving } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
  const pictures = await loadScreenPictures(content);
  const frame = createLogicalFrame();
  const text = createTextLayer(await loadTextTiles(content));
  // A fresh player record, kept in no storage.
  const player = openPlayerRecord(null);
  let screen = null;
  const flow = createSelectionFlow(
    {
      courses: await loadCourseIndex(content),
      series: await loadSeriesCatalog(content, vehicles, pictures),
      vehicles,
      driving,
      freePlay: await loadFreePlayRules(content),
      music: await loadMusic(content, TEXT_COLUMNS),
      player,
      dev: true,
    },
    {
      frame,
      text,
      present: () => {},
      show: (next) => (screen = next),
      activate: () => {},
      setVolume: () => {},
      audition: () => () => {},
      run: () => {},
    },
  );

  const directory = new URL('../../dist/screens/', import.meta.url);
  await mkdir(directory, { recursive: true });
  // Draw the current screen and save it at twice the frame's size, as the mockups are drawn.
  const capture = async (name) => {
    screen.render();
    assert.ok(
      frame.pixels.some((pixel) => pixel !== 0),
      `${name} drew nothing`,
    );
    const png = new PNG({ width: frame.width * 2, height: frame.height * 2 });
    for (let y = 0; y < png.height; y++)
      for (let x = 0; x < png.width; x++) {
        const { r, g, b } = unpackRgba(rgb555ToRgba(frame.pixels[(y >> 1) * frame.width + (x >> 1)]));
        png.data.set([r, g, b, 255], (y * png.width + x) * 4);
      }
    await writeFile(new URL(`${name}.png`, directory), PNG.sync.write(png));
  };
  const send = (...commands) => commands.forEach((command) => screen.command(command));

  flow.title();
  await capture('title');
  send('CONFIRM');
  await capture('select-mode');
  send('CONFIRM');
  await capture('select-series');
  send('CONFIRM');
  await capture('select-class');
});
