import type { RasterVertex } from '../core/raster-path.js';
import { MAX_RASTER_VERTEX_TURN_DEGREES } from '../core/raster-path.js';
import { finite, positiveFinite } from '../core/validation.js';

const MAX_STRAIGHT_STEP_METERS = 50;
// Half the compiler's turn limit leaves room at adjoining authored arcs.
const MAX_ARC_STEP_DEGREES = MAX_RASTER_VERTEX_TURN_DEGREES / 2;
const MAX_ARC_STEP_RADIANS = (MAX_ARC_STEP_DEGREES * Math.PI) / 180;

/** Mutable authoring only. Compilation owns validation and immutable geometry; no implicit closure. */
export class RasterTurtle {
  readonly vertices: RasterVertex[];
  x: number;
  z: number;
  heading: number;
  chainage = 0;
  arcCount = 0;

  constructor(start: RasterVertex, heading = 0) {
    finite(start.x, 'turtle x');
    finite(start.z, 'turtle z');
    finite(heading, 'turtle heading');
    this.vertices = [{ ...start }];
    this.x = start.x;
    this.z = start.z;
    this.heading = heading;
  }

  appendStraight(length: number): void {
    positiveFinite(length, 'turtle straight length');
    const steps = Math.ceil(length / MAX_STRAIGHT_STEP_METERS);
    const stepLength = length / steps;
    for (let step = 0; step < steps; step += 1) {
      this.x += Math.sin(this.heading) * stepLength;
      this.z += Math.cos(this.heading) * stepLength;
      this.vertices.push({ x: this.x, z: this.z });
      this.chainage += stepLength;
    }
  }

  appendArc(radius: number, turnRadians: number): void {
    this.arc(radius, turnRadians, Math.ceil(Math.abs(turnRadians) / MAX_ARC_STEP_RADIANS));
  }

  appendArcDegrees(radius: number, turnDegrees: number): void {
    // Subdivide in authored units so a degree/radian round trip cannot add a segment.
    this.arc(radius, turnDegrees * (Math.PI / 180), Math.ceil(Math.abs(turnDegrees) / MAX_ARC_STEP_DEGREES));
  }

  private arc(radius: number, turn: number, steps: number): void {
    positiveFinite(radius, 'turtle arc radius');
    finite(turn, 'turtle arc turn');
    if (turn === 0) throw new RangeError('turtle arc turn must be non-zero');
    const sign = Math.sign(turn);
    this.vertices[this.vertices.length - 1]!.sourceRadius = radius;
    const startHeading = this.heading;
    const centerX = this.x + sign * radius * Math.cos(startHeading);
    const centerZ = this.z - sign * radius * Math.sin(startHeading);
    const chordLength = 2 * radius * Math.sin(Math.abs(turn) / (2 * steps));
    for (let step = 1; step <= steps; step += 1) {
      const heading = startHeading + (turn * step) / steps;
      this.x = centerX - sign * radius * Math.cos(heading);
      this.z = centerZ + sign * radius * Math.sin(heading);
      this.vertices.push({ x: this.x, z: this.z, sourceRadius: radius });
      this.chainage += chordLength;
    }
    this.heading = startHeading + turn;
    this.arcCount += 1;
  }
}
