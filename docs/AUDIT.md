# Current authority audit

Scope: remove unused alternate source models, implicit content defaults and copied measurement policy; validate compiled source boundaries. Handling calibration and the common vehicle law remain unchanged.

## Architecture decision

- Raster and Guide expose one Path API; compatibility aliases and forwarding functions are removed. General sources own one finite open domain. CIRCUIT already unfolds laps before constructing these sources. Remove the five unused cyclic implementations and move regression fixtures to ordinary open readers; retain open endpoints, physical lap progression and overlapping-copy integration tests.
- Ground appearance is authored content. Road paint is explicit, including junction paint, and outer material comes from logical GroundMap data. GroundBase transparency must not select a rock texture. The existing procedural sampler and stage adapters express these choices without a new renderer mode.
- The concrete tunnel assets, positions and background interval belong to DEV authoring, consumed by the existing composition root. Keep ordinary sprite compilation and the single Painter.
- Workload observation remains diagnostic. Copied milestone measurements and their arbitrary 25% multiplier are not a target-device budget. Replace preservation of those numbers with live accounting, clipping bounds and exact reference-render comparisons.
- Source constructors validate finite authored values before endpoint normalization and own immutable copies. Invalid lateral queries fail rather than masquerading as unsupported terrain.

These changes remove alternate authorities; they introduce no new coordinate, force, vehicle or route branch. Tests must reproduce invalid-data failures and prove authored painting, immutable source data, finite-domain behavior, unchanged rendering and the existing nine-profile physics traces.

## Findings resolved

- NaN endpoints could be rewritten to valid chainage before validation. Nonfinite input now fails before normalization.
- Nonfinite surface width or lateral queries could masquerade as unsupported terrain. Construction/query validation rejects them; genuinely outside supported bands still returns VOID.
- A tolerated nonzero initial SurfaceMap section left a gap at zero and selected the final section. Normalizing the validated first endpoint closes that gap.
- Visual authoring shared nested paint objects with the compiled reader. Profiles now own frozen geometry, paint and material copies.
- Five cyclic source implementations, eight Raster/Guide compatibility names, two forwarding-only DEV modules and the return-to-start child shape are removed. Current circuit unfolding and forward child authoring exercise the ordinary open model.
- Concrete tunnel assets/placement now reside together in DEV; hardcoded road paint and the transparency-to-rock fallback are removed from the renderer/source sampler.
- Historical workload constants, arbitrary 25% budgets and their combining machinery are removed. Live telemetry, clipped workload bounds, portal overdraw, pixel equivalence and complete physical traces remain executable.

## Verification

Local full suite: 861 tests passed. Nonfinite input and mutable-paint regressions were confirmed failing on the starting implementation before their fixes. Exact nine-profile wheel/turning/pedal traces match at 60/120/240 Hz, including 1,152 signed wheel solves. Renderer pixels/workload remain exact. Current browser roads and all successor paint match the immutable reference across their finite domains; the baked GroundMap metadata and binary are byte-identical.

Surface sampling scans immutable bands by index. Paired Node.js 24 arm64 measurements against the starting release (one warm-up per build, five alternating measured pairs) gave median 2312 ms for the reference and 2267 ms for this candidate, about 2.0% shorter. This measures the complete trace probe including serialization, not browser FPS; treat it as a small same-host result, not a target-device guarantee.

No handling parameters or physical law changed. The source remains a finite two-station game model; parameter tuning and target-device acceptance remain open in [NEXT](NEXT.md). This audit establishes the reviewed boundaries and tested behavior, not an exhaustive proof over every possible state.

 Exact-head CI and release follow [development](development.md). [NEXT](NEXT.md) retains the current restart instructions and remaining handling/product work.
