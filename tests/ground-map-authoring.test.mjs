import assert from 'node:assert/strict';
import test from 'node:test';
import { GroundMapLogicalProfile } from '../dist/compiler/surface-region-compiler.js';
import { JunctionCrossSectionProfile } from '../dist/course/junction-cross-section.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';
import { createStageRoadView } from '../dist/course/stage-road-view.js';
import { sampleStageGroundMapAtLevel } from '../dist/visual/stage-ground-map-view.js';

const profile = {
  groundLeft: 12,
  groundRight: 12,
  roadLeft: 4.5,
  roadRight: 4.5,
  shoulderWidth: 1,
};

test('a road without authored paint does not acquire an implicit center dash', () => {
  assert.notEqual(sampleGroundMap(3, 0, profile), GROUND_COLORS.marking);
  assert.equal(
    sampleGroundMap(3, 1, {
      ...profile,
      roadMarkings: [{ centerL: 1, width: 0.2, pattern: 'SOLID' }],
    }),
    GROUND_COLORS.marking,
  );
});

test('outer texture follows logical material on either side, without a cliff flag', () => {
  for (const [left, right] of [
    ['ROCK', 'GRASS'],
    ['GRASS', 'ROCK'],
  ]) {
    const authored = {
      ...profile,
      logical: new GroundMapLogicalProfile(100, [{ sStart: 0, name: 'material', left, right }]),
    };
    const expected = {
      ROCK: [GROUND_COLORS.rockA, GROUND_COLORS.rockB],
      GRASS: [GROUND_COLORS.grassA, GROUND_COLORS.grassB],
    };
    assert.ok(expected[left].includes(sampleGroundMap(9, -8, authored)));
    assert.ok(expected[right].includes(sampleGroundMap(9, 8, authored)));
  }
});

test('source and stage junctions repeat the authored paint about carriageway centers', () => {
  const junction = new JunctionCrossSectionProfile({
    sWidenStart: 10,
    sMedianStart: 20,
    sSeparatedStart: 40,
    parentRoadWidth: 9,
    childRoadWidth: 9,
    finalMedianWidth: 2,
    shoulderWidth: 1,
  });
  const view = createStageRoadView({ id: 'paint', sourceLateralOrigin: 0, ...profile });
  const markings = [{ centerL: 1, width: 0.2, pattern: 'SOLID' }];
  const s = 45;
  for (const side of ['LEFT', 'RIGHT']) {
    const center = junction.childCenterLAt(s, side);
    assert.notEqual(sampleGroundMap(s, center, { ...profile, junction }), GROUND_COLORS.marking);
    assert.equal(
      sampleGroundMap(s, center + 1, {
        ...profile,
        junction,
        junctionMarkings: markings,
      }),
      GROUND_COLORS.marking,
    );
    assert.equal(
      sampleStageGroundMapAtLevel(s, center + 1, 0, view, {
        ...profile,
        stageJunction: junction,
        junctionMarkings: markings,
      }),
      GROUND_COLORS.marking,
    );
  }
});

test('current browser course and successor paint matches the immutable reference', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const load = (path) => import(pathToFileURL(resolve(process.env.HOT_PATH_BASELINE_BUILD ?? 'dist', path)).href);
  const reference = await load('visual/ground-map.js');
  const referenceStage = await load('visual/stage-ground-map-view.js');
  const { createM72DefaultBranchingParent, M7_2_DEFAULT_BRANCHING_FORK } =
    await import('../dist/dev/m7-2-default-branching-highway.js');
  const { createM638DeclarativeForkGrowthRuntime } = await import('../dist/dev/m6-38-declarative-fork-growth-plan.js');
  const { createSpriteAssets } = await import('../dist/visual/sprite-assets.js');
  const { createFarBackground } = await import('../dist/visual/far-background.js');
  const { createM71HighwayGroundProfile } = await import('../dist/dev/m7-1-highway-calibration-course.js');
  const { createM93TsukubaGroundProfile } = await import('../dist/dev/m9-3-tsukuba-circuit.js');
  const { createM96FiscoGroundProfile } = await import('../dist/dev/m9-6-fisco-circuit.js');
  const parent = createM72DefaultBranchingParent();
  const route = createM638DeclarativeForkGrowthRuntime(
    parent.guide,
    {
      ...parent,
      selectFarBackground: createFarBackground,
      worldSprites: [],
    },
    createSpriteAssets(),
    M7_2_DEFAULT_BRANCHING_FORK,
  );
  const sources = [
    ...route.registry.packages,
    ...[createM71HighwayGroundProfile(), createM93TsukubaGroundProfile(), createM96FiscoGroundProfile()].map(
      (groundProfile) => ({ groundProfile, roadView: null }),
    ),
  ];
  for (const { groundProfile: ground, roadView: view, heightProfile } of sources) {
    const length = heightProfile?.courseLength ?? 1500;
    for (let s = 0; s < length; s += 7.25) {
      for (let l = -ground.groundLeft; l <= ground.groundRight; l += 0.125) {
        if (view) {
          if (l < -view.groundLeft || l > view.groundRight) continue;
          assert.equal(
            sampleStageGroundMapAtLevel(s, l, 0, view, ground),
            referenceStage.sampleStageGroundMapAtLevel(s, l, 0, view, ground),
          );
        } else {
          assert.equal(sampleGroundMap(s, l, ground), reference.sampleGroundMap(s, l, ground));
        }
      }
    }
  }
});
