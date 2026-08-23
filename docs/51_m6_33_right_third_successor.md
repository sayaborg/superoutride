# M6.33 — Symmetric RIGHT Third Successor

## Goal

M6.30 proved unequal branch depth by extending only LEFT. M6.31 then made linear Raster successor chains reusable, and M6.32 made branch fragments composable.

M6.33 applies those generic layers to the previously shorter RIGHT path. No new renderer or browser-loop mechanism is introduced.

Current live topology:

```text
              ┌→ STAGE_2_L → STAGE_3_L → GOAL_L
STAGE_1 ──────┤
              └→ STAGE_2_R → STAGE_3_R → GOAL_R
```

Both branches now contain the same number of route stages while remaining physically independent after the opening junction.

## RIGHT terminal promotion

The validated old RIGHT terminal package is not discarded. It is promoted by opaque package identity only:

```text
CONTENT_GOAL_R
→ CONTENT_STAGE_3_R
```

using:

```text
repackageGuideChartRuntime(...)
```

The promoted runtime retains the same GuideChart, Raster, road view, SurfaceMap, GroundMap, height, terrain, Far Background and world-sprite references. This is not a coordinate transform and does not move the vehicle.

## New GOAL_R

The new terminal stage is generated from the promoted structural source through the existing M6.31 primitive:

```text
compileRasterSuccessorChain(...)
```

Its single RIGHT step owns:

```text
source stage   = STAGE_3_R
choice         = S3R_CONTINUE
transition gate = G_LIVE_STAGE3_R
handoff seam    = H_S3R_CONTINUE
target stage    = GOAL_R
target package  = CONTENT_GOAL_R
finish gate     = G_LIVE_FINISH_R
```

Structural geometry is still produced by the M6.29 `createRasterStageSuccessor()` authority underneath the chain compiler.

## Successor authoring

M6.33 uses the same metric successor recipe as LEFT, with opposite deformation direction:

```text
sourceSeamMinS          = 340 m
overlapMargin           = 30 m
transitionLead          = 20 m
finishAfterSeam         = 150 m
deformationMeters       = 2.5 m
LEFT direction          = -1
RIGHT direction         = +1
gentleTurnLimitDegrees  = 5°
minDeformationRunVertices = 5
D_cam                   = 5 m
dMax                    = 150 m
finishClosureMargin     = 20 m
GroundMap half width    = 12 m
ground half width       = 4.5 m
road half width         = 3.5 m
shoulder width          = 1 m
```

The 5° value is only the conservative source-run selector. Final geometry still must pass ordinary `compileRasterCourse()` with the frozen absolute 10° one-vertex turn limit.

## RIGHT environment identity

The new RIGHT terminal package is compiled through the ordinary M6.24 stage authoring compiler using:

```text
authored.right
```

Therefore the existing RIGHT/mountain environment identity remains package-owned and flows naturally into the new successor. Renderer Core contains no `RIGHT`, `STAGE_3_R`, `S3R_CONTINUE` or mountain decision.

The regression explicitly checks that the promoted `CONTENT_STAGE_3_R` and newly generated `CONTENT_GOAL_R` select the same RIGHT Far Background object while owning distinct Guide/Raster geometry.

## Route composition

M6.32 fragment composition remains the complete live-route assembly authority above M6.28.

The route is now composed from:

```text
root fork fragment
LEFT bridge fragment
LEFT M6.31 successor-chain fragment
RIGHT bridge fragment
RIGHT M6.31 successor-chain fragment
```

The RIGHT bridge now ends at `STAGE_3_R` instead of directly at `GOAL_R`:

```text
STAGE_2_R
→ S2R_CONTINUE
→ PENDING
→ seam COMMIT
→ STAGE_3_R
→ S3R_CONTINUE
→ PENDING
→ seam COMMIT
→ GOAL_R
→ physical FINISH
```

M6.32 canonicalizes shared stage rows and checks cross-fragment identity collisions. M6.28 and the established lower layers remain final RouteDag/content/gate/handoff validators.

## World continuity

No handoff changes world X/Y/Z, yaw or velocities.

The established runtime transaction remains:

```text
physical transition crossing
→ Route DAG accepts choice
→ PENDING
→ forward physical handoff-seam crossing
→ atomic target chart/runtime COMMIT
```

The source stage remains active while PENDING.

## Frozen renderer authority

Unchanged:

```text
world-space physics authority
one chainage → one horizontal scanline
pseudo-depth = signed cyclic chainage difference only
no camera-space Z renderer depth
no Euclidean renderer depth
no lateral depth correction
same d → same scale
same d + same height → same screen Y
Raster Segment road
absolute one-vertex turn <= 10°
Terrain + World Sprite shared far→near Painter
no z-buffer
no polygon road
no perspective-correct texture
0/1 transparency
camera roll 0
```

`main.ts` and `m5-renderer.ts` are unchanged and contain no M6.33 topology decision.

## Regressions

M6.33 adds four dedicated regressions:

1. both LEFT and RIGHT live paths own independent third stages;
2. old RIGHT terminal geometry is promoted to `CONTENT_STAGE_3_R`, while the new `CONTENT_GOAL_R` owns a distinct Guide/Raster and preserves RIGHT environment identity;
3. `S3R_CONTINUE` resolves the physical handoff, new GOAL_R package binding and terminal physical FINISH;
4. RIGHT extension is assembled through M6.31 chain + M6.32 fragments while renderer/main remain topology-agnostic.

All historical M6.30 LEFT, M6.31 chain, M6.32 fragment and first-fork browser render regressions remain active.

## Next

With both branches now proving independent multi-stage continuation, further linear extension provides diminishing architectural value.

The next major proof should be a **second visible downstream junction** inside an active successor-stage domain. It must preserve the same core rule as the opening fork: one chainage-driven lateral cross-section, physical world-space route gates, deferred seam handoff, and exactly one active Raster road domain after COMMIT. No second 3D road renderer is permitted.
