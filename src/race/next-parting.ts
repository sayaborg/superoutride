import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';

/**
 * The side of the next parting along the course after station `s` of `section`, while no checkpoint or finish comes
 * before it: from the gate before a parting (the start, before the first) to the parting, a run is told which road its
 * course takes there. Null where a checkpoint or finish, a branch or the road's end comes first. The look follows each
 * Section's one outgoing Link and goes round a circuit at most once; it holds no distance of its own.
 */
export function nextParting(
  gates: CompiledCourse['gates'],
  section: CompiledSection,
  s: number,
): 'left' | 'right' | null {
  let at = section,
    after = s;
  for (let k = 0; k <= gates.intervals.length; k++) {
    const interval = gates.intervals.find((i) => i.section === at)!;
    const parting = interval.partings.find((p) => p.at.s > after);
    const landmark = [...interval.checkpoints, ...(interval.finish ? [interval.finish] : [])].find(
      (l) => l.at.s > after,
    );
    if (parting && (!landmark || parting.at.s < landmark.at.s)) return parting.side;
    if (landmark || at.outgoing.length !== 1) return null;
    at = at.outgoing[0]!.to.section;
    after = -Infinity;
  }
  return null;
}
