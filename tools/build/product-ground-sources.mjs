import { createBranchingGroundAuthoring } from '../../dist/dev/courses/branching-ground-authoring.js';
import { createLinearHighwayRuntime } from '../../dist/dev/courses/linear-highway.js';
import { createTsukubaCourse2000Runtime, createTsukubaGroundProfile } from '../../dist/dev/courses/tsukuba-circuit.js';
import { createFiscoRuntime, createFiscoGroundProfile } from '../../dist/dev/courses/fisco-circuit.js';
import { createTerrainVisualProfile } from '../../dist/runtime/stage-authoring-compiler.js';
import { circuitWindowToLapSourceChainage } from '../../dist/runtime/circuit-runtime-window.js';

/** Concrete shipped authoring for product baking and its integration probe. No generic engine mode switch. */
export function productGroundSources() {
  const linear = createLinearHighwayRuntime();
  const circuit = (id, live, profile) => ({
    id,
    length: live.window.topology.lapLength,
    profile,
    frame: {
      coordinateFrame: live.window.guide,
      heightProfile: live.window.height,
      terrainProfile: createTerrainVisualProfile(
        { ...profile, ...profile.road },
        live.window.height,
        live.window.visual,
      ),
      sourceS: (s) => circuitWindowToLapSourceChainage(live.window, s),
      positions: [45, live.window.topology.lapLength - 1, live.window.topology.lapLength + 1, live.window.length - 5],
    },
  });
  return [
    {
      id: 'linear',
      length: linear.guide.length,
      profile: linear.groundProfile,
      frame: { ...linear, coordinateFrame: linear.guide },
    },
    circuit('circuit', createTsukubaCourse2000Runtime(), createTsukubaGroundProfile()),
    circuit('fisco', createFiscoRuntime(), createFiscoGroundProfile()),
    ...createBranchingGroundAuthoring().stages.map(({ runtime }) => ({
      id: runtime.packageId,
      length: runtime.heightProfile.courseLength,
      profile: runtime.groundProfile,
      view: runtime.roadView,
      frame: runtime,
    })),
  ];
}
