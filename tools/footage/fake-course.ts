import { FAKE_STAGES } from './fake-plan.js';

/** A course document as JSON, edited by record. */
type Json = Record<string, unknown>;
type Position = { joint: string; offset: number };

/** A stub's length and its finish's station: room for the 200 m view past a fork's seam, and a finish to end on. */
const STUB_LENGTH = 400;
const STUB_FINISH = 200;

/**
 * The fake footage's truth course: OUTRUN TEST's `FAKE_STAGES` chained in order, made from the saved OUTRUN TEST
 * document. Each stage keeps its fork: the exit that OUTRUN TEST already sends to the next stage keeps its Link,
 * otherwise the left exit is sent there; every other exit leads to a stub, a short straight Section ending in a finish,
 * enough for the view past the seam. What the footage procedure does not raise is left out, so the round trip compares
 * only what it raises: walls and course-limit openings (an original's walls are not raised). The checkpoint arches stand
 * at their seams, where timing happens, rather than 12 m past them. A row of cones, movable objects, stands on the goal
 * stage's first lane taper.
 */
export function fakeTruthCourse(outrunTest: Json): Json {
  const all = outrunTest.sections as Json[],
    allLinks = outrunTest.links as Json[];
  const ordered = FAKE_STAGES.map((id) => {
    const section = all.find((candidate) => candidate.id === id);
    if (!section) throw new RangeError(`OUTRUN TEST has no stage ${id}`);
    return section;
  });
  const links: Json[] = [],
    stubs: Json[] = [];
  const sections = ordered.map((section, index) => {
    const plan = section.plan as Json[];
    const next = FAKE_STAGES[index + 1];
    const own = allLinks.filter((link) => (link.from as Json).section === section.id);
    if (next) {
      // The exit taken: OUTRUN TEST's own Link to the next stage, or the left one.
      const taken = own.find((link) => link.to === next) ?? own[0]!;
      for (const link of own)
        if (link === taken) links.push({ ...link, to: next });
        else {
          const stub = `${link.id as string}-stub`;
          links.push({ ...link, to: stub });
          stubs.push(stubSection(stub, section));
        }
    }
    const sprites = (section.sprites as Json[]).map((sprite) =>
      sprite.kind === 'sprite' && sprite.image === 'arch-checkpoint'
        ? { ...sprite, at: { joint: plan[0]!.id as string, offset: 0 } satisfies Position }
        : sprite,
    );
    if (section.id === 'interchange') sprites.push(...coneRow(plan));
    return { ...section, walls: [], openLimits: [], sprites };
  });
  return { ...outrunTest, name: 'OUTRUN TEST ROUTE', entry: FAKE_STAGES[0], sections: [...sections, ...stubs], links };
}

/** A stub: a level straight of two 3.6 m lanes, asphalt between verges of the stage's ground, under the stage's sky. */
function stubSection(id: string, from: Json): Json {
  const joint = 'straight-1';
  const at = (offset: number): Position => ({ joint, offset });
  const end: Position = { joint: 'end', offset: 0 };
  const strips = from.strips as Json[];
  // The stage's own base colors: its first open ground and its road.
  const ground = strips.find((strip) => strip.kind === 'strip' && strip.left === null && strip.right === null)!;
  const road = strips.find((strip) => strip.kind === 'strip' && strip.material === 'ASPHALT')!;
  const environment = (from.environments as Json[])[0]!;
  return {
    id,
    plan: [{ kind: 'straight', id: joint, length: STUB_LENGTH }],
    profile: [
      { at: at(0), y: 0, curveLength: 0 },
      { at: end, y: 0, curveLength: 0 },
    ],
    lanes: [
      { kind: 'lane', id: 'a', width: 3.6 },
      { kind: 'lane', id: 'b', width: 3.6 },
    ],
    centerLane: 'a',
    boundaries: [],
    strips: [
      { kind: 'strip', start: at(0), end, left: null, right: null, color: ground.color, material: null },
      {
        kind: 'strip',
        start: at(0),
        end,
        left: { lane: 'a', side: 'left', offset: -3 },
        right: { lane: 'b', side: 'right', offset: 3 },
        color: ground.color,
        material: 'GRASS',
      },
      {
        kind: 'strip',
        start: at(0),
        end,
        left: { lane: 'a', side: 'left', offset: 0 },
        right: { lane: 'b', side: 'right', offset: 0 },
        color: road.color,
        material: 'ASPHALT',
      },
    ],
    walls: [],
    openLimits: [],
    sprites: [],
    environments: [{ ...environment, at: at(0), arrival: 'cut' }],
    gates: [{ kind: 'finish', id: `${id}-finish`, at: at(STUB_FINISH) }],
  };
}

/**
 * Cones every 6 m along lane a's left edge, 0.6 m into lane w, where w narrows to its end (INTERCHANGE's first taper,
 * 1500–1650 m), standing at their own bases as movable objects.
 */
function coneRow(plan: readonly Json[]): Json[] {
  let start = 0;
  const joints = plan.map((element) => {
    const joint = { id: element.id as string, s: start };
    start += element.length as number;
    return joint;
  });
  const at = (s: number): Position => {
    let best = joints[0]!;
    for (const joint of joints) if (Math.abs(joint.s - s) < Math.abs(best.s - s)) best = joint;
    return { joint: best.id, offset: Math.round((s - best.s) * 1e6) / 1e6 };
  };
  const cones: Json[] = [];
  for (let s = 1500; s <= 1650; s += 6)
    cones.push({
      kind: 'sprite',
      image: 'cone',
      palette: 'original',
      at: at(s),
      lateral: { lane: 'a', side: 'left', offset: -0.6 },
      groundOffset: 0,
      unselectedLink: null,
      body: {
        width: 0.3,
        movable: { mass: 4, launchDegrees: 30, knocked: { airborne: 'cone-flying', landed: 'cone-down' } },
      },
    });
  return cones;
}
