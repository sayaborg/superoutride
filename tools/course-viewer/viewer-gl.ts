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
in vec3 aPosition;
in vec4 aColor;
in float aBeyond;
out vec4 vColor;
out float vDistance;
out float vBeyond;
void main() {
  vec4 eye = uView * vec4(aPosition, 1.0);
  vDistance = -eye.z;
  vColor = aColor;
  vBeyond = aBeyond;
  gl_Position = uProjection * eye;
}`;

const MESH_FRAGMENT = `#version 300 es
precision highp float;
${DEPTH_GLSL}
uniform vec4 uMultiply;
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = vColor * uMultiply;
  gl_FragDepth = viewDepth();
}`;

/** Lines a few pixels wide: each segment a quad widened across the screen. */
const LINE_VERTEX = `#version 300 es
uniform mat4 uView;
uniform mat4 uProjection;
uniform vec2 uViewport;
uniform float uWidth;
in vec3 aPosition;
in vec3 aOther;
in float aSide;
in vec4 aColor;
out vec4 vColor;
out float vDistance;
out float vBeyond;
void main() {
  vBeyond = 0.0;
  vec4 eye = uView * vec4(aPosition, 1.0);
  vec4 otherEye = uView * vec4(aOther, 1.0);
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
in vec3 aPosition;
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
  vec4 eye = uView * vec4(aPosition, 1.0);
  vDistance = -eye.z;
  int board = int(aIds.z);
  int level = int(texelFetch(uBoardLevels, ivec2(board % 1024, board / 1024), 0).r);
  uvec4 place = texelFetch(uLevelTable, ivec2(2 * level, int(aIds.x)), 0);
  uvec4 size = texelFetch(uLevelTable, ivec2(2 * level + 1, int(aIds.x)), 0);
  // A level's texel holds the master's texels under it: the master's coordinates over 2^level.
  vTexel = aTexel / exp2(float(level));
  vFrame = ivec4(place.xy, size.xy);
  vPalette = ivec2(int(place.z), int(aIds.y) + level);
  vFacing = dot(aFacing, uEye - aPosition);
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
 * Triangles of one color each vertex: positions (3 floats), RGBA bytes and, for the ground, how far beyond its course
 * limit a vertex lies (0 within).
 */
export class MeshBuilder {
  readonly chunks = new Chunks();
  readonly positions = new Grow((n) => new Float32Array(n));
  readonly colors = new Grow((n) => new Uint8Array(n));
  readonly beyond = new Grow((n) => new Float32Array(n));
  /** One triangle. */
  triangle(
    p: readonly number[],
    a: number,
    b: number,
    c: number,
    color: readonly number[],
    beyond?: readonly number[],
  ) {
    for (const i of [a, b, c]) {
      this.chunks.add(this.vertexCount, p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!);
      this.positions.push(p[3 * i]!);
      this.positions.push(p[3 * i + 1]!);
      this.positions.push(p[3 * i + 2]!);
      for (let k = 0; k < 4; k++) this.colors.push(color[k]!);
      this.beyond.push(beyond?.[i] ?? 0);
    }
  }
  /** A quad of corners 0, 1 (one side) and 2, 3 (the other), as two triangles. */
  quad(p: readonly number[], color: readonly number[], beyond?: readonly number[]) {
    this.triangle(p, 0, 1, 2, color, beyond);
    this.triangle(p, 2, 1, 3, color, beyond);
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
 * One board vertex: position, master texel, its picture's level table row, its first palette row, its board (whose level
 * this frame picks), facing and tint.
 */
export class BoardBuilder {
  readonly chunks = new Chunks();
  readonly values = new Grow((n) => new Float32Array(n));
  vertex(
    p: readonly number[],
    u: number,
    v: number,
    table: number,
    palette: number,
    board: number,
    facing: readonly number[],
    tint: readonly number[],
  ) {
    this.chunks.add(this.vertexCount, p[0]!, p[1]!, p[2]!);
    for (const value of [p[0]!, p[1]!, p[2]!, u, v, table, palette, board, facing[0]!, facing[1]!, facing[2]!])
      this.values.push(value);
    for (let k = 0; k < 4; k++) this.values.push(tint[k]! / 255);
  }
  get vertexCount() {
    return this.values.length / BOARD_STRIDE;
  }
}
const BOARD_STRIDE = 15;

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

function boxVisible(planes: readonly number[][], chunk: Chunk): boolean {
  for (const p of planes) {
    const x = p[0]! >= 0 ? chunk.max[0] : chunk.min[0],
      y = p[1]! >= 0 ? chunk.max[1] : chunk.min[1],
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
    for (const chunk of m.chunks) if (boxVisible(planes, chunk)) gl.drawArrays(gl.TRIANGLES, chunk.first, chunk.count);
  };
  const remove = (m: GpuMesh | null) => {
    if (!m) return;
    gl.deleteVertexArray(m.vao);
    for (const b of m.buffers) gl.deleteBuffer(b);
  };

  const setDepthUniforms = (p: Program, view: ViewParameters, bias: boolean) => {
    gl.uniformMatrix4fv(p.uniforms.get('uView')!, false, view.view);
    gl.uniformMatrix4fv(p.uniforms.get('uProjection')!, false, view.projection);
    gl.uniform1f(p.uniforms.get('uPerspective')!, view.perspective ? 1 : 0);
    gl.uniform1f(p.uniforms.get('uNear')!, view.near);
    gl.uniform1f(p.uniforms.get('uFar')!, view.far);
    gl.uniform1f(p.uniforms.get('uBias')!, bias ? 1 : 0);
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
      gl.bindVertexArray(null);
      return { vao, count: builder.vertexCount, buffers: [positions, colors, beyond], chunks: builder.chunks.list };
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
      attribute(board, 'aTexel', 2, gl.FLOAT, false, stride, 12);
      attribute(board, 'aIds', 3, gl.FLOAT, false, stride, 20);
      attribute(board, 'aFacing', 3, gl.FLOAT, false, stride, 32);
      attribute(board, 'aTint', 4, gl.FLOAT, false, stride, 44);
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
    begin(view: ViewParameters, background: readonly number[]) {
      gl.viewport(0, 0, view.width, view.height);
      gl.clearColor(background[0]!, background[1]!, background[2]!, 1);
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
     * onto the ground; `translucent` blends them without writing depth.
     */
    drawMesh(
      m: GpuMesh | null,
      view: ViewParameters,
      options: { ground?: boolean; lying?: boolean; translucent?: boolean; multiply?: readonly number[] } = {},
    ) {
      if (!m || !m.count) return;
      gl.useProgram(mesh.program);
      setDepthUniforms(mesh, view, !!options.lying || !!options.translucent);
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
