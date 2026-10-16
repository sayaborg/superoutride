import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from '../course/authoring-io.js';
import { compileTextTiles, TEXT_PALETTES } from '../../src/image/text-tiles.js';
import { createTextLayer } from '../../src/view/text-layer.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { halveRgb555 } from '../../src/image/rgb555.js';
import { FOOTAGE_MODEL_FORMAT, type ColorRole, type FootageModel } from './footage-model.js';
import { FAKE_CAMERA, FAKE_GAME } from './fake-plan.js';
import { FAKE_HUD } from './fake-footage.js';

/**
 * What a person writes after looking at the fake original's frames, as for any original: its colors' roles, its HUD's
 * places, its masks and its HUD templates. The fake original's ground colors are OUTRUN TEST's own (the truth course's
 * Strips): each is listed here with the role a person sees it play.
 */
const ROLES: readonly (readonly [hex: number, roles: readonly ColorRole[]])[] = [
  // Asphalt, light and dark; wet asphalt and its reflections; dirt and its ruts on the road.
  [13742, ['road']],
  [14799, ['road']],
  [7435, ['road']],
  [14869, ['road']],
  [17832, ['road']],
  [13638, ['road']],
  // Lines (the same white as a white rumble stripe) and rumble strips.
  [30653, ['line', 'rumble']],
  [27846, ['rumble']],
  [17969, ['rumble']],
  [31710, ['rumble']],
  [12685, ['rumble']],
  // Verges.
  [29490, ['verge']],
  [30548, ['verge']],
  [20014, ['verge']],
  [21072, ['verge']],
  [11879, ['verge']],
  [20082, ['verge']],
  [21139, ['verge']],
  // COASTLINE's sea, surf and wet sand, and every stage's ground beyond its verges (FARMLAND's verge is its ground's green).
  [12936, ['ground', 'verge']],
  [13993, ['ground']],
  [4503, ['ground']],
  [5593, ['ground']],
  [28607, ['ground']],
  [24173, ['ground']],
  [13673, ['ground']],
  [14729, ['ground']],
  [26315, ['ground']],
  [27373, ['ground']],
  [28428, ['ground']],
  [26314, ['ground']],
  [13960, ['ground']],
  [11847, ['ground']],
  [17833, ['ground']],
  [15719, ['ground']],
  [15913, ['ground']],
  [16969, ['ground']],
  // The medians.
  [9830, ['median']],
  [11943, ['median']],
];

/** The fake original's footage model as a person drafts it, and its HUD templates. */
export async function writeFakeModelDraft(root: string) {
  const directory = path.join(root, FAKE_GAME);
  const cell = 8;
  const colors = ROLES.map(([rgb555, roles]) => ({ rgb555, roles }));
  // Shadows halve the ground they fall on.
  const shadows = new Map<number, ColorRole[]>();
  const templates = await hudTemplates();
  for (const { rgb555 } of colors) shadows.set(halveRgb555(rgb555), ['shadow']);
  const model: FootageModel = {
    ...FOOTAGE_MODEL_FORMAT,
    game: { name: 'FAKE OUTRUN TEST', edition: 'fake footage of OUTRUN TEST', cabinet: 'none' },
    frame: FAKE_CAMERA.frame,
    hud: {
      speed: {
        x: FAKE_HUD.speed.value.column * cell,
        y: FAKE_HUD.speed.value.row * cell,
        width: cell,
        height: cell,
        count: FAKE_HUD.speed.digits,
        advance: cell,
        ink: templates.ink.digits,
      },
      clock: {
        x: FAKE_HUD.time.value.column * cell,
        y: FAKE_HUD.time.value.row * cell,
        width: cell,
        height: cell,
        count: 3,
        advance: cell,
        ink: templates.ink.digits,
      },
      events: [
        { name: 'GO', kind: 'go', ...eventRow() },
        { name: 'TIME BONUS', kind: 'checkpoint', ...eventRow() },
        { name: 'GOAL', kind: 'goal', ...eventRow() },
      ],
    },
    masks: [
      { kind: 'hud', x: 0, y: FAKE_HUD.time.label.row * cell, width: FAKE_CAMERA.frame.width, height: cell },
      { kind: 'hud', x: 0, y: FAKE_HUD.event.row * cell, width: FAKE_CAMERA.frame.width, height: cell },
      { kind: 'hud', x: 0, y: FAKE_HUD.speed.value.row * cell, width: 10 * cell, height: cell },
      // The player and its shadow, wherever its weaving puts them.
      { kind: 'player', x: 104, y: 104, width: 104, height: FAKE_CAMERA.frame.height - 104 },
    ],
    colors: [...colors, ...[...shadows].map(([rgb555, roles]) => ({ rgb555, roles }))],
  };
  await atomicWrite(path.join(directory, 'footage-model.json'), JSON.stringify(model, null, 2) + '\n');
  await atomicWrite(
    path.join(directory, 'hud-templates.json'),
    JSON.stringify({ format: 'superoutride.footage-hud-templates', version: 1, ...templates.patterns }) + '\n',
  );
  return model;

  function eventRow() {
    return {
      x: 0,
      y: FAKE_HUD.event.row * cell,
      width: FAKE_CAMERA.frame.width,
      height: cell,
      ink: templates.ink.events,
    };
  }
}

/**
 * The HUD's glyphs as a person cuts them from frames: each digit's 8×8 ink (`#`) and ground (`.`), and each event's
 * ink across its row, written once with the text layer as the frames show them.
 */
async function hudTemplates() {
  const tiles = compileTextTiles(
    JSON.parse(await readFile(new URL('../../content/text-tiles/default.json', import.meta.url), 'utf8')),
  );
  const text = createTextLayer(tiles);
  const frame = createLogicalFrame();
  // The frame is cleared to magenta, which no glyph color is: every other value is ink.
  const GROUND = 0x7c1f;
  const draw = (write: () => void, x: number, width: number) => {
    frame.pixels.fill(GROUND);
    text.clear();
    write();
    text.draw(frame);
    return Array.from({ length: 8 }, (_, r) =>
      Array.from(frame.pixels.subarray(r * frame.width + x, r * frame.width + x + width)),
    );
  };
  const digitPixels = Object.fromEntries(
    [...'0123456789 '].map((digit) => [digit, draw(() => text.write(0, 0, digit, TEXT_PALETTES.WHITE), 0, 8)]),
  );
  const eventPixels = Object.fromEntries(
    ['GO', 'TIME BONUS', 'GOAL'].map((name) => [
      name,
      draw(
        () => text.write(Math.floor((40 - name.length) / 2), 0, name, TEXT_PALETTES.YELLOW),
        0,
        FAKE_CAMERA.frame.width,
      ),
    ]),
  );
  // Each ink color's letter: `a` for the first of the sorted ink colors, and so on; `.` is ground.
  const inkOf = (glyphs: Record<string, number[][]>) =>
    [...new Set(Object.values(glyphs).flat(2))].filter((value) => value !== GROUND).sort((a, b) => a - b);
  const patterns = (glyphs: Record<string, number[][]>, ink: readonly number[]) =>
    Object.fromEntries(
      Object.entries(glyphs).map(([name, rows]) => [
        name,
        rows.map((row) =>
          row.map((value) => (value === GROUND ? '.' : String.fromCharCode(97 + ink.indexOf(value)))).join(''),
        ),
      ]),
    );
  const ink = { digits: inkOf(digitPixels), events: inkOf(eventPixels) };
  return { patterns: { digits: patterns(digitPixels, ink.digits), events: patterns(eventPixels, ink.events) }, ink };
}
