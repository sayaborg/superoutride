import assert from 'node:assert/strict';
import test from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import { readZip } from '../../tools/road-data/zip.ts';
import { assemblePrograms } from '../../tools/road-data/outrun-rom.ts';
import { interleave } from '../../tools/road-data/program-words.ts';
import { readSceneryType, readStage, stageLength } from '../../tools/road-data/outrun-road.ts';
import { paletteRgb555, pathOffset, pathTurn, readHeightTable } from '../../tools/road-data/road-tables.ts';
import {
  bendOf,
  closedGrades,
  crossingOf,
  gradeRamps,
  profileOf,
  separatedCrossings,
  stageGrades,
  STEEPEST,
} from '../../tools/road-data/road-profile.ts';
import {
  anchorPoint,
  outline,
  representative,
  spritePixels,
  spriteWords,
} from '../../tools/road-data/sprite-pixels.ts';
import { roadWidths, stagePlan } from '../../tools/road-data/outrun-course.ts';
import { centreLaneAt, drivenLanes, OUTRUN_ROAD } from '../../tools/road-data/outrun-cross-section.ts';
import { composite } from '../../tools/road-data/two-roads.ts';
import { stageSpan } from '../../tools/road-data/outrun-pieces.ts';
import { outrunRoad } from '../../tools/road-data/outrun-roads.ts';
import { roadObjects } from '../../tools/road-data/outrun-scenery.ts';
import { POSITION_METRES } from '../../tools/road-data/offset-plan.ts';
import { normalizeCoursePositions } from '../../tools/authoring/course-joints.ts';
import { readCourseDocument } from '../../src/course/course-document.ts';

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
  const { roadTop, hillsAlong, holdLength, LEVEL_HORIZON } = await import('../../tools/road-data/hills.ts');
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

test('a stage becomes a road: its path turns between breaks at its joins, its width follows its points', () => {
  // A left arc of radius 50 from 100 to 178 between two straights; the path turns from position 100 to 177.
  const path = pathOf(400, (p) => (p >= 100 && p < 178 ? 1 / 50 : 0));
  const curves = [
    { position: 0, radius: 0, kind: 1 },
    { position: 100, radius: 50, kind: 3 },
    { position: 178, radius: 0, kind: 1 },
  ];
  // Breaks two positions either side of each join; the straights hold their headings, the rest turns as the path.
  const plan = stagePlan(curves, path, 0, 300);
  assert.deepEqual(
    plan.map((s) => [s.from, s.to]),
    [
      [0, 98],
      [98, 102],
      [102, 176],
      [176, 180],
      [180, 300],
    ],
  );
  [0, 2, 74, 2, 0].forEach((positions, i) => assert.ok(Math.abs(plan[i].turn - positions / 50) < 1e-3));
  assert.throws(() => stagePlan([curves[0], { ...curves[1], kind: 2 }, curves[2]], path, 0, 300), /turns left/);

  // The road width falls from 450 to 300 at 30 × 16 / 303 units a position from 50.
  const width = [{ position: 50, kind: 1, value: 300, speed: 30 }];
  assert.deepEqual(roadWidths(width, 300), [
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
  // The lanes driven: a and f always a lane; c and d grow from 72 to 212; b's centre is the plan's.
  const lane = 424 / 3;
  assert.deepEqual(drivenLanes(300), { a: lane, b: lane, c: lane, m: 176, d: lane, e: lane, f: lane });
  assert.deepEqual(drivenLanes(0), { a: lane, b: lane / 2, c: 0, m: 0, d: 0, e: lane / 2, f: lane });
  assert.ok(Math.abs(drivenLanes(162).c - (lane * 90) / 140) < 1e-12);
  assert.equal(centreLaneAt(300), -300);
  assert.ok(Math.abs(centreLaneAt(72) + (72 + lane / 2) / 2) < 1e-12);
});

test('a last stage and its goal become a course: lanes, plan within a centimetre, finish and profile', () => {
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
  const span = stageSpan(stage, { first: false, fork: null, goal: { stretch: goal, path: goalPath } });
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
  assert.ok(road.drift <= 0.01);
  const read = readCourseDocument(normalizeCoursePositions(road.document).document);
  assert.ok(read.ok, JSON.stringify(read.diagnostics));
  const [section] = road.document.sections;
  // Three lanes of 3.6 m each side at the start (road width 212, the median 0 and left out).
  assert.deepEqual(
    section.lanes.slice(0, 3).map((l) => (typeof l.width === 'number' ? l.width : l.width[0].width)),
    [3.6, 3.6, 3.6],
  );
  // The finish at the stage's end, by the plan's station there past the road's 6 m entry; the road closed level at 0.
  const finish = section.gates.find((g) => g.kind === 'finish');
  assert.equal(finish.id, 'TEST-GOAL');
  const go = 6 / POSITION_METRES;
  assert.ok(Math.abs(road.laid[0].plan.station(go) - 6) < 1e-9);
  assert.equal(finish.at.offset, road.laid[0].plan.station(1948 + go));
  assert.ok(Math.abs(road.profile.height(road.end)) < 1e-9);
});

test("a stage's grades: a table's leftover returned before the next, a held shape stopped at the steepest, the road closed", () => {
  const look = { 0: 0.1, 1: 0.5 };
  // Kind 0 at 0: six level entries of 2.125 positions, then 576 over 2.125, leaving the grade at 0.1.
  const slid = { kind: 0, step: 1, descent: 1, ascent: 1, entries: [0, 0, 0, 0, 0, 0, 576, 0, 0, 0, 0, 0, 0, 0] };
  // Kind 1 at 40: −576 held, changing the grade by −1 over its rise, hold and return at full look.
  const held = { kind: 1, step: 20, wait: 255, entries: [-576, -576] };
  const runs = [
    { table: slid, start: 0, rise: 0, holdEnd: 0, end: 17 },
    { table: held, start: 40, rise: 82.5, holdEnd: 125, end: 167.5 },
  ];
  const changes = stageGrades(runs, look, (p) => p, 300, 300);
  const profile = profileOf(changes.map(bendOf));
  assert.ok(Math.abs(profile.grade(17) - 0.1) < 1e-12);
  // The grade it leaves is returned by the next table's start.
  assert.ok(Math.abs(profile.grade(40)) < 1e-12);
  // The held shape bends the road at its rate until the grade is the steepest, then holds it to its end.
  const rate = (-0.5 / 42.5) * 0.5;
  assert.ok(Math.abs(profile.grade(60) - rate * 20) < 1e-12);
  assert.ok(Math.abs(profile.grade(167.5) + STEEPEST) < 1e-12);
  // Then returned by the road's end, which the tilt brings to height 0.
  assert.ok(Math.abs(profile.grade(300)) < 1e-12);
  const closed = profileOf(closedGrades(changes, 300).map(bendOf));
  assert.ok(Math.abs(closed.height(300)) < 1e-9 && Math.abs(closed.grade(300)) < 1e-12);
  // A grade still left at the end, a table running to it, is returned there too.
  const left = profileOf(closedGrades([{ from: 100, to: 150, change: 0.05 }], 600).map(bendOf));
  assert.ok(Math.abs(left.height(600)) < 1e-9 && Math.abs(left.grade(600)) < 1e-12);
});

test("a table's grades: kind 0's entries where the camera passes them, kind 1's shape held on the nearest segment", () => {
  const slid = gradeRamps({
    table: { kind: 0, step: 2, descent: 1, ascent: 2, entries: [0, 0, 0, 0, 0, 0, 288, -576, 0, 0, 0, 0, 0, 0] },
    start: 10,
    rise: 10 + 8 * 4.25 + 2 * 8.5,
    holdEnd: 0,
    end: 0,
  });
  // Six level entries of 4.25 positions, then 288 over 2 × 4.25 (its ascent) and −576 over 4.25 (its descent).
  assert.deepEqual(slid, [
    { from: 35.5, to: 44, change: 0.5, held: false },
    { from: 44, to: 48.25, change: -1, held: false },
  ]);
  // Kind 1: −192 held at full share over the hold, half over the rise and return, per 2.125 × step positions.
  const held = gradeRamps({
    table: { kind: 1, step: 20, wait: 255, entries: [-192, -192] },
    start: 0,
    rise: 42.5,
    holdEnd: 85,
    end: 127.5,
  });
  const total = held.reduce((sum, r) => sum + r.change, 0);
  assert.ok(Math.abs(total - (-192 / 576) * 2) < 1e-12);
  assert.ok(held.every((r) => r.held));
});

test('crossings kept 6 m apart: two passages by smooth bumps, more by levels, a long overlap flat, and again', () => {
  /** Pairs of stations `step` apart over `[a, a + length]` and `[b, b + length]`, each earlier then later. */
  const pairs = (a, b, length, step = 2) =>
    Array.from({ length: Math.floor(length / step) + 1 }, (_, i) => [a + i * step, b + i * step]);
  const apart = (profile, crossing) =>
    Math.min(...crossing.pairs.map(([a, b]) => Math.abs(profile.height(a) - profile.height(b))));
  const end = 8000;

  // Two passages on a level road: the later is raised and the earlier lowered by a smooth bump each.
  const two = crossingOf(pairs(1000, 3000, 10));
  const kept = separatedCrossings([], [two], end);
  const profile = profileOf(kept.changes.map(bendOf));
  assert.ok(apart(profile, two) >= 6);
  assert.ok(profile.height(3005) > 2.9 && profile.height(1005) < -2.9);
  assert.deepEqual(
    kept.separations.map((s) => [s.levels, s.flat]),
    [
      [
        [0, 1],
        [false, false],
      ],
    ],
  );

  // Three passages that overlap each other take levels in running order, 6 m apart about their mean.
  const three = {
    passages: [1000, 3000, 5000].map((from) => ({ from, to: from + 10 })),
    pairs: [...pairs(1000, 3000, 10), ...pairs(1000, 5000, 10), ...pairs(3000, 5000, 10)],
  };
  const stacked = profileOf(separatedCrossings([], [three], end).changes.map(bendOf));
  assert.ok(apart(stacked, three) >= 6);
  assert.ok(stacked.height(1005) < -5.9 && Math.abs(stacked.height(3005)) < 0.5 && stacked.height(5005) > 5.9);

  // A long overlap is held flat over its passages.
  const long = crossingOf(pairs(1000, 4000, 400));
  const flat = separatedCrossings([], [long], end);
  const held = profileOf(flat.changes.map(bendOf));
  assert.deepEqual(flat.separations[0].flat, [true, true]);
  assert.ok(apart(held, long) >= 6);
  assert.ok(Math.abs(held.height(4000) - held.height(4400)) < 1e-9);

  // A later crossing whose bump lowers an earlier one's raised passage moves the earlier one again: its later passage
  // lies on a rise, so its earlier one, by the earlier crossing's, is the lower.
  const rise = [
    { from: 5700, to: 5850, change: (2 * 2.8) / 300 },
    { from: 5850, to: 6150, change: (-4 * 2.8) / 300 },
    { from: 6150, to: 6300, change: (2 * 2.8) / 300 },
  ];
  const first = crossingOf(pairs(1000, 3000, 10));
  const second = crossingOf(pairs(3150, 6000, 10));
  const again = separatedCrossings(rise, [first, second], end);
  const both = profileOf(again.changes.map(bendOf));
  assert.ok(apart(both, first) >= 6 && apart(both, second) >= 6);
  assert.ok(again.separations.filter((s) => s.crossing === 0).length > 1);
});

test("a sprite's pixels, its filled outline, its anchor and its palette's representative color", () => {
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
  // The mean of the colored pixels' colors by channel.
  const palette = [0, (10 << 10) | (20 << 5) | 30, (20 << 10) | (10 << 5) | 0];
  assert.equal(representative(Uint8Array.from([1, 2, 0]), palette), (15 << 10) | (15 << 5) | 15);
});

/** A program whose objects approach by the table at 0x28000 (col × line × 0x400) and whose scenery types 1 to 3 each
 * bring out drawing `drawing` (not converted) by their frequency word. */
function approaching() {
  const main = new Uint8Array(0x40000);
  const m = writer(main);
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

test('objects approach three phase steps a tick and pass the car 34 ticks after they appear, the clouds 66', () => {
  const main = approaching();
  const step = (293 * 0x12f) / 65536;
  // Where each object stands: a checkpoint banner's (drawing 6) or a cloud's (drawing 2).
  const at = (type, position) => {
    const { placements } = roadObjects(main, [{ position, count: 1, type }], {
      go: 0,
      end: 1000,
      resets: [],
      kmh: 293,
      width: () => 212,
      startDepth: () => Infinity,
      starts: [],
    });
    return placements.map((o) => o.position);
  };
  // Taken on the tick the road reaches 0: the first turn's object (line 0x104) and the second's (0x100) both pass the
  // car 34 ticks on (46.06 positions), having moved 35 times at advances of 13 and 14.
  for (const type of [1, 2]) assert.deepEqual(at(type, 0), [35 * step]);
  assert.ok(Math.abs(34 * step - 46.06) < 0.01);
  // A cloud (drawing 2) approaches at half the rate.
  assert.deepEqual(at(3, 0), [67 * step]);
});

test("a stretch's end ends the point it was running, and objects find no slot past 79", () => {
  const main = approaching();
  const run = (points, resets) =>
    roadObjects(main, points, {
      go: 0,
      end: 1000,
      resets,
      kmh: 293,
      width: () => 212,
      startDepth: () => Infinity,
      starts: [],
    });
  // Two objects a tick from 100 for 60 objects: the stretch ending at 110 leaves the rest unshown.
  const ended = run([{ position: 100, count: 60, type: 4 }], [110]);
  assert.equal(ended.placements.length + ended.ended.objects, 60);
  assert.ok(ended.ended.objects > 40);
  // 200 clouds two a tick live 67 ticks each: no more than 79 at once.
  const crowded = run([{ position: 0, count: 200, type: 5 }], []);
  assert.equal(crowded.placements.length + crowded.dropped, 200);
  assert.ok(crowded.dropped > 0);
});
