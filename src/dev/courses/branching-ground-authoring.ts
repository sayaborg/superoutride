import { createDefaultBranchingParent, BRANCHING_DEFAULT_BRANCHING_FORK } from './branching-highway.js';
import { createDeclarativeForkGrowthPlan } from './fork-growth-plan.js';
import { createSpriteAssets } from '../../visual/sprite-assets.js';
import { createFarBackground } from '../../visual/far-background.js';

/** Concrete shipped stage domains shared by offline production baking and regression scenarios. */
export function createBranchingGroundAuthoring() {
  const parent = createDefaultBranchingParent();
  const background = createFarBackground();
  return createDeclarativeForkGrowthPlan(
    parent.guide,
    { ...parent, selectFarBackground: () => background, worldSprites: [] },
    createSpriteAssets(),
    BRANCHING_DEFAULT_BRANCHING_FORK,
  ).authoring;
}
