import type { Stripes } from './map-stripes.js';
import type { MapGrid } from './map-terrain.js';
import type { WallMesh } from './map-walls.js';

/**
 * The course viewer's GPU drawing: a true perspective (or parallel) projection with a depth buffer. Depth is written
 * per fragment on a logarithmic scale of the distance along the view, so one buffer holds the whole course and the
 * ground at one's feet; what lies on the ground (a fold, a lying board, a shadow, a line) is drawn with a bias toward
 * the eye that grows with the surface's depth slope, so it never flickers against the ground it lies on.
 */

export interface ViewParameters {
  /** Column-major world-to-view matrix (the eye at the view's origin, looking down −z). */
  readonly view: Float32Array;
  readonly projection: Float32Array;
  readonly perspective: boolean;
  /** Parallel projection: the depth range along the view, metres. */
  readonly near: number;
  readonly far: number;
  /** Viewport in device pixels. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** How much the ground's heights are stretched: every height above it stays as it is. */
  readonly heightScale: number;
}

const DEPTH_GLSL = `
uniform float uPerspective;
uniform float uNear;
uniform float uFar;
uniform float uBias;
in float vDistance;
in float vBeyond;
float viewDepth() {
  float d = vDistance;
  float depth;
  if (uPerspective > 0.5) {
    if (uBias > 0.5) d = (d - 0.01) * (1.0 - 1e-4);
    depth = log(max(d, 1e-4) / uNear) / log(uFar / uNear);
  } else {
    if (uBias > 0.5) d -= 0.01 + (uFar - uNear) * 2e-7;
    depth = (d - uNear) / (uFar - uNear);
  }
  float slope = fwidth(depth);
  if (uBias > 0.5) depth -= 1.5 * slope + 1e-7;
  // Ground beyond its course limits gives way to ground nearer its own course where two lie at one place.
  if (vBeyond > 0.0) depth += vBeyond * (uPerspective > 0.5 ? 2e-6 / log(uFar / uNear) : 1e-9) + (1.0 + vBeyond / 50.0) * slope;
  return clamp(depth, 0.0, 1.0);
}`;

const MESH_VERTEX = `#version 300 es
uniform mat4 uView;
uniform mat4 uProjection;
uniform float uHeightScale;
in vec3 aPosition;
in vec4 aColor;
in float aBeyond;
in float aGround;
out vec4 vColor;
out float vDistance;
out float vBeyond;
out vec3 vWorld;
void main() {
  vec3 position = vec3(aPosition.x, aGround * uHeightScale + aPosition.y - aGround, aPosition.z);
  vec4 eye = uView * vec4(position, 1.0);
  vDistance = -eye.z;
  vColor = aColor;
  vBeyond = aBeyond;
  vWorld = position;
  gl_Position = uProjection * eye;
}`;

/**
 * The viewer's light: from the direction `l` (toward the light), the share a it gives everywhere. Lit, a surface's
 * color is multiplied by `a + (1 − a) · max(n · l, 0)` for its facet's normal n.
 */
export interface Light {
  /** A unit vector toward the light. */
  readonly direction: readonly [number, number, number];
  readonly ambient: number;
}

/** With `uShade`, the color lit by `uLight` (the light's direction and its share everywhere). */
const SHADE_GLSL = `
uniform float uShade;
uniform vec4 uLight;
in vec3 vWorld;
vec4 shaded(vec4 color) {
  if (uShade < 0.5) return color;
  // The facet's normal toward the eye; one seen from below turned up, an upright one (its y lost in rounding) kept.
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (normal.y < -0.05) normal = -normal;
  float light = uLight.w + (1.0 - uLight.w) * max(dot(normal, uLight.xyz), 0.0);
  return vec4(color.rgb * light, color.a);
}`;

const MESH_FRAGMENT = `#version 300 es
precision highp float;
${DEPTH_GLSL}
${SHADE_GLSL}
uniform vec4 uMultiply;
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = shaded(vColor) * uMultiply;
  gl_FragDepth = viewDepth();
}`;

/** Texels a row of the terrain's height texture holds. */
const HEIGHTS_WIDTH = 2048;

/**
 * The course map's terrain: a grid of heights (`uHeights`, row after row, wrapped at `HEIGHTS_WIDTH` texels), each
 * cell of every `uStride`th node two triangles drawn from `gl_VertexID` alone, behind the ribbons where it meets them;
 * at full detail the cells a wall cuts (`uCut`) are left to their pieces (`TERRAIN_PIECES_VERTEX`). With stripes, each
 * node's ψ and ω (`uStripes`) give each triangle's phase at its corners by the stripe patterns' interpolation: from its
 * first corner's `arg ψ`, along each edge by ω and the turn left to the other corner's ψ; the phase runs linearly
 * between them. Each corner's two largest pairs and their shares (`uPairs`) pass to the whole triangle.
 */
const TERRAIN_COMMON = `
uniform mat4 uView;
uniform mat4 uProjection;
uniform highp sampler2D uHeights;
uniform highp sampler2D uStripes;
uniform highp sampler2D uPairs;
uniform float uHasStripes;
uniform int uColumns;
uniform int uRows;
uniform vec3 uGrid;
uniform float uBehind;
uniform float uHeightScale;
out float vDistance;
out float vBeyond;
out vec3 vWorld;
out float vPhase;
out vec3 vWeights;
out float vWall;
flat out vec4 vPairs[3];
const int CORNER_X[6] = int[6](0, 1, 0, 1, 1, 0);
const int CORNER_Z[6] = int[6](0, 0, 1, 0, 1, 1);
ivec2 texel(int k) {
  return ivec2(k % ${HEIGHTS_WIDTH}, k / ${HEIGHTS_WIDTH});
}
float angleOf(vec2 v) {
  return dot(v, v) > 0.0 ? atan(v.y, v.x) : 0.0;
}
// A triangle's phase at its corner own.
float phaseAt(ivec2 nodes[3], int keys[3], int own) {
  vec4 a = texelFetch(uStripes, texel(keys[0]), 0);
  float start = angleOf(a.xy);
  if (own == 0) return start;
  vec4 m = texelFetch(uStripes, texel(keys[own]), 0);
  // Where the two corners' directions disagree, the other's phase runs the other way.
  float sign = dot(a.zw, m.zw) < 0.0 ? -1.0 : 1.0;
  vec2 step = vec2(nodes[own] - nodes[0]) * uGrid.z;
  float turn = 0.5 * dot(a.zw + sign * m.zw, step);
  vec2 other = vec2(m.x, sign * m.y);
  vec2 expected = vec2(cos(start + turn), sin(start + turn));
  return start + turn + angleOf(vec2(dot(other, expected), expected.x * other.y - expected.y * other.x));
}
void place(vec3 world) {
  vec4 eye = uView * vec4(world, 1.0);
  vDistance = -eye.z;
  vBeyond = uBehind;
  vWorld = world;
  gl_Position = uProjection * eye;
}`;

const TERRAIN_VERTEX = `#version 300 es
${TERRAIN_COMMON}
uniform int uStride;
uniform highp usampler2D uCut;
void main() {
  int cell = gl_VertexID / 6, corner = gl_VertexID - cell * 6;
  int cells = (uColumns - 2) / uStride + 1;
  int first = corner < 3 ? 0 : 3, own = corner - first;
  ivec2 nodes[3];
  int keys[3];
  for (int t = 0; t < 3; t++) {
    nodes[t] = ivec2(
      min((cell % cells + CORNER_X[first + t]) * uStride, uColumns - 1),
      min((cell / cells + CORNER_Z[first + t]) * uStride, uRows - 1));
    keys[t] = nodes[t].y * uColumns + nodes[t].x;
  }
  vWall = 0.0;
  int origin = (cell / cells) * uStride * uColumns + (cell % cells) * uStride;
  if (uStride == 1 && texelFetch(uCut, texel(origin), 0).r != 0u) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float height = texelFetch(uHeights, texel(keys[own]), 0).r * uHeightScale;
  vWeights = vec3(own == 0 ? 1.0 : 0.0, own == 1 ? 1.0 : 0.0, own == 2 ? 1.0 : 0.0);
  vPhase = 0.0;
  for (int t = 0; t < 3; t++) vPairs[t] = vec4(0.0);
  if (uHasStripes > 0.5) {
    vPhase = phaseAt(nodes, keys, own);
    for (int t = 0; t < 3; t++) vPairs[t] = texelFetch(uPairs, texel(keys[t]), 0);
  }
  place(vec3(uGrid.x + float(nodes[own].x) * uGrid.z, height, uGrid.y + float(nodes[own].y) * uGrid.z));
}`;

/**
 * The pieces of the cells a wall cuts (`buildWallMesh`): each vertex in a cell's triangle (`aTriangle`, `2k` or
 * `2k + 1`) by its weights on the triangle's corners, at its own height, its phase and pairs the triangle's.
 */
const TERRAIN_PIECES_VERTEX = `#version 300 es
${TERRAIN_COMMON}
in int aTriangle;
in vec3 aWeights;
in float aHeight;
in float aWall;
void main() {
  int k = aTriangle / 2, first = (aTriangle % 2) * 3;
  ivec2 nodes[3];
  int keys[3];
  vec2 at = vec2(0.0);
  for (int t = 0; t < 3; t++) {
    nodes[t] = ivec2(k % uColumns + CORNER_X[first + t], k / uColumns + CORNER_Z[first + t]);
    keys[t] = nodes[t].y * uColumns + nodes[t].x;
    at += aWeights[t] * vec2(nodes[t]);
  }
  vWeights = aWeights;
  vWall = aWall;
  vPhase = 0.0;
  for (int t = 0; t < 3; t++) vPairs[t] = vec4(0.0);
  if (uHasStripes > 0.5) {
    for (int t = 0; t < 3; t++) {
      vPhase += aWeights[t] * phaseAt(nodes, keys, t);
      vPairs[t] = texelFetch(uPairs, texel(keys[t]), 0);
    }
  }
  place(vec3(uGrid.x + at.x * uGrid.z, aHeight * uHeightScale, uGrid.y + at.y * uGrid.z));
}`;

/**
 * The terrain's color: its pair's brighter color where `cos θ > 0` and the darker elsewhere (their mean with the
 * stripes off, and blending to it where a stripe is narrower than a pixel), a wall's always the darker. The pair is the
 * one whose share, linear across the triangle from its corners' (a pair a corner does not keep has none there), is
 * largest.
 */
const TERRAIN_FRAGMENT = `#version 300 es
precision highp float;
${DEPTH_GLSL}
${SHADE_GLSL}
uniform vec4 uColor;
uniform float uHasStripes;
uniform float uStripesOn;
uniform sampler2D uPairColors;
in float vPhase;
in vec3 vWeights;
in float vWall;
flat in vec4 vPairs[3];
out vec4 outColor;
float shareOf(float pair) {
  float share = 0.0;
  for (int t = 0; t < 3; t++)
    share += vWeights[t] * (vPairs[t].x == pair ? vPairs[t].z : vPairs[t].y == pair ? vPairs[t].w : 0.0);
  return share;
}
void main() {
  vec4 color = uColor;
  if (uHasStripes > 0.5) {
    float pair = vPairs[0].x, most = -1.0;
    for (int t = 0; t < 3; t++)
      for (int c = 0; c < 2; c++) {
        float candidate = c == 0 ? vPairs[t].x : vPairs[t].y;
        float share = shareOf(candidate);
        if (share > most) {
          most = share;
          pair = candidate;
        }
      }
    vec4 bright = texelFetch(uPairColors, ivec2(0, int(pair + 0.5)), 0);
    vec4 dark = texelFetch(uPairColors, ivec2(1, int(pair + 0.5)), 0);
    vec4 mean = mix(bright, dark, 0.5);
    float blur = uStripesOn > 0.5 ? clamp(fwidth(vPhase) / 3.14159 - 0.5, 0.0, 1.0) : 1.0;
    color = vWall > 0.5 ? dark : mix(cos(vPhase) > 0.0 ? bright : dark, mean, blur);
  }
  outColor = shaded(color);
  gl_FragDepth = viewDepth();
}`;

/** The walls' cut cells' pieces on the GPU: their vertex array, buffers and vertex count. */
interface TerrainPieces {
  readonly vao: WebGLVertexArrayObject;
  readonly buffers: WebGLBuffer[];
  readonly count: number;
}

/** Rows of the terrain's cells drawn or skipped together, by whether their box meets the view: a power of two. */
const TERRAIN_BLOCK_ROWS = 32;
/**
 * The most cells the terrain draws at once, or one for every two pixels of a larger view: beyond it, every second node
 * (or fourth, …) is drawn instead.
 */
const TERRAIN_CELLS = 1 << 20;
/** The terrain gives way to the ribbons as ground this far beyond its course limit would. */
const TERRAIN_BEHIND = 200;

/** Lines a few pixels wide: each segment a quad widened across the screen. */
const LINE_VERTEX = `#version 300 es
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec2 uViewport;
uniform float uWidth;
uniform float uHeightScale;
in vec3 aPosition;
in vec3 aOther;
in float aSide;
in vec4 aColor;
out vec4 vColor;
out float vDistance;
out float vBeyond;
out vec3 vWorld;
void main() {
  vBeyond = 0.0;
  vec3 scale = vec3(1.0, uHeightScale, 1.0);
  vWorld = aPosition * scale;
  vec4 eye = uView * vec4(aPosition * scale, 1.0);
  vec4 otherEye = uView * vec4(aOther * scale, 1.0);
  // Clip the segment at the near plane so its screen direction stays defined.
  float near = 0.02;
  if (eye.z > -near && otherEye.z < -near) eye = mix(otherEye, eye, (otherEye.z + near) / (otherEye.z - eye.z));
  if (otherEye.z > -near && eye.z < -near) otherEye = mix(eye, otherEye, (eye.z + near) / (eye.z - otherEye.z));
  vec4 a = uProjection * eye;
  vec4 b = uProjection * otherEye;
  vec2 sa = a.xy / a.w * uViewport, sb = b.xy / b.w * uViewport;
  vec2 direction = sb - sa;
  vec2 across = length(direction) > 1e-6 ? normalize(vec2(-direction.y, direction.x)) : vec2(1.0, 0.0);
  a.xy += across * aSide * uWidth / uViewport * a.w;
  vDistance = -eye.z;
  vColor = aColor;
  gl_Position = a;
}`;

const SKY_VERTEX = `#version 300 es
out vec2 vScreen;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vScreen = corner * 2.0 - 1.0;
  gl_Position = vec4(vScreen, 1.0, 1.0);
}`;

const SKY_FRAGMENT = `#version 300 es
precision highp float;
uniform mat3 uRayFromScreen;
uniform sampler2D uSky;
uniform vec2 uSkySize;
uniform float uFocal;
uniform float uYawX;
uniform float uHorizonY;
in vec2 vScreen;
out vec4 outColor;
void main() {
  vec3 ray = normalize(uRayFromScreen * vec3(vScreen, 1.0));
  float yaw = atan(ray.x, ray.z);
  float elevation = asin(clamp(ray.y, -1.0, 1.0));
  float x = mod(floor(uFocal * yaw + uYawX), uSkySize.x);
  float y = clamp(floor(uHorizonY - uFocal * tan(clamp(elevation, -1.55, 1.55)) + 0.5), 0.0, uSkySize.y - 1.0);
  outColor = texelFetch(uSky, ivec2(int(x), int(y)), 0);
}`;

/**
 * Boards: each board draws the level of its picture its scale picks this frame (`uBoardLevels`, by board); each fragment
 * reads its texel's palette index from that level in the atlas (0 is cut away) and its color from that level's palette.
 * Seen from behind, a board shows its mirror image, darker.
 */
const BOARD_VERTEX = `#version 300 es
precision highp usampler2D;
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec3 uEye;
uniform usampler2D uLevelTable;
uniform usampler2D uBoardLevels;
uniform float uHeightScale;
in vec3 aPosition;
in float aGround;
in vec2 aTexel;
in vec3 aIds;
in vec3 aFacing;
in vec4 aTint;
out vec2 vTexel;
flat out ivec4 vFrame;
flat out ivec2 vPalette;
out float vFacing;
out vec4 vTint;
out float vDistance;
out float vBeyond;
void main() {
  vBeyond = 0.0;
  vec3 position = vec3(aPosition.x, aGround * uHeightScale + aPosition.y - aGround, aPosition.z);
  vec4 eye = uView * vec4(position, 1.0);
  vDistance = -eye.z;
  int board = int(aIds.z);
  int level = int(texelFetch(uBoardLevels, ivec2(board % 1024, board / 1024), 0).r);
  uvec4 place = texelFetch(uLevelTable, ivec2(2 * level, int(aIds.x)), 0);
  uvec4 size = texelFetch(uLevelTable, ivec2(2 * level + 1, int(aIds.x)), 0);
  // A level's texel holds the master's texels under it: the master's coordinates over 2^level.
  vTexel = aTexel / exp2(float(level));
  vFrame = ivec4(place.xy, size.xy);
  vPalette = ivec2(int(place.z), int(aIds.y) + level);
  vFacing = dot(aFacing, uEye - position);
  vTint = aTint;
  gl_Position = uProjection * eye;
}`;

const BOARD_FRAGMENT = `#version 300 es
precision highp float;
precision highp usampler2DArray;
${DEPTH_GLSL}
uniform usampler2DArray uAtlas;
uniform sampler2D uPalettes;
uniform float uTint;
in vec2 vTexel;
flat in ivec4 vFrame;
flat in ivec2 vPalette;
in float vFacing;
in vec4 vTint;
out vec4 outColor;
void main() {
  ivec2 texel = vFrame.xy + clamp(ivec2(floor(vTexel)), ivec2(0), vFrame.zw - 1);
  uint index = texelFetch(uAtlas, ivec3(texel, vPalette.x), 0).r;
  if (index == 0u) discard;
  vec4 color = texelFetch(uPalettes, ivec2(int(index), vPalette.y), 0);
  if (vFacing < 0.0) color.rgb *= 0.55;
  color.rgb = mix(color.rgb, vTint.rgb, vTint.a * uTint);
  outColor = color;
  gl_FragDepth = viewDepth();
}`;

/** A shadow: it halves the ground beneath its outline, once, wherever the ground shows. */
const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
precision highp usampler2DArray;
${DEPTH_GLSL}
uniform usampler2DArray uAtlas;
in vec2 vTexel;
flat in ivec4 vFrame;
flat in ivec2 vPalette;
in float vFacing;
in vec4 vTint;
out vec4 outColor;
void main() {
  ivec2 texel = vFrame.xy + clamp(ivec2(floor(vTexel)), ivec2(0), vFrame.zw - 1);
  if (texelFetch(uAtlas, ivec3(texel, vPalette.x), 0).r == 0u) discard;
  outColor = vec4(0.5, 0.5, 0.5, 1.0);
  gl_FragDepth = viewDepth();
}`;

type Program = { readonly program: WebGLProgram; readonly uniforms: Map<string, WebGLUniformLocation> };

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader failed');
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Link failed');
  const uniforms = new Map<string, WebGLUniformLocation>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < count; i++) {
    const name = gl.getActiveUniform(program, i)!.name;
    uniforms.set(name, gl.getUniformLocation(program, name)!);
  }
  return { program, uniforms };
}

/** A growable typed array. */
class Grow<T extends Float32Array | Uint8Array> {
  #data: T;
  length = 0;
  constructor(readonly make: (n: number) => T) {
    this.#data = make(1024);
  }
  push(value: number) {
    if (this.length === this.#data.length) {
      const grown = this.make(this.#data.length * 2);
      grown.set(this.#data);
      this.#data = grown;
    }
    this.#data[this.length++] = value;
  }
  get data(): T {
    return this.#data.subarray(0, this.length) as T;
  }
}

/** Vertices a chunk holds at most: a range drawn or skipped whole, by whether its box meets the view. */
const CHUNK_VERTICES = 12000;

/** A range of a mesh's vertices and the box holding them. */
export interface Chunk {
  readonly first: number;
  count: number;
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

/** Chunks of whole triangles as vertices are added. */
class Chunks {
  readonly list: Chunk[] = [];
  /** Note a vertex at `p`, the `index`th; a new chunk begins at a triangle's first vertex once the last is full. */
  add(index: number, x: number, y: number, z: number) {
    let chunk = this.list.at(-1);
    if (!chunk || (chunk.count >= CHUNK_VERTICES && index % 3 === 0)) {
      chunk = { first: index, count: 0, min: [x, y, z], max: [x, y, z] };
      this.list.push(chunk);
    }
    chunk.count++;
    const p = [x, y, z];
    for (let c = 0; c < 3; c++) {
      chunk.min[c] = Math.min(chunk.min[c]!, p[c]!);
      chunk.max[c] = Math.max(chunk.max[c]!, p[c]!);
    }
  }
}

/**
 * Triangles of one color each vertex: positions (3 floats), RGBA bytes, for the ground how far beyond its course limit a
 * vertex lies (0 within), and the ground's height under it (its own height unless given), which the height scale
 * stretches.
 */
export class MeshBuilder {
  readonly chunks = new Chunks();
  readonly positions = new Grow((n) => new Float32Array(n));
  readonly colors = new Grow((n) => new Uint8Array(n));
  readonly beyond = new Grow((n) => new Float32Array(n));
  readonly grounds = new Grow((n) => new Float32Array(n));
  /** One triangle. */
  triangle(
    p: readonly number[],
    a: number,
    b: number,
    c: number,
    color: readonly number[],
    beyond?: readonly number[],
    grounds?: readonly number[],
  ) {
    for (const i of [a, b, c]) {
      this.chunks.add(this.vertexCount, p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
      this.positions.push(p[3 * i]!);
      this.positions.push(p[3 * i + 1]!);
      this.positions.push(p[3 * i + 2]!);
      for (let k = 0; k < 4; k++) this.colors.push(color[k]!);
      this.beyond.push(beyond?.[i] ?? 0);
      this.grounds.push(grounds?.[i] ?? p[3 * i + 1]!);
    }
  }
  /** A quad of corners 0, 1 (one side) and 2, 3 (the other), as two triangles. */
  quad(p: readonly number[], color: readonly number[], beyond?: readonly number[], grounds?: readonly number[]) {
    this.triangle(p, 0, 1, 2, color, beyond, grounds);
    this.triangle(p, 2, 1, 3, color, beyond, grounds);
  }
  get vertexCount() {
    return this.positions.length / 3;
  }
}

/** Segments, each two points with a color. */
export class LineBuilder {
  points: number[] = [];
  colors: number[] = [];
  segment(a: readonly number[], b: readonly number[], color: readonly number[]) {
    this.points.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
    this.colors.push(...color, ...color);
  }
  /** A polyline through `p` (3 values a point). */
  polyline(p: readonly number[], color: readonly number[]) {
    for (let i = 0; i + 5 < p.length; i += 3) this.segment(p.slice(i, i + 3), p.slice(i + 3, i + 6), color);
  }
}

/**
 * One board vertex: position, the ground's height under it (which the height scale stretches), master texel, its
 * picture's level table row, its first palette row, its board (whose level this frame picks), facing and tint.
 */
export class BoardBuilder {
  readonly chunks = new Chunks();
  readonly values = new Grow((n) => new Float32Array(n));
  vertex(
    p: readonly number[],
    ground: number,
    u: number,
    v: number,
    table: number,
    palette: number,
    board: number,
    facing: readonly number[],
    tint: readonly number[],
  ) {
    this.chunks.add(this.vertexCount, p[0]!, p[1]!, p[2]!);
    for (const value of [p[0]!, p[1]!, p[2]!, ground, u, v, table, palette, board, facing[0]!, facing[1]!, facing[2]!])
      this.values.push(value);
    for (let k = 0; k < 4; k++) this.values.push(tint[k]! / 255);
  }
  get vertexCount() {
    return this.values.length / BOARD_STRIDE;
  }
}
const BOARD_STRIDE = 16;

export interface GpuMesh {
  readonly vao: WebGLVertexArrayObject;
  readonly count: number;
  readonly buffers: readonly WebGLBuffer[];
  /** Its vertex ranges and their boxes, or one range of everything. */
  readonly chunks: readonly Chunk[] | null;
}

/** The view's six clip planes, from its projection and view: a box wholly outside one is not drawn. */
function frustumPlanes(view: ViewParameters): number[][] {
  const m = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += view.projection[k * 4 + r]! * view.view[c * 4 + k]!;
      m[c * 4 + r] = sum;
    }
  const row = (r: number) => [m[r]!, m[4 + r]!, m[8 + r]!, m[12 + r]!];
  const w = row(3);
  return [0, 1, 2].flatMap((r) => {
    const v = row(r);
    return [w.map((x, i) => x + v[i]!), w.map((x, i) => x - v[i]!)];
  });
}

/**
 * Metres: the most a vertex stands above the ground under it, which the height scale leaves as it is (a wall's or a
 * board's top), so a box stretched by it still holds them.
 */
const STANDING_METERS = 100;

/** Whether a box (its heights stretched by `heightScale`, what stands on its ground kept) meets the view. */
function boxVisible(
  planes: readonly number[][],
  chunk: Chunk,
  heightScale: number,
  standing = STANDING_METERS,
): boolean {
  const low = heightScale * chunk.min[1] - Math.max(0, heightScale - 1) * standing,
    high = heightScale * chunk.max[1] + Math.max(0, 1 - heightScale) * standing;
  for (const p of planes) {
    const x = p[0]! >= 0 ? chunk.max[0] : chunk.min[0],
      y = p[1]! >= 0 ? high : low,
      z = p[2]! >= 0 ? chunk.max[2] : chunk.min[2];
    if (p[0]! * x + p[1]! * y + p[2]! * z + p[3]! < 0) return false;
  }
  return true;
}

export interface SkyImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export function createViewerGl(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { antialias: true, stencil: true, depth: true, alpha: false });
  if (!gl) throw new Error('This browser has no WebGL 2');
  const mesh = compile(gl, MESH_VERTEX, MESH_FRAGMENT);
  const line = compile(gl, LINE_VERTEX, MESH_FRAGMENT);
  const sky = compile(gl, SKY_VERTEX, SKY_FRAGMENT);
  const board = compile(gl, BOARD_VERTEX, BOARD_FRAGMENT);
  const shadow = compile(gl, BOARD_VERTEX, SHADOW_FRAGMENT);
  const terrain = compile(gl, TERRAIN_VERTEX, TERRAIN_FRAGMENT);
  const pieces = compile(gl, TERRAIN_PIECES_VERTEX, TERRAIN_FRAGMENT);
  let terrainGrid: {
    grid: MapGrid;
    textures: WebGLTexture[];
    stripes: boolean;
    blocks: { rows: number; box: Chunk }[];
    pieces: TerrainPieces | null;
  } | null = null;
  const emptyVao = gl.createVertexArray();
  let skyTexture: WebGLTexture | null = null,
    skySize = [1, 1];
  let atlas: WebGLTexture | null = null,
    palettes: WebGLTexture | null = null,
    levelTable: WebGLTexture | null = null,
    boardLevels: WebGLTexture | null = null;

  const buffer = (data: ArrayBufferView) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  const attribute = (
    program: Program,
    name: string,
    size: number,
    type: number,
    normalized: boolean,
    stride = 0,
    offset = 0,
  ) => {
    const at = gl.getAttribLocation(program.program, name);
    if (at < 0) return;
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, type, normalized, stride, offset);
  };
  const bindLevels = (p: Program) => {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, levelTable);
    gl.uniform1i(p.uniforms.get('uLevelTable')!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, boardLevels);
    gl.uniform1i(p.uniforms.get('uBoardLevels')!, 3);
  };
  /** Draw a mesh's chunks that meet the view. */
  const drawChunks = (m: GpuMesh, view: ViewParameters) => {
    gl.bindVertexArray(m.vao);
    if (!m.chunks) return gl.drawArrays(gl.TRIANGLES, 0, m.count);
    const planes = frustumPlanes(view);
    for (const chunk of m.chunks)
      if (boxVisible(planes, chunk, view.heightScale)) gl.drawArrays(gl.TRIANGLES, chunk.first, chunk.count);
  };
  const remove = (m: GpuMesh | null) => {
    if (!m) return;
    gl.deleteVertexArray(m.vao);
    for (const b of m.buffers) gl.deleteBuffer(b);
  };

  // The frame's light, or none: each lit drawing reads it.
  let light: Light | null = null;
  const setLight = (p: Program, shade: boolean) => {
    gl.uniform1f(p.uniforms.get('uShade')!, shade && light ? 1 : 0);
    if (light) gl.uniform4f(p.uniforms.get('uLight')!, ...light.direction, light.ambient);
  };
  const setDepthUniforms = (p: Program, view: ViewParameters, bias: boolean) => {
    gl.uniformMatrix4fv(p.uniforms.get('uView')!, false, view.view);
    gl.uniformMatrix4fv(p.uniforms.get('uProjection')!, false, view.projection);
    gl.uniform1f(p.uniforms.get('uPerspective')!, view.perspective ? 1 : 0);
    gl.uniform1f(p.uniforms.get('uNear')!, view.near);
    gl.uniform1f(p.uniforms.get('uFar')!, view.far);
    gl.uniform1f(p.uniforms.get('uBias')!, bias ? 1 : 0);
    gl.uniform1f(p.uniforms.get('uHeightScale')!, view.heightScale);
  };

  return {
    gl,
    remove,
    meshFrom(builder: MeshBuilder): GpuMesh {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const positions = buffer(builder.positions.data);
      attribute(mesh, 'aPosition', 3, gl.FLOAT, false);
      const colors = buffer(builder.colors.data);
      attribute(mesh, 'aColor', 4, gl.UNSIGNED_BYTE, true);
      const beyond = buffer(builder.beyond.data);
      attribute(mesh, 'aBeyond', 1, gl.FLOAT, false);
      const grounds = buffer(builder.grounds.data);
      attribute(mesh, 'aGround', 1, gl.FLOAT, false);
      gl.bindVertexArray(null);
      return {
        vao,
        count: builder.vertexCount,
        buffers: [positions, colors, beyond, grounds],
        chunks: builder.chunks.list,
      };
    },
    linesFrom(builder: LineBuilder): GpuMesh {
      // Each segment a quad of two triangles: its own end, the other end and the side.
      const n = builder.points.length / 6;
      const positions = new Float32Array(n * 6 * 3),
        others = new Float32Array(n * 6 * 3),
        sides = new Float32Array(n * 6),
        colors = new Uint8Array(n * 6 * 4);
      const corners = [
        [0, -1],
        [1, 1],
        [0, 1],
        [0, -1],
        [1, -1],
        [1, 1],
      ] as const;
      for (let i = 0; i < n; i++)
        corners.forEach(([end, side], k) => {
          const v = i * 6 + k,
            own = end === 0 ? 0 : 3,
            other = end === 0 ? 3 : 0;
          for (let c = 0; c < 3; c++) {
            positions[3 * v + c] = builder.points[6 * i + own + c]!;
            others[3 * v + c] = builder.points[6 * i + other + c]!;
          }
          // The far end's side is mirrored so both ends widen to the same side of the segment.
          sides[v] = end === 0 ? side : -side;
          for (let c = 0; c < 4; c++) colors[4 * v + c] = builder.colors[8 * i + (end === 0 ? 0 : 4) + c]!;
        });
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const b = [buffer(positions)];
      attribute(line, 'aPosition', 3, gl.FLOAT, false);
      b.push(buffer(others));
      attribute(line, 'aOther', 3, gl.FLOAT, false);
      b.push(buffer(sides));
      attribute(line, 'aSide', 1, gl.FLOAT, false);
      b.push(buffer(colors));
      attribute(line, 'aColor', 4, gl.UNSIGNED_BYTE, true);
      gl.bindVertexArray(null);
      return { vao, count: n * 6, buffers: b, chunks: null };
    },
    boardsFrom(builder: BoardBuilder): GpuMesh {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const data = buffer(builder.values.data);
      const stride = BOARD_STRIDE * 4;
      attribute(board, 'aPosition', 3, gl.FLOAT, false, stride, 0);
      attribute(board, 'aGround', 1, gl.FLOAT, false, stride, 12);
      attribute(board, 'aTexel', 2, gl.FLOAT, false, stride, 16);
      attribute(board, 'aIds', 3, gl.FLOAT, false, stride, 24);
      attribute(board, 'aFacing', 3, gl.FLOAT, false, stride, 36);
      attribute(board, 'aTint', 4, gl.FLOAT, false, stride, 48);
      gl.bindVertexArray(null);
      return { vao, count: builder.vertexCount, buffers: [data], chunks: builder.chunks.list };
    },
    setSky(image: SkyImage | null) {
      if (skyTexture) gl.deleteTexture(skyTexture);
      skyTexture = null;
      if (!image) return;
      skyTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, skyTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image.rgba);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
      skySize = [image.width, image.height];
    },
    /**
     * The boards' atlas pages (palette indices), level table (`tableWidth` RGBA16UI texels a row) and palette rows (16
     * RGBA colors each).
     */
    setAtlas(
      size: number,
      pages: readonly Uint8Array[],
      table: Uint16Array,
      tableWidth: number,
      paletteRows: Uint8Array,
    ) {
      for (const texture of [atlas, palettes, levelTable]) if (texture) gl.deleteTexture(texture);
      const nearest = (target: number) => {
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(target, p, gl.NEAREST);
      };
      atlas = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas);
      gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.R8UI,
        size,
        size,
        Math.max(1, pages.length),
        0,
        gl.RED_INTEGER,
        gl.UNSIGNED_BYTE,
        null,
      );
      pages.forEach((page, i) =>
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RED_INTEGER, gl.UNSIGNED_BYTE, page),
      );
      nearest(gl.TEXTURE_2D_ARRAY);
      levelTable = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, levelTable);
      const rows = Math.max(1, table.length / (4 * tableWidth));
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16UI,
        tableWidth,
        rows,
        0,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_SHORT,
        table.length ? table : new Uint16Array(4 * tableWidth),
      );
      nearest(gl.TEXTURE_2D);
      palettes = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, palettes);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        16,
        Math.max(1, paletteRows.length / 64),
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        paletteRows.length ? paletteRows : new Uint8Array(64),
      );
      nearest(gl.TEXTURE_2D);
    },
    /** Each board's level this frame, by board index. */
    setBoardLevels(levels: Uint8Array) {
      const width = 1024,
        rows = Math.max(1, Math.ceil(levels.length / width));
      const data = new Uint8Array(width * rows);
      data.set(levels);
      if (!boardLevels) boardLevels = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, boardLevels);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, width, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    },
    /**
     * The course map's terrain: `heights` at `grid`'s nodes (`x0`, `z0` relative to the layout's origin), its walls'
     * cut cells and their pieces, and its stripes with each pair's brighter and darker RGBA colors, or none.
     */
    setTerrain(
      grid: MapGrid | null,
      heights: Float32Array | null,
      walls: WallMesh | null = null,
      stripes: Stripes | null = null,
      pairColors?: Uint8Array,
    ) {
      if (terrainGrid) {
        for (const texture of terrainGrid.textures) gl.deleteTexture(texture);
        if (terrainGrid.pieces) {
          gl.deleteVertexArray(terrainGrid.pieces.vao);
          for (const made of terrainGrid.pieces.buffers) gl.deleteBuffer(made);
        }
      }
      terrainGrid = null;
      if (!grid || !heights) return;
      const rows = Math.ceil(heights.length / HEIGHTS_WIDTH);
      const texture = (
        format: number,
        layout: number,
        type: number,
        width: number,
        height: number,
        data: ArrayBufferView,
      ) => {
        const made = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, made);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, layout, type, data);
        for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
        return made;
      };
      /** A value (or `width` values) for each node, row after row, padded to whole rows of the texture. */
      const nodes = <T extends Float32Array | Uint8Array>(values: T, width: number, make: (n: number) => T) => {
        const data = make(rows * HEIGHTS_WIDTH * width);
        data.set(values);
        return data;
      };
      const textures = [
        texture(
          gl.R32F,
          gl.RED,
          gl.FLOAT,
          HEIGHTS_WIDTH,
          rows,
          nodes(heights, 1, (n) => new Float32Array(n)),
        ),
      ];
      if (stripes && pairColors) {
        // ψ and ω side by side at each node.
        const values = new Float32Array(4 * heights.length);
        for (let k = 0; k < heights.length; k++) {
          values[4 * k] = stripes.psi[2 * k]!;
          values[4 * k + 1] = stripes.psi[2 * k + 1]!;
          values[4 * k + 2] = stripes.omega[2 * k]!;
          values[4 * k + 3] = stripes.omega[2 * k + 1]!;
        }
        textures.push(
          texture(
            gl.RGBA32F,
            gl.RGBA,
            gl.FLOAT,
            HEIGHTS_WIDTH,
            rows,
            nodes(values, 4, (n) => new Float32Array(n)),
          ),
          texture(
            gl.RGBA32F,
            gl.RGBA,
            gl.FLOAT,
            HEIGHTS_WIDTH,
            rows,
            nodes(stripes.pairs, 4, (n) => new Float32Array(n)),
          ),
          texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 2, pairColors.length / 8, pairColors),
        );
      } else
        // Without stripes, a texel of each kind the shaders' samplers take.
        textures.push(
          texture(gl.RGBA32F, gl.RGBA, gl.FLOAT, 1, 1, new Float32Array(4)),
          texture(gl.RGBA32F, gl.RGBA, gl.FLOAT, 1, 1, new Float32Array(4)),
          texture(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 1, 1, new Uint8Array(4)),
        );
      textures.push(
        texture(
          gl.R8UI,
          gl.RED_INTEGER,
          gl.UNSIGNED_BYTE,
          HEIGHTS_WIDTH,
          rows,
          nodes(walls?.cut ?? new Uint8Array(0), 1, (n) => new Uint8Array(n)),
        ),
      );
      let cut: TerrainPieces | null = null;
      if (walls && walls.heights.length) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const buffers = [walls.triangles, walls.weights, walls.heights, Float32Array.from(walls.walls)].map(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[0]!);
        const at = gl.getAttribLocation(pieces.program, 'aTriangle');
        gl.enableVertexAttribArray(at);
        gl.vertexAttribIPointer(at, 1, gl.INT, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]!);
        attribute(pieces, 'aWeights', 3, gl.FLOAT, false);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[2]!);
        attribute(pieces, 'aHeight', 1, gl.FLOAT, false);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[3]!);
        attribute(pieces, 'aWall', 1, gl.FLOAT, false);
        gl.bindVertexArray(null);
        cut = { vao, buffers: buffers as WebGLBuffer[], count: walls.heights.length };
      }
      const striped = !!stripes;
      // Blocks of rows of cells, each with the box of its heights.
      const blocks: { rows: number; box: Chunk }[] = [];
      const cells = grid.nx - 1;
      for (let j0 = 0; j0 + 1 < grid.nz; j0 += TERRAIN_BLOCK_ROWS) {
        const j1 = Math.min(grid.nz - 1, j0 + TERRAIN_BLOCK_ROWS);
        let low = Infinity,
          high = -Infinity;
        for (let k = j0 * grid.nx; k < (j1 + 1) * grid.nx; k++) {
          low = Math.min(low, heights[k]!);
          high = Math.max(high, heights[k]!);
        }
        blocks.push({
          rows: j1 - j0,
          box: {
            first: j0,
            count: j1 - j0,
            min: [grid.x0, low, grid.z0 + j0 * grid.spacing],
            max: [grid.x0 + cells * grid.spacing, high, grid.z0 + j1 * grid.spacing],
          },
        });
      }
      terrainGrid = { grid, textures, stripes: striped, blocks, pieces: cut };
    },
    /**
     * Clear to `background` (RGB, or RGBA where it is to be see-through) and set the state every drawing starts from,
     * and the frame's light (none: unlit).
     */
    begin(view: ViewParameters, background: readonly number[], frameLight: Light | null = null) {
      light = frameLight;
      gl.viewport(0, 0, view.width, view.height);
      gl.clearColor(background[0]!, background[1]!, background[2]!, background[3] ?? 1);
      gl.clearDepth(1);
      gl.clearStencil(0);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.disable(gl.STENCIL_TEST);
    },
    /** The sky at infinity: `rayFromScreen` maps (x, y, 1) in clip units to a world ray. */
    drawSky(rayFromScreen: Float32Array, focal: number, yawX: number, horizonY: number) {
      if (!skyTexture) return;
      gl.useProgram(sky.program);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix3fv(sky.uniforms.get('uRayFromScreen')!, false, rayFromScreen);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skyTexture);
      gl.uniform1i(sky.uniforms.get('uSky')!, 0);
      gl.uniform2f(sky.uniforms.get('uSkySize')!, skySize[0]!, skySize[1]!);
      gl.uniform1f(sky.uniforms.get('uFocal')!, focal);
      gl.uniform1f(sky.uniforms.get('uYawX')!, yawX);
      gl.uniform1f(sky.uniforms.get('uHorizonY')!, horizonY);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },
    /**
     * Opaque or translucent triangles. `ground` marks the stencil where they show (for the shadows); `lying` biases them
     * onto the ground; `translucent` blends them without writing depth; `shade` lights them by the frame's light.
     */
    drawMesh(
      m: GpuMesh | null,
      view: ViewParameters,
      options: {
        ground?: boolean;
        lying?: boolean;
        translucent?: boolean;
        multiply?: readonly number[];
        shade?: boolean;
      } = {},
    ) {
      if (!m || !m.count) return;
      gl.useProgram(mesh.program);
      setDepthUniforms(mesh, view, !!options.lying || !!options.translucent);
      setLight(mesh, !!options.shade);
      const multiply = options.multiply ?? [1, 1, 1, 1];
      gl.uniform4f(mesh.uniforms.get('uMultiply')!, multiply[0]!, multiply[1]!, multiply[2]!, multiply[3]!);
      if (options.ground) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, 1, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      }
      if (options.translucent) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      }
      drawChunks(m, view);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    },
    /**
     * The terrain, in its stripes' colors (`stripes`, or their means) or in `color` where it has none, lit by the frame's
     * light, marking the ground's stencil (for the shadows) as the ground does.
     */
    drawTerrain(view: ViewParameters, color: readonly number[], stripes: boolean) {
      if (!terrainGrid) return;
      const { grid, textures, blocks } = terrainGrid;
      const uniforms = (program: Program) => {
        gl.useProgram(program.program);
        setDepthUniforms(program, view, false);
        setLight(program, true);
        gl.uniform1f(program.uniforms.get('uBehind')!, TERRAIN_BEHIND);
        gl.uniform4f(program.uniforms.get('uColor')!, color[0]! / 255, color[1]! / 255, color[2]! / 255, 1);
        gl.uniform1i(program.uniforms.get('uColumns')!, grid.nx);
        gl.uniform1i(program.uniforms.get('uRows')!, grid.nz);
        gl.uniform3f(program.uniforms.get('uGrid')!, grid.x0, grid.z0, grid.spacing);
        gl.uniform1f(program.uniforms.get('uHasStripes')!, terrainGrid!.stripes ? 1 : 0);
        gl.uniform1f(program.uniforms.get('uStripesOn')!, stripes ? 1 : 0);
        ['uHeights', 'uStripes', 'uPairs', 'uPairColors', 'uCut'].forEach((name, unit) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, textures[unit]!);
          const at = program.uniforms.get(name);
          if (at) gl.uniform1i(at, unit);
        });
      };
      uniforms(terrain);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.bindVertexArray(emptyVao);
      const planes = frustumPlanes(view);
      const visible = blocks.filter((block) => boxVisible(planes, block.box, view.heightScale, 0));
      // One stride for the whole view, so neighbouring blocks meet without a crack.
      const shown = visible.reduce((sum, block) => sum + block.rows, 0) * (grid.nx - 1);
      let stride = 1;
      const budget = Math.max(TERRAIN_CELLS, (view.width * view.height) / 2);
      while (shown / (stride * stride) > budget && stride < TERRAIN_BLOCK_ROWS) stride *= 2;
      gl.uniform1i(terrain.uniforms.get('uStride')!, stride);
      const cells = Math.floor((grid.nx - 2) / stride) + 1;
      const rows = Math.floor((grid.nz - 2) / stride) + 1;
      for (const { box } of visible) {
        const first = box.first / stride,
          last = Math.min(rows, (box.first + TERRAIN_BLOCK_ROWS) / stride);
        gl.drawArrays(gl.TRIANGLES, first * cells * 6, (last - first) * cells * 6);
      }
      // At full detail, the cut cells' pieces and the walls.
      if (stride === 1 && terrainGrid.pieces) {
        uniforms(pieces);
        gl.bindVertexArray(terrainGrid.pieces.vao);
        gl.drawArrays(gl.TRIANGLES, 0, terrainGrid.pieces.count);
      }
      gl.disable(gl.STENCIL_TEST);
    },
    /** The largest picture `renderOffscreen` can draw along either side. */
    get largestOffscreen(): number {
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, viewport[0]!, viewport[1]!);
    },
    /**
     * `draw` into a `width` by `height` picture of its own, multisampled as the screen is, and its RGBA pixels, top row
     * first.
     */
    renderOffscreen(width: number, height: number, draw: () => void): Uint8ClampedArray<ArrayBuffer> {
      const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number);
      const storage = (format: number, multisampled: boolean) => {
        const buffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
        if (multisampled) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, width, height);
        else gl.renderbufferStorage(gl.RENDERBUFFER, format, width, height);
        return buffer;
      };
      const buffers = [storage(gl.RGBA8, true), storage(gl.DEPTH24_STENCIL8, true), storage(gl.RGBA8, false)];
      const drawn = gl.createFramebuffer(),
        resolved = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, drawn);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffers[0]!);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, buffers[1]!);
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffers[2]!);
      const pixels = new Uint8ClampedArray(width * height * 4);
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, drawn);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error(`The GPU cannot draw a picture of ${width} by ${height}`);
        draw();
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, drawn);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resolved);
        const rows = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rows);
        // The GPU's first row is the bottom one.
        for (let y = 0; y < height; y++)
          pixels.set(rows.subarray((height - 1 - y) * width * 4, (height - y) * width * 4), y * width * 4);
      } finally {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(drawn);
        gl.deleteFramebuffer(resolved);
        for (const buffer of buffers) gl.deleteRenderbuffer(buffer);
      }
      return pixels;
    },
    drawLines(m: GpuMesh | null, view: ViewParameters, width: number, onGround: boolean) {
      if (!m || !m.count) return;
      gl.useProgram(line.program);
      setDepthUniforms(line, view, onGround);
      gl.uniform4f(line.uniforms.get('uMultiply')!, 1, 1, 1, 1);
      gl.uniform2f(line.uniforms.get('uViewport')!, view.width / 2, view.height / 2);
      gl.uniform1f(line.uniforms.get('uWidth')!, (width * view.pixelRatio) / 2);
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    },
    /** Boards; `eye` decides which side shows (in a parallel view, a point far back along the view). */
    drawBoards(m: GpuMesh | null, view: ViewParameters, eye: readonly number[], lying: boolean, tint: number) {
      if (!m || !m.count || !atlas || !palettes || !boardLevels) return;
      gl.useProgram(board.program);
      setDepthUniforms(board, view, lying);
      gl.uniform3f(board.uniforms.get('uEye')!, eye[0]!, eye[1]!, eye[2]!);
      gl.uniform1f(board.uniforms.get('uTint')!, tint);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas);
      gl.uniform1i(board.uniforms.get('uAtlas')!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, palettes);
      gl.uniform1i(board.uniforms.get('uPalettes')!, 1);
      bindLevels(board);
      drawChunks(m, view);
    },
    /** Shadows halve the ground beneath them once: only where the ground's stencil is 1, which they then raise. */
    drawShadows(m: GpuMesh | null, view: ViewParameters, eye: readonly number[]) {
      if (!m || !m.count || !atlas || !boardLevels) return;
      gl.useProgram(shadow.program);
      setDepthUniforms(shadow, view, true);
      gl.uniform3f(shadow.uniforms.get('uEye')!, eye[0]!, eye[1]!, eye[2]!);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, atlas);
      gl.uniform1i(shadow.uniforms.get('uAtlas')!, 0);
      bindLevels(shadow);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.depthMask(false);
      drawChunks(m, view);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    },
  };
}
export type ViewerGl = ReturnType<typeof createViewerGl>;
