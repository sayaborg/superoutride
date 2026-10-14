import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';

/**
 * What a Section's road and walls share, each with its ceiling: expanded Strip pieces and the expansion's visits to
 * repeats and elements (both `stripExpansion`), resolved slabs, preblend cells and coefficient storage.
 */
const CEILINGS = {
  stripPieces: 'stripExpansion',
  stripWork: 'stripExpansion',
  stripSlabs: 'stripSlabs',
  preblendCells: 'preblendCells',
  coefficientBytes: 'coefficientBytes',
} as const;
type StripBudgetCount = keyof typeof CEILINGS;

/**
 * A Section's Strip products and work, counted against its ceilings: the road's Strips and every wall's Strips spend
 * from the one budget, so the Section's color and material tables together stay within each ceiling.
 */
export function createStripBudget() {
  const used: Record<StripBudgetCount, number> = {
    stripPieces: 0,
    stripWork: 0,
    stripSlabs: 0,
    preblendCells: 0,
    coefficientBytes: 0,
  };
  const spend = (count: StripBudgetCount, amount: number, path: string, message: string) => {
    used[count] += amount;
    const ceiling = COURSE_DOCUMENT_LIMITS[CEILINGS[count]];
    if (used[count] > ceiling) throw new CourseInputError('resource_limit', path, `${message} exceed ${ceiling}`);
  };
  return Object.freeze({
    /** Spend `amount` of `count`; past the Section's ceiling, a `resource_limit` at `path` with `message`. */
    spend,
    /** One unit of Strip expansion work at `path`. */
    work: (path: string) => spend('stripWork', 1, path, "The Section's Strip expansion visits"),
  });
}
export type StripBudget = ReturnType<typeof createStripBudget>;
