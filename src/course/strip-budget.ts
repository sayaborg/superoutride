import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';

/** The Strip product ceilings a Section's road and walls share. */
type StripBudgetLimit = 'stripExpansion' | 'stripSlabs' | 'preblendCells' | 'coefficientBytes';

/**
 * A Section's Strip products, counted against its ceilings: the road's Strips and every wall's Strips spend from the
 * one budget, so the Section's color and material tables together stay within each ceiling.
 */
export function createStripBudget() {
  const used: Record<StripBudgetLimit, number> = {
    stripExpansion: 0,
    stripSlabs: 0,
    preblendCells: 0,
    coefficientBytes: 0,
  };
  return Object.freeze({
    /** Spend `amount` of `limit`; past the Section's ceiling, a `resource_limit` at `path` with `message`. */
    spend(limit: StripBudgetLimit, amount: number, path: string, message: string) {
      used[limit] += amount;
      if (used[limit] > COURSE_DOCUMENT_LIMITS[limit])
        throw new CourseInputError('resource_limit', path, `${message} exceed ${COURSE_DOCUMENT_LIMITS[limit]}`);
    },
  });
}
export type StripBudget = ReturnType<typeof createStripBudget>;
