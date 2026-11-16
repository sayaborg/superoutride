import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { readGlbModel } from '../../tools/graphics/glb-model.ts';
import { buildModelVehicleSolid } from '../../tools/graphics/model-vehicle-solid.ts';
import { readVehicleModelRecipe } from '../../tools/graphics/vehicle-model-recipe.ts';
import { generateModelSpriteSet } from '../../tools/graphics/vehicle-model-sources.ts';
import { drawModelSpriteSet, modelTexelRoles } from '../../tools/graphics/vehicle-role-pictures.ts';
import { drawSize } from '../../tools/graphics/vehicle-pictures.ts';
import { createNodeContentStore } from '../../tools/build/node-content-store.ts';
import { readVehicleSpriteSetDocument } from '../../src/vehicle/vehicle-sprite-library.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { cameraDistance } from '../../src/view/camera.js';

const SET = 'mclaren-m23-pp-spec';
const recipeValue = JSON.parse(
  await readFile(new URL(`../../content/vehicle-picture-sources/${SET}.json`, import.meta.url), 'utf8'),
);
const recipe = readVehicleModelRecipe(recipeValue);

/**
 * A small GLB made here: one mesh of `quads` (each four corners, counter-clockwise seen from the side it faces, with
 * an optional normal at every corner) under a node moved `lift` up, textured by `pixels` (RGB rows, u across, v down)
 * over each quad whole; and a wheel node at the model's origin.
 */
function glb({ quads, pixels = [[[255, 255, 255]]], lift = 0 }) {
  const height = pixels.length,
    width = pixels[0].length;
  const png = new PNG({ width, height });
  pixels.flat().forEach(([r, g, b], k) => png.data.set([r, g, b, 255], k * 4));
  const image = PNG.sync.write(png);
  const withNormals = quads.every((q) => q.normals);
  const positions = new Float32Array(quads.flatMap((q) => q.corners.flat()));
  const uvs = new Float32Array(quads.flatMap(() => [0, 1, 1, 1, 1, 0, 0, 0]));
  const normals = withNormals ? new Float32Array(quads.flatMap((q) => q.normals.flat())) : null;
  const indices = new Uint16Array(quads.flatMap((_, k) => [0, 1, 2, 0, 2, 3].map((i) => k * 4 + i)));
  const pad = (n) => (n + 3) & ~3;
  const parts = [positions, uvs, indices, image, ...(normals ? [normals] : [])].map(
    (p) => new Uint8Array(p.buffer ?? p, p.byteOffset ?? 0, p.byteLength),
  );
  const offsets = [];
  let length = 0;
  for (const part of parts) {
    offsets.push(length);
    length = pad(length + part.byteLength);
  }
  const bin = new Uint8Array(length);
  parts.forEach((part, i) => bin.set(part, offsets[i]));
  const count = quads.length * 4;
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'root', children: [1, 2] },
      { name: 'body', mesh: 0, translation: [0, lift, 0] },
      { name: 'wheel_F', translation: [0, 0, 0] },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1, ...(normals ? { NORMAL: 3 } : {}) },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
      ...(normals ? [{ bufferView: 4, componentType: 5126, count, type: 'VEC3' }] : []),
    ],
    bufferViews: parts.map((part, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: part.byteLength })),
    buffers: [{ byteLength: bin.byteLength }],
  };
  let text = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(pad(text.byteLength)).fill(0x20);
  jsonPadded.set(text);
  text = jsonPadded;
  const out = new Uint8Array(12 + 8 + text.byteLength + 8 + bin.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, text.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  view.setUint32(20 + text.byteLength, bin.byteLength, true);
  view.setUint32(24 + text.byteLength, 0x004e4942, true);
  out.set(bin, 28 + text.byteLength);
  return out;
}

/** An axis-aligned quad of the model at `at` on `axis`, facing its `sign` side, spanning `a` and `b` on the others. */
function quad(axis, at, sign, [a0, a1], [b0, b1]) {
  const point = (a, b) => {
    const p = [0, 0, 0],
      [i, j] = [(axis + 1) % 3, (axis + 2) % 3];
    p[axis] = at;
    p[i] = a;
    p[j] = b;
    return p;
  };
  const corners = [point(a0, b0), point(a1, b0), point(a1, b1), point(a0, b1)];
  return { corners: sign > 0 ? corners : corners.reverse() };
}

const smallRecipe = { ...recipe, spacing: 0.02, model: { ...recipe.model, frontWheels: ['wheel_F'] } };
const fineRecipe = { ...smallRecipe, spacing: 0.006 };
/** The texel at size 0 showing vehicle point (x, y, z) from yaw 0, as a size's camera projects it. */
function texelAt(drawn, x, y, z) {
  const { focalLength, height } = CAMERA_DEFINITION,
    distance = cameraDistance(CAMERA_DEFINITION),
    depth = distance + z;
  const column = Math.floor(drawn.anchorX + (focalLength * x) / depth),
    row = Math.floor(drawn.anchorY - (focalLength * height) / distance + (focalLength * (height - y)) / depth);
  return row * drawn.width + column;
}

test('a GLB becomes a solid of its texture’s colors and its faces’ normals, the same each time', () => {
  // A quad 1 m by 0.5 m facing the model's forward, its texture's left half red and right half white.
  const model = () =>
    glb({
      quads: [quad(2, 1, 1, [-0.5, 0.5], [0, 0.5]).corners].map((c) => ({ corners: [c[0], c[1], c[2], c[3]] })),
      pixels: [
        [
          [230, 20, 20],
          [255, 255, 255],
        ],
      ],
      lift: 0.25,
    });
  const solid = buildModelVehicleSolid(readGlbModel(model(), PNG), smallRecipe, 1.5);
  // 0.5 m² at 0.02 m: about 1,250 samples.
  assert.ok(Math.abs(solid.count - 1250) <= 1, `${solid.count} samples`);
  for (let n = 0; n < solid.count; n++) {
    const [x, y, z] = [solid.positions[n * 3], solid.positions[n * 3 + 1], solid.positions[n * 3 + 2]];
    // The model's left (+x) is the vehicle's left, so its right (-x): the texture's red left half lies at x > 0.
    const red = solid.colors[n * 3 + 1] < 100;
    assert.equal(red, x > 0, `sample ${n} at x ${x}`);
    // The face looks forward.
    assert.ok(Math.abs(solid.normals[n * 3]) < 1e-9 && Math.abs(solid.normals[n * 3 + 1]) < 1e-9);
    assert.equal(solid.normals[n * 3 + 2], 1);
    // Its front wheel's origin, at model z 0, lies 1.5 m ahead of the base point; its lowest sample on the road.
    assert.ok(Math.abs(z - 2.5) < 1e-6);
    assert.ok(y >= 0 && y <= 0.5 + 1e-6);
  }
  const again = buildModelVehicleSolid(readGlbModel(model(), PNG), smallRecipe, 1.5);
  for (const key of ['positions', 'normals', 'colors', 'footprint']) assert.deepEqual(again[key], solid[key], key);
});

test('a GLB with vertex normals gives its samples those normals interpolated, not its faces’', () => {
  const tilt = [0, Math.SQRT1_2, Math.SQRT1_2];
  const { corners } = quad(2, 0, 1, [-0.5, 0.5], [0, 0.5]);
  const solid = buildModelVehicleSolid(
    readGlbModel(glb({ quads: [{ corners, normals: [tilt, tilt, tilt, tilt] }] }), PNG),
    smallRecipe,
    0,
  );
  for (let n = 0; n < solid.count; n++)
    assert.deepEqual(
      [...solid.normals.subarray(n * 3, n * 3 + 3)].map((v) => Math.round(v * 1e6) / 1e6 + 0),
      [0, 0.707107, 0.707107],
    );
});

test('the floor of a hollow is darker than the face around it that looks the same way', () => {
  // A white plate facing the camera behind the vehicle, 0.6 m high, with a pocket 0.3 m square and 0.4 m deep.
  const back = -1,
    floor = -0.6;
  const quads = [
    quad(2, back, -1, [-0.5, 0.5], [0, 0.15]),
    quad(2, back, -1, [-0.5, 0.5], [0.45, 0.6]),
    quad(2, back, -1, [-0.5, -0.15], [0.15, 0.45]),
    quad(2, back, -1, [0.15, 0.5], [0.15, 0.45]),
    quad(2, floor, -1, [-0.15, 0.15], [0.15, 0.45]),
    quad(0, -0.15, 1, [0.15, 0.45], [back, floor]),
    quad(0, 0.15, -1, [0.15, 0.45], [back, floor]),
    quad(1, 0.15, 1, [back, floor], [-0.15, 0.15]),
    quad(1, 0.45, -1, [back, floor], [-0.15, 0.15]),
  ];
  const solid = buildModelVehicleSolid(readGlbModel(glb({ quads }), PNG), fineRecipe, 0);
  const drawn = drawSize(solid, modelTexelRoles(solid, fineRecipe), CAMERA_DEFINITION, 0, 0);
  const pocket = drawn.brightness[texelAt(drawn, 0, 0.3, floor)],
    plate = drawn.brightness[texelAt(drawn, -0.35, 0.3, back)];
  assert.ok(pocket > 0 && plate > 0, `${pocket} ${plate}`);
  assert.ok(pocket < plate * 0.8, `the pocket ${pocket} against the plate ${plate}`);
});

test('the light stays with the picture: a face turned to the camera is as bright from any side', () => {
  // A white plate facing the vehicle's rear, seen from behind, and one facing its right, seen with the vehicle turned
  // a quarter: both face the camera from the same place.
  const rear = quad(2, -0.5, -1, [-0.4, 0.4], [0, 0.6]);
  const right = quad(0, -0.5, -1, [0, 0.6], [-0.4, 0.4]);
  const brightness = (q, yaw) => {
    const solid = buildModelVehicleSolid(readGlbModel(glb({ quads: [q] }), PNG), smallRecipe, 0);
    const drawn = drawSize(solid, modelTexelRoles(solid, smallRecipe), CAMERA_DEFINITION, yaw, 0);
    return drawn.brightness[texelAt(drawn, 0, 0.3, -0.5)];
  };
  const fromBehind = brightness(rear, 0),
    fromTheSide = brightness(right, Math.PI / 2);
  assert.ok(fromBehind > 0);
  assert.ok(Math.abs(fromBehind - fromTheSide) < 1e-3, `${fromBehind} ${fromTheSide}`);
});

/** The slot of the texel at `level` of the set's picture 0 (yaw 0) showing vehicle point (x, y, z). */
function slotAt(set, level, x, y, z) {
  const frame = set.pictures[0].sizes[level];
  const { focalLength, height } = CAMERA_DEFINITION,
    distance = cameraDistance(CAMERA_DEFINITION) * 2 ** level;
  const column = Math.floor(frame.anchorX + 0.5 + (focalLength * x) / (distance + z)),
    row = Math.floor(
      frame.anchorY + 0.5 - (focalLength * height) / distance + (focalLength * (height - y)) / (distance + z),
    );
  return parseInt(frame.rows[row]?.[column] ?? '0', 16);
}

test('a surface just behind a nearer one gets a step line on the nearest sizes alone, and the outline none', () => {
  // A white plate seen from behind, its right half (the model's left) covered by a nearer plate `gap` in front.
  const steps = (gap) => {
    const near = -1,
      far = near + gap;
    const quads = [quad(2, near, -1, [-0.5, 0], [0, 0.6]), quad(2, far, -1, [-0.5, 0.5], [0, 0.6])];
    const recipe = { ...fineRecipe, yawVariants: 1 };
    const solid = buildModelVehicleSolid(readGlbModel(glb({ quads }), PNG), recipe, 0);
    return { set: drawModelSpriteSet(solid, recipe, CAMERA_DEFINITION), far };
  };
  const body = 1,
    shade = recipe.colors.indexOf(recipe.shade) + 1;
  const deep = steps(0.2),
    shallow = steps(0.05);
  // Beside the nearer plate's edge (vehicle x 0), on the farther plate: a line 20 cm behind, none 5 cm behind.
  assert.equal(slotAt(deep.set, 0, -0.011, 0.3, deep.far), shade);
  assert.equal(slotAt(shallow.set, 0, -0.011, 0.3, shallow.far), body);
  // The nearer plate's own edge and the outline get none.
  assert.equal(slotAt(deep.set, 0, 0.011, 0.3, -1), body);
  assert.equal(slotAt(deep.set, 0, -0.49, 0.3, deep.far), body);
  // Size 2 gets no line.
  assert.equal(slotAt(deep.set, 2, -0.05, 0.3, deep.far), body);
});

test('the model recipe refuses a model whose SHA-256 is not its own', async () => {
  await assert.rejects(
    generateModelSpriteSet(
      createNodeContentStore(),
      SET,
      recipeValue,
      glb({ quads: [quad(2, 0, 1, [0, 1], [0, 1])] }),
      PNG,
    ),
    (error) => error instanceof RangeError && /SHA-256/.test(error.message),
  );
});

test('the M23 PP SPEC’s saved set: 64 directions and six sizes in five colors, each channel off or on', async () => {
  const value = JSON.parse(await readFile(new URL(`../../content/sprites/${SET}.json`, import.meta.url), 'utf8'));
  const { set } = readVehicleSpriteSetDocument(value, SET);
  assert.equal(set.yawVariants, 64);
  assert.equal(set.bankVariants, 1);
  const table = {
    'white-blue': [0x7fff, 0x001f, 0x7fe0, 0x03ff, 0],
    'white-red': [0x7fff, 0x7c00, 0x001f, 0x03ff, 0],
    'white-green': [0x7fff, 0x03e0, 0x7c00, 0x03ff, 0],
    'white-yellow': [0x7fff, 0x7fe0, 0x03e0, 0x03ff, 0],
  };
  assert.deepEqual(Object.keys(value.palettes).sort(), Object.keys(table).sort());
  for (const [name, colors] of Object.entries(value.palettes)) {
    assert.deepEqual(colors.slice(0, 5), table[name]);
    // Every channel of every slot is 0 or 31.
    for (const color of colors) for (const shift of [0, 5, 10]) assert.ok([0, 31].includes((color >> shift) & 31));
  }
  assert.deepEqual(value.brakeLamp, { off: 0, on: 0 });
  const used = new Set(),
    helmet = new Set();
  for (const picture of value.pictures) {
    assert.equal(picture.sizes.length, 6);
    picture.sizes.forEach((size, level) => {
      assert.ok(
        size.shadow.rows.some((row) => /[^0]/.test(row)),
        `a shadow at size ${level}`,
      );
      for (const row of size.rows)
        for (const digit of row) {
          used.add(digit);
          if (digit === '3') helmet.add(level);
        }
    });
  }
  // The pictures use the five slots of the table, and transparency.
  assert.deepEqual([...used].sort(), ['0', '1', '2', '3', '4', '5']);
  for (const level of [0, 1, 2, 3, 4]) assert.ok(helmet.has(level), `a helmet at size ${level}`);
});
