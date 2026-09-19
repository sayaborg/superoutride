import type { RasterPath } from '../core/raster-path.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import type { Vec2 } from '../core/math.js';
import { CourseInputError } from './course-diagnostics.js';

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function separated(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  return a.some((point, index) => {
    const next = a[(index + 1) % a.length]!;
    const edgeLength = Math.hypot(next.x - point.x, next.z - point.z);
    return b.every((other) => cross(point, next, other) < -GEOMETRY_SAMPLING_TOLERANCE_METERS * edgeLength);
  });
}

/** Gate 1 admits a simple constant strip; gaps between bands conservatively belong to its envelope. */
export function validateConstantCourseStrip(raster: RasterPath, left: number, right: number, path: string): void {
  const edge = (index: number, l: number): Vec2 => ({
    x: raster.vertices[index]!.x + raster.vertexMiters[index]!.x * l,
    z: raster.vertices[index]!.z + raster.vertexMiters[index]!.z * l,
  });
  const quads = raster.segments.map((segment) => {
    const a = segment.startVertexIndex;
    const b = segment.endVertexIndex;
    const quad = [edge(a, left), edge(a, right), edge(b, right), edge(b, left)];
    if (quad.some((point, i) => !(cross(point, quad[(i + 1) % 4]!, quad[(i + 2) % 4]!) > 0))) {
      throw new CourseInputError(
        'semantic_compile_failure',
        path,
        `Mapped band envelope inverts on Raster segment ${segment.index}`,
      );
    }
    return quad;
  });
  for (let i = 0; i < quads.length; i += 1) {
    for (let j = i + 2; j < quads.length; j += 1) {
      if (!separated(quads[i]!, quads[j]!) && !separated(quads[j]!, quads[i]!)) {
        throw new CourseInputError(
          'semantic_compile_failure',
          path,
          `Mapped band envelope intersects between Raster segments ${i} and ${j}; overpasses and loops require a later gate`,
        );
      }
    }
  }
}
