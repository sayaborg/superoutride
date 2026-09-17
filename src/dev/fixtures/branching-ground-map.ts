import { createDefaultBranchingParent, BRANCHING_DEFAULT_BRANCHING_FORK } from '../courses/branching-highway.js';
import { createDeclarativeForkGrowthPlan } from '../courses/fork-growth-plan.js';
import { createSpriteAssets } from '../../visual/sprite-assets.js';
import { createFarBackground } from '../../visual/far-background.js';

/** Real shipped stage domains and transitions, with no product loader or rendering cutover. */
export function createBranchingGroundMapFixture() {
  const parent = createDefaultBranchingParent();
  const background = createFarBackground();
  return createDeclarativeForkGrowthPlan(
    parent.guide,
    { ...parent, selectFarBackground: () => background, worldSprites: [] },
    createSpriteAssets(),
    BRANCHING_DEFAULT_BRANCHING_FORK,
  ).authoring;
}
