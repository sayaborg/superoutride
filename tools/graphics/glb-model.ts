import type { PNG as PngDecoder } from 'pngjs';

/**
 * A glTF 2.0 binary model (GLB) read for picture making: its triangle primitives in the scene's coordinates, with
 * their texture coordinates and the base color, roughness and occlusion their materials name. Only what a picture
 * needs is read: triangle primitives, node translation, rotation, scale and matrices, `baseColorTexture` with
 * `baseColorFactor`, `metallicRoughnessTexture` with `roughnessFactor`, and `occlusionTexture` with its `strength`;
 * anything else a model holds is ignored.
 */

const GLB_MAGIC = 0x46546c67,
  JSON_CHUNK = 0x4e4f534a,
  BIN_CHUNK = 0x004e4942;
/** The components an accessor may hold and their sizes in bytes. */
const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZES: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const TRIANGLES = 4;

/** A texture as 8-bit RGBA, rows from the top. */
export interface ModelTexture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/**
 * A material as a picture reads it: its base color factor (linear 0–1 RGBA, as written) and texture, if it has one;
 * its roughness factor and metallic-roughness texture, whose green channel is the roughness; and its occlusion
 * texture, whose red channel is the share of its surroundings a point sees, and that texture's strength.
 */
export interface ModelMaterial {
  readonly factor: readonly [number, number, number, number];
  readonly texture: ModelTexture | null;
  readonly roughness: { readonly factor: number; readonly texture: ModelTexture | null };
  readonly occlusion: { readonly strength: number; readonly texture: ModelTexture | null };
}

/**
 * One triangle primitive in the scene's coordinates: its vertices' positions (x, y, z), unit normals where the model
 * gives them (else null) and texture coordinates (u, v, zero without any), its triangles' corners as vertex numbers,
 * and its material.
 */
export interface ModelPrimitive {
  /** The name of the node whose mesh holds it. */
  readonly node: string;
  readonly positions: Float64Array;
  readonly normals: Float64Array | null;
  readonly uvs: Float64Array;
  readonly corners: Uint32Array;
  readonly material: ModelMaterial;
}

export interface GlbModel {
  readonly primitives: readonly ModelPrimitive[];
  /** Each named node's origin in the scene's coordinates. */
  readonly origins: ReadonlyMap<string, readonly [number, number, number]>;
  /** The document's own `extras`, as written. */
  readonly extras: unknown;
}

type Json = Record<string, unknown>;
const record = (value: unknown, what: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`Expected ${what}`);
  return value as Json;
};
const list = (value: unknown, what: string): unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`Expected ${what} to be a list`);
  return value;
};
const index = (value: unknown, length: number, what: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= length)
    throw new RangeError(`Expected ${what} to name one of ${length}`);
  return value as number;
};

/** 4×4 column-major matrices, as glTF writes them. */
type Matrix = Float64Array;
const IDENTITY = (): Matrix => Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  return out;
}
function nodeMatrix(node: Json): Matrix {
  if (node.matrix !== undefined) {
    const values = list(node.matrix, 'a node matrix').map(Number);
    if (values.length !== 16 || !values.every(Number.isFinite)) throw new TypeError('Expected 16 matrix numbers');
    return Float64Array.from(values);
  }
  const [tx, ty, tz] = node.translation === undefined ? [0, 0, 0] : list(node.translation, 'a translation').map(Number);
  const [qx, qy, qz, qw] = node.rotation === undefined ? [0, 0, 0, 1] : list(node.rotation, 'a rotation').map(Number);
  const [sx, sy, sz] = node.scale === undefined ? [1, 1, 1] : list(node.scale, 'a scale').map(Number);
  for (const v of [tx, ty, tz, qx, qy, qz, qw, sx, sy, sz])
    if (!Number.isFinite(v)) throw new TypeError('Expected finite node transforms');
  const x = qx!,
    y = qy!,
    z = qz!,
    w = qw!;
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx!,
    2 * (x * y + z * w) * sx!,
    2 * (x * z - y * w) * sx!,
    0,
    2 * (x * y - z * w) * sy!,
    (1 - 2 * (x * x + z * z)) * sy!,
    2 * (y * z + x * w) * sy!,
    0,
    2 * (x * z + y * w) * sz!,
    2 * (y * z - x * w) * sz!,
    (1 - 2 * (x * x + y * y)) * sz!,
    0,
    tx!,
    ty!,
    tz!,
    1,
  ]);
}

/**
 * The matrix that turns normals as `matrix` turns points: the inverse transpose of its linear part, row by row
 * (`out[r * 3 + c]`).
 */
function normalMatrix(matrix: Matrix): Float64Array {
  // The linear part a[r][c] = matrix[c * 4 + r]; its inverse's transpose is its cofactors over its determinant.
  const a = (r: number, c: number) => matrix[c * 4 + r]!;
  const cofactor = (r: number, c: number) => {
    const r1 = (r + 1) % 3,
      r2 = (r + 2) % 3,
      c1 = (c + 1) % 3,
      c2 = (c + 2) % 3;
    return a(r1, c1) * a(r2, c2) - a(r1, c2) * a(r2, c1);
  };
  const determinant = a(0, 0) * cofactor(0, 0) + a(0, 1) * cofactor(0, 1) + a(0, 2) * cofactor(0, 2);
  if (!(Math.abs(determinant) > 0)) throw new RangeError('A node scales a mesh to nothing');
  return Float64Array.from({ length: 9 }, (_, k) => cofactor(Math.floor(k / 3), k % 3) / determinant);
}

/**
 * Read a GLB: its JSON and binary chunks, the default scene's primitives and their materials' base colors, and with
 * `surface` their roughness and occlusion; without it, every material's roughness and occlusion are 1, and their
 * textures are not decoded.
 */
export function readGlbModel(bytes: Uint8Array, PNG: typeof PngDecoder, surface = false): GlbModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2)
    throw new TypeError('Expected a glTF 2.0 binary model');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new RangeError('The model is not as long as it says');
  let json: Json | null = null,
    bin: Uint8Array | null = null;
  for (let at = 12; at < bytes.byteLength;) {
    const length = view.getUint32(at, true),
      type = view.getUint32(at + 4, true);
    if (at + 8 + length > bytes.byteLength) throw new RangeError('A model chunk runs past its end');
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === JSON_CHUNK && json === null) json = record(JSON.parse(new TextDecoder().decode(body)), 'a document');
    else if (type === BIN_CHUNK && bin === null) bin = body;
    at += 8 + length;
  }
  if (!json) throw new TypeError('Expected the model’s JSON chunk');
  const buffers = list(json.buffers, 'buffers'),
    bufferViews = list(json.bufferViews, 'bufferViews').map((v) => record(v, 'a buffer view')),
    accessors = list(json.accessors, 'accessors').map((v) => record(v, 'an accessor'));
  if (buffers.length > 1 || (buffers.length === 1 && record(buffers[0], 'a buffer').uri !== undefined))
    throw new TypeError('Expected the model’s one buffer to be its binary chunk');
  const viewBytes = (i: number) => {
    if (!bin) throw new TypeError('Expected the model’s binary chunk');
    const bufferView = bufferViews[index(i, bufferViews.length, 'a buffer view')]!;
    const offset = Number(bufferView.byteOffset ?? 0),
      length = Number(bufferView.byteLength);
    if (!(offset >= 0 && length >= 0 && offset + length <= bin.byteLength))
      throw new RangeError('A buffer view runs past the binary chunk');
    return { bytes: bin.subarray(offset, offset + length), stride: Number(bufferView.byteStride ?? 0) };
  };
  /** An accessor's values as numbers, `size` to an element; normalized integers are read as written. */
  const read = (i: number) => {
    const accessor = accessors[index(i, accessors.length, 'an accessor')]!;
    const component = Number(accessor.componentType),
      size = TYPE_SIZES[String(accessor.type)],
      count = Number(accessor.count),
      bytesPer = COMPONENT_BYTES[component];
    if (!size || !bytesPer || !Number.isInteger(count) || count < 0) throw new TypeError('Unsupported accessor');
    if (accessor.sparse !== undefined) throw new TypeError('Sparse accessors are not read');
    const { bytes: data, stride } = viewBytes(Number(accessor.bufferView));
    const offset = Number(accessor.byteOffset ?? 0),
      step = stride || size * bytesPer;
    if (count && offset + (count - 1) * step + size * bytesPer > data.byteLength)
      throw new RangeError('An accessor runs past its buffer view');
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = new Float64Array(count * size);
    for (let n = 0; n < count; n++)
      for (let c = 0; c < size; c++) {
        const at = offset + n * step + c * bytesPer;
        out[n * size + c] =
          component === 5126
            ? dv.getFloat32(at, true)
            : component === 5125
              ? dv.getUint32(at, true)
              : component === 5123
                ? dv.getUint16(at, true)
                : dv.getUint8(at);
      }
    return { values: out, size, count };
  };

  const textures = list(json.textures, 'textures').map((v) => record(v, 'a texture')),
    images = list(json.images, 'images').map((v) => record(v, 'an image'));
  const decoded = new Map<number, ModelTexture>();
  const texture = (i: number): ModelTexture => {
    const source = index(textures[index(i, textures.length, 'a texture')]!.source, images.length, 'an image');
    const known = decoded.get(source);
    if (known) return known;
    const image = images[source]!;
    if (image.mimeType !== 'image/png') throw new TypeError('Expected PNG textures');
    const png = PNG.sync.read(Buffer.from(viewBytes(Number(image.bufferView)).bytes));
    const made = Object.freeze({ width: png.width, height: png.height, rgba: new Uint8Array(png.data) });
    decoded.set(source, made);
    return made;
  };
  /** A material with no texture: white, roughness 1 and occlusion 1. */
  const plain: ModelMaterial = Object.freeze({
    factor: [1, 1, 1, 1] as const,
    texture: null,
    roughness: Object.freeze({ factor: 1, texture: null }),
    occlusion: Object.freeze({ strength: 1, texture: null }),
  });

  /** A material's texture reference, if it has one: the texture it names, read by the first texture coordinates. */
  const reference = (value: unknown, what: string) => {
    if (value === undefined) return null;
    const info = record(value, what);
    if (Number(info.texCoord ?? 0) !== 0) throw new TypeError('Expected the first texture coordinates');
    return { info, texture: texture(Number(info.index)) };
  };
  const factorOf = (value: unknown, fallback: number, what: string) => {
    const factor = value === undefined ? fallback : Number(value);
    if (!(factor >= 0 && factor <= 1)) throw new RangeError(`Expected ${what} from 0 to 1`);
    return factor;
  };
  const materials = list(json.materials, 'materials').map((v): ModelMaterial => {
    const material = record(v, 'a material');
    const pbr = record(material.pbrMetallicRoughness ?? {}, 'a metallic roughness');
    const factor = (pbr.baseColorFactor === undefined ? [1, 1, 1, 1] : list(pbr.baseColorFactor, 'a factor')).map(
      Number,
    );
    if (factor.length !== 4 || !factor.every(Number.isFinite)) throw new TypeError('Expected four factor numbers');
    const occlusion = surface ? reference(material.occlusionTexture, 'an occlusion texture reference') : null;
    return Object.freeze({
      factor: factor as unknown as readonly [number, number, number, number],
      texture: reference(pbr.baseColorTexture, 'a texture reference')?.texture ?? null,
      roughness: surface
        ? Object.freeze({
            factor: factorOf(pbr.roughnessFactor, 1, 'a roughness factor'),
            texture: reference(pbr.metallicRoughnessTexture, 'a metallic roughness texture reference')?.texture ?? null,
          })
        : plain.roughness,
      occlusion: occlusion
        ? Object.freeze({
            strength: factorOf(occlusion.info.strength, 1, 'an occlusion strength'),
            texture: occlusion.texture,
          })
        : plain.occlusion,
    });
  });

  const nodes = list(json.nodes, 'nodes').map((v) => record(v, 'a node')),
    meshes = list(json.meshes, 'meshes').map((v) => record(v, 'a mesh'));
  const scenes = list(json.scenes, 'scenes').map((v) => record(v, 'a scene'));
  const scene = scenes[json.scene === undefined ? 0 : index(json.scene, scenes.length, 'a scene')];
  if (!scene) throw new TypeError('Expected a scene');
  const primitives: ModelPrimitive[] = [];
  const origins = new Map<string, readonly [number, number, number]>();
  const visit = (i: number, parent: Matrix, depth: number) => {
    if (depth > nodes.length) throw new RangeError('The node tree has a cycle');
    const node = nodes[index(i, nodes.length, 'a node')]!;
    const matrix = multiply(parent, nodeMatrix(node));
    if (node.name !== undefined) origins.set(String(node.name), [matrix[12]!, matrix[13]!, matrix[14]!]);
    if (node.mesh !== undefined)
      for (const p of list(meshes[index(node.mesh, meshes.length, 'a mesh')]!.primitives, 'primitives')) {
        const primitive = record(p, 'a primitive');
        if (Number(primitive.mode ?? TRIANGLES) !== TRIANGLES) throw new TypeError('Expected triangle primitives');
        const attributes = record(primitive.attributes, 'attributes');
        const position = read(Number(attributes.POSITION));
        const uv = attributes.TEXCOORD_0 === undefined ? null : read(Number(attributes.TEXCOORD_0));
        const normal = attributes.NORMAL === undefined ? null : read(Number(attributes.NORMAL));
        if (
          position.size !== 3 ||
          (uv && (uv.size !== 2 || uv.count !== position.count)) ||
          (normal && (normal.size !== 3 || normal.count !== position.count))
        )
          throw new TypeError('Expected positions, normals and texture coordinates for every vertex');
        const positions = new Float64Array(position.count * 3);
        for (let v = 0; v < position.count; v++) {
          const x = position.values[v * 3]!,
            y = position.values[v * 3 + 1]!,
            z = position.values[v * 3 + 2]!;
          for (let r = 0; r < 3; r++)
            positions[v * 3 + r] = matrix[r]! * x + matrix[4 + r]! * y + matrix[8 + r]! * z + matrix[12 + r]!;
        }
        // Normals turn by the inverse transpose of the node's linear part, then are made unit again.
        const inverse = normal && normalMatrix(matrix);
        const normals = normal && new Float64Array(position.count * 3);
        if (normal && inverse && normals)
          for (let v = 0; v < position.count; v++) {
            const x = normal.values[v * 3]!,
              y = normal.values[v * 3 + 1]!,
              z = normal.values[v * 3 + 2]!;
            const n = [0, 1, 2].map((r) => inverse[r * 3]! * x + inverse[r * 3 + 1]! * y + inverse[r * 3 + 2]! * z);
            const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
            for (let r = 0; r < 3; r++) normals[v * 3 + r] = n[r]! / length;
          }
        const corners =
          primitive.indices === undefined
            ? Uint32Array.from({ length: position.count }, (_, k) => k)
            : Uint32Array.from(read(Number(primitive.indices)).values);
        if (corners.length % 3) throw new RangeError('Expected whole triangles');
        for (const corner of corners) index(corner, position.count, 'a vertex');
        primitives.push(
          Object.freeze({
            node: String(node.name ?? `node ${i}`),
            positions,
            normals,
            uvs: uv ? uv.values : new Float64Array(position.count * 2),
            corners,
            material:
              primitive.material === undefined
                ? plain
                : materials[index(primitive.material, materials.length, 'a material')]!,
          }),
        );
      }
    for (const child of list(node.children, 'children')) visit(Number(child), matrix, depth + 1);
  };
  for (const root of list(scene.nodes, 'scene nodes')) visit(Number(root), IDENTITY(), 0);
  return Object.freeze({ primitives: Object.freeze(primitives), origins, extras: json.extras ?? null });
}

/** The offset in `texture`'s RGBA of its texel nearest texture coordinates (u, v). */
function texelOffset(texture: ModelTexture, u: number, v: number) {
  // Coordinates outside 0–1 repeat; 1 itself is the last texel.
  const wrap = (value: number, size: number) => {
    const inside = value >= 0 && value <= 1 ? value : value - Math.floor(value);
    return Math.min(size - 1, Math.floor(inside * size));
  };
  return (wrap(v, texture.height) * texture.width + wrap(u, texture.width)) * 4;
}

/** A material's base color at texture coordinates (u, v), 8-bit RGB: the nearest texel times the factor. */
export function baseColorAt(material: ModelMaterial, u: number, v: number): [number, number, number] {
  const [fr, fg, fb] = material.factor;
  const t = material.texture;
  if (!t) return [255 * fr, 255 * fg, 255 * fb];
  const at = texelOffset(t, u, v);
  return [t.rgba[at]! * fr, t.rgba[at + 1]! * fg, t.rgba[at + 2]! * fb];
}

/** A material's roughness at texture coordinates (u, v), 0–1: its factor times its texture's green, if it has one. */
export function roughnessAt(material: ModelMaterial, u: number, v: number): number {
  const { factor, texture } = material.roughness;
  return texture ? (factor * texture.rgba[texelOffset(texture, u, v) + 1]!) / 255 : factor;
}

/**
 * A material's occlusion at texture coordinates (u, v), 0–1, the share of its surroundings a point sees: its texture's
 * red brought towards 1 by its strength, or 1 without a texture.
 */
export function occlusionAt(material: ModelMaterial, u: number, v: number): number {
  const { strength, texture } = material.occlusion;
  return texture ? 1 + strength * (texture.rgba[texelOffset(texture, u, v)]! / 255 - 1) : 1;
}
