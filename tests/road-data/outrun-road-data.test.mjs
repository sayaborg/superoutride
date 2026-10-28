import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { readZip } from '../../tools/road-data/zip.ts';
import { assemblePrograms } from '../../tools/road-data/outrun-rom.ts';
import { RomSet } from '../../tools/road-data/rom-set.ts';
import { interleave } from '../../tools/road-data/program-words.ts';
import { readSceneryType, readStage, stageLength } from '../../tools/road-data/outrun-road.ts';
import { paletteRgb555, pathOffset, pathTurn, readHeightTable, roadWidths } from '../../tools/road-data/road-tables.ts';
import { bendOf, profileOf } from '../../tools/road-data/road-profile.ts';
import { crossingsOf, partedCrossings } from '../../tools/road-data/crossings.ts';
import { anchorPoint, outline, spritePixels, spriteWords } from '../../tools/road-data/sprite-pixels.ts';
import { centreLaneAt, drivenLanes, OUTRUN_ROAD } from '../../tools/road-data/outrun-cross-section.ts';
import { composite } from '../../tools/road-data/two-roads.ts';
import { stageSpan } from '../../tools/road-data/outrun-pieces.ts';
import { OUTRUN_ROUTES, outrunRoad, routeName, stationOf } from '../../tools/road-data/outrun-roads.ts';
import { roadObjects } from '../../tools/road-data/outrun-scenery.ts';
import { phaseUnit, positionMetres } from '../../tools/road-data/board-clock.ts';
import { UNIT_METRES } from '../../tools/road-data/pixel-grid.ts';
import { VECTOR_RESOLUTION } from '../../tools/road-data/heading-plan.ts';
import { normalizeCoursePositions } from '../../tools/authoring/course-joints.ts';
import { readCourseDocument } from '../../src/course/course-document.ts';

// Road data readers on hand-made bytes: CI holds no ROM.

/**
 * OUTRUN's clock as its program holds it ([The board's clock](../../docs/original-road-data.md#the-boards-clock)), with
 * its heights' procedure's counts ([Hills](../../docs/original-road-data.md#hills)).
 */
const CLOCK = {
  step: 0x12f,
  frames: 2,
  lines: 512,
  heights: { gain: 12, end: 255, rampEnd: 254, slide: 4, slideEntries: 6, restart: 1, level: 0x240, bottomRow: 223 },
};
const POSITION_METRES = positionMetres(CLOCK);

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
  assert.throws(
    () => assemblePrograms(new RomSet('outrun', [files])),
    /The ROM set has no epr-10380b\.133 of MAME outrun \(CRC 1f6cadad, 65536 bytes\)/,
  );
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
  // The path, its bytes in the word before it: straight ahead to 100, then turning left by 1/60 rad a position.
  s.long(0x1224 + 0x3c * 4, 0x10000);
  s.word(0x10000 - 2, 4 * 0x904);
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
  const { roadTop, hillsAlong, tableRuns } = await import('../../tools/road-data/hills.ts');
  // Level: 223 − 512 × 576 × 16 / 65536.
  assert.equal(roadTop(CLOCK, CLOCK.heights.level, [], 0), 151);
  // A raised horizon of 864: 223 − 108.
  assert.equal(roadTop(CLOCK, 864, [], 0), 115);
  // Kind 1's entry of −192 on every segment: the road falls away ahead, its top at row 172.1.
  assert.ok(Math.abs(roadTop(CLOCK, CLOCK.heights.level, Array(6).fill(16 * -192), 0) - 172.12) < 0.01);
  // A kind 1 table of step 20 rises over ceil((254 × 20 − 1) / 12) = 424 phase units; at 293 km/h a tick advances
  // 1.3547 positions and the phase word 13 or 14, counting a wait of 255 down by 7 or 8 from a carry of 0, held through
  // the tick that takes it below 0: 34 ticks.
  const valley = { kind: 1, step: 20, wait: 255, entries: [-192, -192] };
  const [run] = tableRuns([{ position: 1, kind: 0, value: 9, speed: 0 }], new Map([[9, valley]]), () => 293, CLOCK);
  assert.ok(Math.abs(run.rise - 1 - 424 * phaseUnit(CLOCK)) < 1e-12);
  assert.ok(Math.abs(run.holdEnd - run.rise - 34 * ((293 * 0x12f) / 65536)) < 1e-9);
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
    CLOCK,
  );
  const least = Math.min(...tops);
  assert.ok(Math.abs(least - 112.5) < 0.1);
  assert.ok(Math.abs(positions[tops.indexOf(least)] - 40.5) <= 0.5);
  assert.equal(tops.at(-1), 151);
  // A point reached while a table runs is dropped, and one naming table 0 asks for nothing.
  const dropped = hillsAlong(
    [
      { position: 0.5, kind: 0, value: 0, speed: 0 },
      { position: 1, kind: 0, value: 211, speed: 0 },
      { position: 50, kind: 0, value: 1, speed: 0 },
    ],
    new Map([
      [211, crest],
      [1, valley],
    ]),
    positions,
    () => 293,
    CLOCK,
  );
  assert.deepEqual(dropped, tops);
});

test("the hills' kinds 1 to 3 as the original's windows, each segment's slope held at one row a line", async () => {
  const { roadTop, rowsAlong, tableRuns, SLOPE_LIMIT } = await import('../../tools/road-data/hills.ts');
  const positions = Array.from({ length: 1600 }, (_, i) => i / 4);
  const along = (table) =>
    rowsAlong([{ position: 1, kind: 0, value: 9, speed: 0 }], new Map([[9, table]]), positions, () => 293, CLOCK);
  const run = (table) =>
    tableRuns([{ position: 1, kind: 0, value: 9, speed: 0 }], new Map([[9, table]]), () => 293, CLOCK)[0];
  // A window's rows from its seven segments' slopes (16.16 rows a line), nearest first: each line's word the slopes
  // summed × 16 ÷ 65536, its row 223 − the word ÷ 16. At the share 0x100 the segments are 255, 128, 64, 32, 16, 8 and 9.
  const rowsOf = (slopes, lengths = [255, 128, 64, 32, 16, 8, 9]) => {
    const rows = [];
    let sum = 0;
    slopes.forEach((slope, k) => {
      for (let n = 0; n < lengths[k]; n++) {
        sum += slope;
        rows.push(223 - Math.floor((sum * 16) / 65536) / 16);
      }
    });
    return rows;
  };
  const level = rowsOf(Array(7).fill(16 * CLOCK.heights.level));
  // Kind 3: its first six entries slid in, each its share run to 255 over 4 whatever its step, as a kind 0 table of
  // step 4 slides them: six × ceil((255 × 4 − 1) / 12) = 510 phase units; then its hold and return, then level.
  const entries = [16, -32, 48, -64, 80, -96, 112, 112, 112, 112, 112, 0, 112];
  const hill = { kind: 3, step: 20, value: 255, entries };
  const rows = along(hill);
  const slid = along({ kind: 0, step: 4, descent: 1, ascent: 1, entries: entries.slice(0, 12) });
  const slide = 1 + 510 * phaseUnit(CLOCK);
  const { end } = run(hill);
  positions.forEach((p, n) => {
    if (p < slide) assert.deepEqual(rows[n], slid[n]);
    else if (p >= end) assert.deepEqual(Array.from(rows[n]), level);
  });
  // Kind 1 holding: its entry 1 × the full share ÷ 16 (96 × 255 >> 4 = 1530) added to every segment's slope in turn.
  const valley = { kind: 1, step: 20, wait: 255, entries: [-192, 96] };
  const k1 = run(valley);
  const holding = positions.findIndex((p) => p > k1.rise && p < k1.holdEnd);
  assert.deepEqual(
    Array.from(along(valley)[holding]),
    rowsOf(Array.from({ length: 7 }, (_, k) => Math.min(16 * CLOCK.heights.level + 1530 * k, SLOPE_LIMIT))),
  );
  // Kind 2 holding: segment 0's slope alone, carried on: the level road of a base raised by 1530 ÷ 16; it holds as kind
  // 1 does.
  const k2 = run({ ...valley, kind: 2 });
  assert.deepEqual(
    Array.from(along({ ...valley, kind: 2 })[holding]),
    rowsOf(Array(7).fill(16 * CLOCK.heights.level + 1530)),
  );
  assert.equal(k2.holdEnd - k2.rise, k1.holdEnd - k1.rise);
  // A segment's slope past one row a line is held there, the next increment added to it. A falling one is not held:
  // falling 1.5 rows a line over segment 0's 255 lines, the road climbs back at most a row a line over the other 257,
  // its top the nearest line's row (held at a row a line, it would end 2 rows above it).
  const steep = 16 * CLOCK.heights.level;
  assert.equal(roadTop(CLOCK, (-1.5 * SLOPE_LIMIT) / 16, [4 * SLOPE_LIMIT, 0, 0, 0, 0, 0], 0), 223);
  assert.equal(
    roadTop(CLOCK, CLOCK.heights.level, [SLOPE_LIMIT, 0, 0, 0, 0, -SLOPE_LIMIT / 2], 0),
    roadTop(CLOCK, CLOCK.heights.level, [SLOPE_LIMIT - steep, 0, 0, 0, 0, -SLOPE_LIMIT / 2], 0),
  );
});

/** A path of `length` positions whose heading turns by `rates[p]` radians at each position, as 4096-long words. */
function pathOf(length, rate) {
  const x = [],
    y = [];
  let heading = Math.PI / 2;
  for (let p = 0; p < length; p++) {
    x.push(Math.round(4096 * Math.cos(heading)));
    y.push(Math.round(4096 * Math.sin(heading)));
    heading += rate(p);
  }
  return { address: 0, x, y };
}

test("a stage's road width follows its points", () => {
  // The road width falls from 450 to 300 at 30 × 16 / 303 units a position from 50.
  const width = [{ position: 50, kind: 1, value: 300, speed: 30 }];
  assert.deepEqual(roadWidths(width, 300, 450, CLOCK), [
    [0, 450],
    [50, 450],
    [144.6875, 300],
    [300, 300],
  ]);
});

test("two roads' picture: surfaces over lines, the left road's lines over the right's; the lanes driven", () => {
  // Each line or edge band shown, as [from, to] units across from the roads' middle.
  const shown = (w) =>
    composite([-w, w], OUTRUN_ROAD).map((i) => [
      i.paint,
      Math.round(((i.left.road ? w : -w) + i.left.at) * 100) / 100,
      Math.round(((i.right.road ? w : -w) + i.right.at) * 100) / 100,
    ]);
  // Three lanes: lines about ±70.67 and ±212.
  assert.deepEqual(shown(0).slice(1, 3), [
    ['line', -218, -206],
    ['line', -74.67, -66.67],
  ]);
  // Four lanes: the middle line 5.33 wide, the next 7.33.
  assert.deepEqual(shown(72).slice(3, 5), [
    ['line', -2.67, 2.67],
    ['line', 138.67, 146],
  ]);
  // Five, the middle wide: the left road's edge band shows 0.67 between the right road's surface and its line.
  assert.deepEqual(shown(162).slice(3, 6), [
    ['line', -95.33, -87.33],
    ['edge', 87.33, 88],
    ['line', 88, 95.33],
  ]);
  // Six equal lanes: the two outer lines one line 12 wide; apart beyond 250, ground between the edge bands.
  assert.deepEqual(shown(212)[4], ['line', -6, 6]);
  assert.deepEqual(shown(260).slice(5, 7), [
    ['edge', -32, -10],
    ['edge', 10, 32],
  ]);
  // The lanes driven: a and f always a lane; c and d from the lane lines' middle 70.67 to the roads' middle, the median
  // only where the ground shows, from 250; b's centre is the plan's.
  const lane = 424 / 3;
  const near = (lanes, expected) => {
    for (const [id, width] of Object.entries(expected))
      assert.ok(Math.abs(lanes[id] - width) < 1e-9, `${id}: ${lanes[id]}`);
  };
  near(drivenLanes(300), { a: lane, b: lane, c: lane, m: 176, d: lane, e: lane, f: lane });
  near(drivenLanes(0), { a: lane, b: lane / 2, c: 0, m: 0, d: 0, e: lane / 2, f: lane });
  near(drivenLanes(162), { b: lane, c: 162 - lane / 2, m: 0 });
  near(drivenLanes(240), { b: lane, c: 240 - lane / 2, m: 0 });
  near(drivenLanes(270), { b: lane, c: 500 - lane / 2 - 270, m: 80 });
  assert.equal(centreLaneAt(300), -300);
  assert.equal(centreLaneAt(72), -72);
  assert.ok(Math.abs(centreLaneAt(50) + (50 + lane / 2) / 2) < 1e-12);
});

test('a last stage and its goal become a course: lanes, plan as its path, finish and profile', () => {
  // A stage straight but for a left arc, and a goal stretch as the original's: straight to 182, left R80 to 312.
  const stagePath = pathOf(2308, (p) => (p >= 400 && p < 500 ? 1 / 60 : 0));
  const goalPath = pathOf(624, (p) => (p >= 182 && p < 312 ? 1 / 80 : 0));
  const grey = (light, dark) => ({ address: 0, words: [], rgb555: [light, dark, light, dark] });
  const stage = {
    number: 1,
    curves: [
      { position: 0, radius: 0, kind: 1 },
      { position: 400, radius: 60, kind: 3 },
      { position: 500, radius: 0, kind: 1 },
    ],
    widthsHeights: [{ position: 600, kind: 1, value: 0, speed: 30 }],
    scenery: [],
    path: stagePath,
    groundStripes: [29528, 30585],
    colors: {
      surface: grey(20083, 19026),
      centreLine: grey(20083, 19026),
      laneLines: grey(20083, 31710),
      edges: grey(31710, 19026),
    },
  };
  const goal = {
    curves: [
      { position: 0, radius: 0, kind: 1 },
      { position: 182, radius: 80, kind: 3 },
      { position: 312, radius: 0, kind: 1 },
    ],
    widthsHeights: [
      { position: 0, kind: 0, value: 0, speed: 0 },
      { position: 182, kind: 0, value: 0, speed: 0 },
      { position: 5, kind: 1, value: 0, speed: 256 },
    ],
    scenery: [],
  };
  const flat = { kind: 0, step: 1, descent: 1, ascent: 1, entries: [0, 0, 0, 0, 0, 0, 0] };
  const span = stageSpan(stage, { first: false, fork: null, goal: { stretch: goal, path: goalPath }, clock: CLOCK });
  const road = outrunRoad([{ span, id: 'stage', leaves: 'b', starts: true }], {
    id: 'test',
    name: 'TEST',
    tables: new Map([[0, flat]]),
    kmh: 293,
    cameraDistance: 6,
    objects: () => ({ placements: [], checkpoints: [], report: null }),
    sky: () => ({ image: 'coast-sky', horizonY: 320 }),
    stageName: () => 'TEST',
  });
  // P turns as the path does: its arcs at the stage's 60 and the goal's 80 positions' radius, the plan within the
  // table's resolution held over the road.
  // The ground as OUTRUN's courses have it: the car's limit, 500 units from its road's centre, 288 beyond its lanes.
  const document = road.write(288 * UNIT_METRES);
  const radii = document.sections.flatMap((s) => s.plan.filter((e) => e.kind === 'arc').map((e) => e.radius));
  for (const positions of [60, 80])
    assert.ok(
      radii.some((r) => Math.abs(r / (positions * POSITION_METRES) - 1) < 0.005),
      `${positions}: ${radii}`,
    );
  for (const { heading, beyond } of road.fidelity)
    assert.ok(!beyond.length && heading <= VECTOR_RESOLUTION * (1 + 1e-9), `${heading}`);
  const read = readCourseDocument(normalizeCoursePositions(document).document);
  assert.ok(read.ok, JSON.stringify(read.diagnostics));
  const [section] = document.sections;
  // Three lanes of 3.6 m each side at the start (road width 212, the median 0 and left out).
  assert.deepEqual(
    section.lanes.slice(0, 3).map((l) => (typeof l.width === 'number' ? l.width : l.width[0].width)),
    [3.6, 3.6, 3.6],
  );
  // The finish at the stage's end, by its station along P past the road's 6 m entry; the road closed level at 0.
  const finish = section.gates.find((g) => g.kind === 'finish');
  assert.equal(finish.id, 'TEST-GOAL');
  const go = 6 / POSITION_METRES;
  assert.ok(Math.abs(stationOf(road.laid[0], go) - 6) < 1e-9);
  assert.ok(Math.abs(finish.at.offset - stationOf(road.laid[0], 1948 + go)) < 1e-6);
  assert.ok(Math.abs(road.profile.height(road.end)) < 1e-9);
});

test('crossings parted 2 m by the least change: passages moved as one, ramps of one radius between them', () => {
  /** Pairs of stations `step` apart over `[a, a + length]` and `[b, b + length]`, each earlier then later. */
  const pairs = (a, b, length, step = 2) =>
    Array.from({ length: Math.floor(length / step) + 1 }, (_, i) => [a + i * step, b + i * step]);
  const crossingOf = (stations) => crossingsOf(stations, 2)[0];
  const apart = (profile, crossing) =>
    Math.min(...crossing.pairs.map(([a, b]) => Math.abs(profile.height(a) - profile.height(b))));
  const end = 8000;

  // Two passages on a level road: the later goes over, each moved as one. The ramp between them is the sharpest, all of
  // the 2 m; then the ramps to the road's ends take their rises in proportion to their lengths' squares.
  const two = crossingOf(pairs(1000, 3000, 10));
  const parted = partedCrossings([], [two], end);
  const profile = profileOf(parted.changes.map(bendOf));
  assert.ok(Math.abs(apart(profile, two) - 2) < 1e-9);
  const [low, high] = parted.partings[0].rises;
  assert.ok(low < 0 && high > 0 && Math.abs(high - low - 2) < 1e-9);
  assert.ok(Math.abs(profile.height(1000) - profile.height(1010)) < 1e-9);
  assert.ok(Math.abs(profile.height(3000) - profile.height(3010)) < 1e-9);
  assert.ok(Math.abs(-low / high - 1000 ** 2 / 4990 ** 2) < 1e-9);
  assert.ok(Math.abs(parted.radius - 1990 ** 2 / 4 / 2) < 1e-6);
  assert.ok(Math.abs(profile.height(0)) < 1e-12 && Math.abs(profile.height(end)) < 1e-9);

  // Three passages that overlap each other in order of their heights: the middle one keeps 2 m from both.
  const three = {
    passages: [1000, 3000, 5000].map((from) => ({ from, to: from + 10 })),
    pairs: [...pairs(1000, 3000, 10), ...pairs(1000, 5000, 10), ...pairs(3000, 5000, 10)],
  };
  const stacked = profileOf(partedCrossings([], [three], end).changes.map(bendOf));
  assert.ok(apart(stacked, three) > 2 - 1e-9);
  assert.ok(stacked.height(1005) < stacked.height(3005) && stacked.height(3005) < stacked.height(5005));

  // Passages already apart stay.
  const rise = [
    { from: 2000, to: 2500, change: 0.02 },
    { from: 2500, to: 3000, change: -0.02 },
  ];
  const kept = partedCrossings(rise, [two], end);
  assert.deepEqual(kept.partings[0].rises, [0, 0]);
});

test("a sprite's pixels, its filled outline and its anchor", () => {
  // A set's four ROMs give a word's bytes from the least significant: .9's byte is its low byte, .12's its high one.
  const roms = [[0x78], [0x56], [0x34], [0x12]].map((bytes) => Uint8Array.from(bytes));
  assert.deepEqual([...spriteWords(roms)], [0x12345678]);
  // Rows of three words, its pixels from each word's high bits: 1, 2, 15 (transparent), 3, then 0s; the next word, whose
  // bits 4–7 are 15, ends the row, and the third word is not drawn.
  const words = new Uint32Array(0x40000);
  words[5] = 0x12f30000;
  words[6] = 0x400000f0;
  words[7] = 0x55555555;
  const pixels = spritePixels(words, { width: 24, height: 1, stride: 3, bank: 0, offset: 5 });
  assert.deepEqual([...pixels], [1, 2, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, ...Array(8).fill(0)]);
  assert.deepEqual([...outline(pixels, 24)].slice(0, 9), [1, 1, 0, 1, 0, 0, 0, 0, 1]);
  // A hole no transparent path joins to the edge is filled.
  const ring = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  assert.deepEqual([...outline(ring, 3)], [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  // Bottom middle, and the right edge at the object's x.
  assert.deepEqual(anchorPoint(8, 10, 20), { x: 4.5, y: 19.5 });
  assert.deepEqual(anchorPoint(10, 10, 20), { x: 9.5, y: 19.5 });
});

/** A program whose objects approach by the table at 0x28000 (col × line × 0x400) and whose scenery types 1 to 3 each
 * bring out drawing `drawing` (not converted) by their frequency word. */
function approaching() {
  const main = new Uint8Array(0x40000);
  const m = writer(main);
  // The roads apart past the word at 0xE308 (280), the scenery's slots the word at 0xF204 (79), as their instructions read them.
  [0xb079, 0x0000, 0xe308].forEach((v, i) => m.word(0x3d7a + 2 * i, v));
  [0x3239, 0x0000, 0xf204].forEach((v, i) => m.word(0x3cc2 + 2 * i, v));
  m.word(0xe308, 280);
  m.word(0xf204, 79);
  for (let col = 0; col < 16; col++)
    for (let line = 0; line < 512; line++) m.long(0x28000 + (col << 11) + 4 * line, col * line * 0x400);
  m.word(0x2b6e, 0);
  [
    [1, 0x8000, 0x60],
    [2, 0x4000, 0x60],
    [3, 0x8000, 0x20],
    [4, 0xffff, 0x60],
    [5, 0xffff, 0x20],
  ].forEach(([type, frequency, flags], k) => {
    const address = 0x30000 + 16 * k;
    m.long(0x1a43c + 4 * type, address);
    m.word(address, frequency);
    m.word(address + 2, 0);
    main[address + 4] = flags;
  });
  return main;
}

test('objects pass the car where their depth, stepped once a phase unit from GO, reaches line 512, the clouds at half the rate', () => {
  const main = approaching();
  const unit = phaseUnit(CLOCK);
  const objects = (points, resets = []) =>
    roadObjects(main, points, {
      go: 0,
      end: 1000,
      resets,
      width: () => 212,
      originalWidth: () => 212,
      startRoad: -450,
      startDepth: () => Infinity,
      starts: [],
      clock: CLOCK,
    });
  // Where each object stands: a checkpoint banner's (drawing 6) or a cloud's (drawing 2).
  const at = (type, position) => objects([{ position, count: 1, type }]).placements.map((o) => o.position);
  // The units of advance from depth `from` (16.16 lines) to line 512 by the test's table, a step of line × 0x400 for an
  // advance of 1.
  const units = (from, half = false) => {
    let [depth, n] = [from, 0];
    for (; depth >>> 16 < 512; n++) depth += half ? ((depth >>> 16) * 0x400) >> 1 : (depth >>> 16) * 0x400;
    return n;
  };
  // Taken where the road reaches 0: the first turn's object (at 0x10400), the second's (0x10000), and a cloud.
  assert.deepEqual(at(1, 0), [units(0x10400) * unit]);
  assert.deepEqual(at(2, 0), [units(0x10000) * unit]);
  assert.deepEqual(at(3, 0), [units(0x10400, true) * unit]);
  assert.ok(Math.abs(unit - 303 / 3072) < 1e-12);
});

test("a stretch's end ends the point it was running, and objects find no slot past 79", () => {
  const main = approaching();
  const run = (points, resets) =>
    roadObjects(main, points, {
      go: 0,
      end: 1000,
      resets,
      width: () => 212,
      originalWidth: () => 212,
      startRoad: -450,
      startDepth: () => Infinity,
      starts: [],
      clock: CLOCK,
    });
  // Two objects a position from 100 to 110 of 60: the stretch ending at 110 leaves the other 38 unshown.
  const ended = run([{ position: 100, count: 60, type: 4 }], [110]);
  assert.equal(ended.placements.length, 22);
  assert.equal(ended.ended.objects, 38);
  // 200 clouds two a position live more than 80 positions each: no more than 79 at once.
  const crowded = run([{ position: 0, count: 200, type: 5 }], []);
  assert.equal(crowded.placements.length + crowded.dropped, 200);
  assert.ok(crowded.dropped > 0);
});

test("OUTRUN's roads are named by their goal, C's two of each length by the side they begin by", () => {
  assert.deepEqual(
    OUTRUN_ROUTES.map((route) => [route.id, routeName(route, OUTRUN_ROUTES)]),
    [
      ['outrun-a', 'OUTRUN A'],
      ['outrun-b', 'OUTRUN B'],
      ['outrun-c-left', 'OUTRUN C LEFT'],
      ['outrun-c-right', 'OUTRUN C RIGHT'],
      ['outrun-d', 'OUTRUN D'],
      ['outrun-e', 'OUTRUN E'],
      ['outrun-short-a', 'OUTRUN SHORT A'],
      ['outrun-short-b', 'OUTRUN SHORT B'],
      ['outrun-short-c-left', 'OUTRUN SHORT C LEFT'],
      ['outrun-short-c-right', 'OUTRUN SHORT C RIGHT'],
      ['outrun-short-d', 'OUTRUN SHORT D'],
      ['outrun-short-e', 'OUTRUN SHORT E'],
    ],
  );
});
