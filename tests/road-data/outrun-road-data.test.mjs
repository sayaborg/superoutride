import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { readZip } from '../../tools/road-data/zip.ts';
import { assemblePrograms, interleave } from '../../tools/road-data/outrun-rom.ts';
import {
  paletteRgb555,
  pathOffset,
  pathTurn,
  readHeightTable,
  readSceneryType,
  readStage,
  stageLength,
} from '../../tools/road-data/outrun-road.ts';

// Road data readers on hand-made bytes: CI holds no ROM.

/** A zip archive of `files` ({name, data, deflate}), as an archiver writes one. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const body = deflate ? deflateRawSync(data) : Buffer.from(data);
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

test('a zip archive is read, stored and deflated, each file checked against its CRC-32', () => {
  const a = new Uint8Array([1, 2, 3, 4]),
    b = new Uint8Array(1000).map((_, i) => i % 7);
  const files = readZip(
    zip([
      { name: 'outrun/a.bin', data: a },
      { name: 'b.bin', data: b, deflate: true },
    ]),
  );
  assert.deepEqual([...files.keys()], ['a.bin', 'b.bin']);
  assert.deepEqual(files.get('a.bin').data, a);
  assert.deepEqual(files.get('b.bin').data, b);
  const broken = zip([{ name: 'a.bin', data: a }]);
  broken[30 + 'a.bin'.length] ^= 0xff;
  assert.throws(() => readZip(broken), /CRC-32/);
});

test('a program interleaves its even and odd ROMs, and a ROM set of other CRCs is refused', () => {
  assert.deepEqual(interleave(new Uint8Array([1, 3]), new Uint8Array([2, 4])), new Uint8Array([1, 2, 3, 4]));
  const files = new Map([['epr-10380b.133', { name: 'epr-10380b.133', crc: 0, data: new Uint8Array(0x10000) }]]);
  assert.throws(() => assemblePrograms(files), /epr-10380b\.133 is CRC 0x00000000/);
});

test('a palette word is RGB555: four bits a channel over its shared low bit', () => {
  // Grey 148, 156 and 247 in 8-bit levels: 18, 19 and 30 a channel.
  assert.equal(paletteRgb555(0x0999), (18 << 10) | (18 << 5) | 18);
  assert.equal(paletteRgb555(0x7999), (19 << 10) | (19 << 5) | 19);
  assert.equal(paletteRgb555(0x0fff), (30 << 10) | (30 << 5) | 30);
  assert.equal(paletteRgb555(0x1003), (7 << 10) | 0);
});

/** Big-endian writers into a program. */
const writer = (p) => ({
  word: (a, v) => {
    p[a] = (v >> 8) & 0xff;
    p[a + 1] = v & 0xff;
  },
  long: (a, v) => {
    p[a] = (v >>> 24) & 0xff;
    p[a + 1] = (v >> 16) & 0xff;
    p[a + 2] = (v >> 8) & 0xff;
    p[a + 3] = v & 0xff;
  },
});

/** Hand-made programs holding one stage, 0x3C, its path and height table 211. */
function programs() {
  const main = new Uint8Array(0x40000),
    sub = new Uint8Array(0x40000);
  const m = writer(main),
    s = writer(sub);
  const block = 0x30000;
  m.long(0xe528 + 0x3c * 4, block);
  // Colors: sky, centre line, lane lines, edges, surface, ground.
  const colorTables = [0x30100, 0x30110, 0x30120, 0x30130, 0x30140, 0x30150];
  colorTables.forEach((address, k) => m.long(block + 4 * k, address));
  [0x7999, 0x0999, 0x7999, 0x0999].forEach((w, i) => m.word(0x30140 + 2 * i, w));
  [0x7999, 0x0fff, 0x7999, 0x0fff].forEach((w, i) => m.word(0x30120 + 2 * i, w));
  m.long(block + 24, 0x30200);
  m.long(block + 28, 0x30300);
  m.long(block + 32, 0x30400);
  // Curves: straight from 0, left R60 from 100, straight from 300, then the end mark.
  [
    [0, 0, 1],
    [100, 60, 3],
    [300, 0, 1],
  ].forEach(([position, radius, kind], i) => {
    m.word(0x30200 + 6 * i, position);
    m.word(0x30200 + 6 * i + 2, radius);
    m.word(0x30200 + 6 * i + 4, kind);
  });
  m.word(0x30200 + 18, 0xffff);
  // A width toward 300 at speed −8, a height of table 211, then the end mark.
  [
    [50, 1, 300, -8],
    [120, 0, 211, 0],
  ].forEach((point, i) => point.forEach((v, k) => m.word(0x30300 + 8 * i + 2 * k, v & 0xffff)));
  m.word(0x30300 + 16, 0x7fff);
  // Scenery: three objects of type 5 from position 10.
  m.word(0x30400, 10);
  main[0x30402] = 3;
  main[0x30403] = 5;
  m.word(0x30404, 0x7fff);
  // The path: straight ahead to 100, then turning left by 1/60 rad a position.
  s.long(0x1224 + 0x3c * 4, 0x10000);
  for (let i = 0; i < 0x904; i++) {
    const angle = i <= 100 ? 0 : Math.min(i - 100, 200) / 60;
    s.word(0x10000 + 4 * i, Math.round(4096 * Math.cos(angle)) & 0xffff);
    s.word(0x10000 + 4 * i + 2, Math.round(4096 * Math.sin(angle)) & 0xffff);
  }
  // Height table 211: kind 0, step 3, factors 2 and 1, entries [0 ×6, 576, 576, −576 ×3, 0 ×6], then −1.
  s.long(0x220a + 211 * 4, 0x20000);
  sub.set([0, 3, 2, 1], 0x20000);
  [0, 0, 0, 0, 0, 0, 576, 576, -576, -576, -576, 0, 0, 0, 0, 0, 0, -1].forEach((v, i) =>
    s.word(0x20004 + 2 * i, v & 0xffff),
  );
  // Scenery type 5: frequency 0b1010…, two entries.
  m.long(0x1a43c + 5 * 4, 0x30500);
  m.word(0x30500, 0xaaaa);
  m.word(0x30502, 8);
  main.set([0x03, 0xf0, 0x01, 0x00, 7, 42, 9, 3], 0x30504);
  main.set([0x10, 0x20, 0xff, 0x80, 0, 43, 0, 4], 0x3050c);
  return { main, sub };
}

test("a stage's block is read: colors, curves, widths and heights, scenery and its road path", () => {
  const p = programs();
  const stage = readStage(p, 0x3c);
  assert.equal(stage.block, 0x30000);
  assert.deepEqual(stage.colors.surface.words, [0x7999, 0x0999, 0x7999, 0x0999]);
  assert.deepEqual(
    stage.colors.laneLines.rgb555.map((c) => c & 31),
    [19, 30, 19, 30],
  );
  assert.deepEqual(stage.curves, [
    { position: 0, radius: 0, kind: 1 },
    { position: 100, radius: 60, kind: 3 },
    { position: 300, radius: 0, kind: 1 },
  ]);
  assert.deepEqual(stage.widthsHeights, [
    { position: 50, kind: 1, value: 300, speed: -8 },
    { position: 120, kind: 0, value: 211, speed: 0 },
  ]);
  assert.deepEqual(stage.scenery, [{ position: 10, count: 3, type: 5 }]);
  assert.equal(stage.path.x.length, 0x904);
  // The path turns left 1/60 rad a position over the curve: its radius is 60 positions.
  assert.ok(Math.abs(pathTurn(stage.path, 0, 100)) < 1e-9);
  assert.ok(Math.abs(pathTurn(stage.path, 100, 300) - 200 / 60) < 1e-3);
});

test('a height table is read by its kind, and an unknown kind is refused', () => {
  const p = programs();
  assert.deepEqual(readHeightTable(p.sub, 211), {
    address: 0x20000,
    kind: 0,
    step: 3,
    descent: 2,
    ascent: 1,
    entries: [0, 0, 0, 0, 0, 0, 576, 576, -576, -576, -576, 0, 0, 0, 0, 0, 0],
  });
  p.sub[0x20000] = 9;
  assert.throws(() => readHeightTable(p.sub, 211), /unknown kind 9/);
});

test("a scenery type's entries are read up to its last entry's offset", () => {
  const type = readSceneryType(programs().main, 5);
  assert.equal(type.frequency, 0xaaaa);
  assert.deepEqual(type.entries, [
    { flags: 0x03, x: -16, y: 0x0100, unknown: [7, 9], sprite: 42, palette: 3 },
    { flags: 0x10, x: 32, y: -128, unknown: [0, 0], sprite: 43, palette: 4 },
  ]);
});

test("a stage's length is read from the program's comparison of the road position, which is checked", () => {
  const main = new Uint8Array(0x10000);
  const w = writer(main);
  [0x0c79, 0x079c, 0x0026, 0x0006].forEach((v, i) => w.word(0x870a + 2 * i, v));
  assert.equal(stageLength(main), 1948);
  w.word(0x870a, 0x4e71);
  assert.throws(() => stageLength(main), /does not compare/);
});

test('a path running ahead of its curves is found by the shift that matches their heading rates', () => {
  const { main, sub } = programs();
  const stage = readStage({ main, sub }, 0x3c);
  // The hand-made path turns from 100, where the curves do: no offset.
  assert.equal(pathOffset(stage.curves, stage.path, 1948, 40), 0);
  // The same curves 20 positions later: the path runs 20 ahead.
  const later = stage.curves.map((c) => (c.position ? { ...c, position: c.position + 20 } : c));
  assert.equal(pathOffset(later, stage.path, 1948, 40), 20);
});

test("the original's hills: level road tops at row 151, a crest's window raises it, and holds count down by tick", async () => {
  const { roadTop, hillsAlong, holdLength, LEVEL_HORIZON } = await import('../../tools/road-data/outrun-hills.ts');
  // Level: 223 − 512 × 576 × 16 / 65536.
  assert.equal(roadTop(LEVEL_HORIZON, [], 0), 151);
  // A raised horizon of 864: 223 − 108.
  assert.equal(roadTop(864, [], 0), 115);
  // Kind 1's two entries of −192 on segments 1 and 2: the road falls away ahead, its top at row 169.1.
  assert.ok(Math.abs(roadTop(LEVEL_HORIZON, [16 * -192, 16 * -192], 0) - 169.09) < 0.01);
  // At 293 km/h a tick advances 1.3547 positions and counts a wait of 255 down by 8: 32 ticks.
  const valley = { kind: 1, step: 20, wait: 255, entries: [-192, -192] };
  assert.ok(Math.abs(holdLength(valley, 293) - 32 * ((293 * 0x12f) / 65536)) < 1e-9);
  // A kind 0 table [0 ×6, 576, 576, −576 ×3, 0 ×6] from position 1: its crest at row 112.5 near 40; level after.
  const crest = {
    kind: 0,
    step: 3,
    descent: 3,
    ascent: 3,
    entries: [0, 0, 0, 0, 0, 0, 576, 576, -576, -576, -576, 0, 0, 0, 0, 0, 0],
  };
  const positions = Array.from({ length: 800 }, (_, i) => i / 4);
  const tops = hillsAlong(
    [{ position: 1, kind: 0, value: 211, speed: 0 }],
    new Map([[211, crest]]),
    positions,
    () => 293,
  );
  const least = Math.min(...tops);
  assert.ok(Math.abs(least - 112.5) < 0.1);
  assert.ok(Math.abs(positions[tops.indexOf(least)] - 40.5) <= 0.5);
  assert.equal(tops.at(-1), 151);
  // A point reached while a table runs is dropped.
  const dropped = hillsAlong(
    [
      { position: 1, kind: 0, value: 211, speed: 0 },
      { position: 50, kind: 0, value: 1, speed: 0 },
    ],
    new Map([
      [211, crest],
      [1, valley],
    ]),
    positions,
    () => 293,
  );
  assert.deepEqual(dropped, tops);
});
