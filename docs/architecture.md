# Core architecture and rendering contract

This is the current normative coordinate/rendering specification. [Vehicle physics](vehicle-physics.md) and [content and gameplay](content-and-gameplay.md) own their respective layers.

## Coordinates and open geometry

Core owns shared 2D/3D vector arithmetic. Vec2 and Vec3 are readonly value contracts; authoring replaces values instead of mutating coordinate observations.

World X/Y/Z is authoritative. +Y is up, yaw 0 faces +Z; positive yaw rotates toward +X. Positive lateral `l` is right. For heading ψ:

```
t = (sin ψ, cos ψ)      n = (cos ψ, -sin ψ)
```

Course `(s,l)` is a derived observation. `s` is the shared plan chainage of Raster and Guide, not physical travel distance along a sloping/offset path. Local projection uses a known previous segment and a finite clipped neighborhood. Known spawn/recovery coordinates seed that same local search; a global nearest-point search cannot distinguish overlapping circuit copies. Invalid seeds fail explicitly rather than silently selecting another copy. Optional explicit lateral clamping acts in the underlying Guide basis before subtracting a stage's lateral origin; clamping a translated local coordinate against the unshifted limits is invalid. Ordinary physical projection remains unclamped.

The general domain of RasterPath, GuidePath, HeightProfile, VisualProfile, logical/baked GroundMap and SurfaceMap is `[0,L]`. Sampling outside it is invalid. All source readers share a 1e-9 m endpoint normalization through `openProfileChainage`, including SurfaceMap and unfolded circuit adapters. Raster/Guide geometric sampling retains its separately named 1e-8 m tolerance. Shared tolerances live in [Core tolerances](../src/core/tolerances.ts); unrelated numerical cutoffs remain named with their purpose and units at their owning algorithm. Equal numeric values do not establish a common authority. These tolerances never wrap or award progress. Constructors reject nonfinite authoring before endpoint normalization. Raster/Guide geometry, height, visual, logical-material and physical-surface profiles own immutable copies so later authoring edits cannot change a compiled source. Consecutive authored vertices form the path; no final-to-first segment is manufactured. At endpoints the adjacent segment supplies the basis and there is no synthetic turn or fillet. Terrain visibility clips to the finite domain. Author enough run-in/runout for camera, drawing and handoff.

CIRCUIT unfolds authored topology into a finite ordinary open window before constructing the same open source profiles. General profile classes provide no cyclic alternate implementation. Renderer and physics do not infer topology.

## Numerical threshold ownership

Exact values remain in the linked source owners. Equal numbers do not imply interchangeable meanings. The map distinguishes dimensional roundoff tolerances, finite-domain guards and deliberate control/visibility thresholds; only shared boundary semantics belong in Core tolerances.

| Owner / thresholds                                                                                                                                                                                                                                       | Units                                               | Why separate                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Core tolerances](../src/core/tolerances.ts): source endpoints; geometry sampling; lateral boundaries                                                                                                                                                    | m                                                   | Source normalization, geometric joins and lateral classification have different contracts.                                            |
| [Core tolerances](../src/core/tolerances.ts): pixel edges; texel spacing                                                                                                                                                                                 | screen px; m/texel                                  | Destination coverage and source-sample spacing are different metrics.                                                                 |
| [RasterPath](../src/core/raster-path.ts): minimum segment, miter denominator, vertex turn                                                                                                                                                                | m; dimensionless; rad                               | Reject degenerate geometry without changing the authored turn limit.                                                                  |
| [Guide](../src/core/guide-curve.ts): arc center, compilation, zero turn                                                                                                                                                                                  | m; m; rad                                           | Center agreement and compilation validation are distinct from reader join tolerance; positive readable intervals survive compilation. |
| [Terrain](../src/terrain/terrain-line.ts): visible/depth intervals                                                                                                                                                                                       | m                                                   | Visibility clipping and finite depth interval construction differ from source endpoint normalization.                                 |
| [Terrain](../src/terrain/terrain-line.ts): invertible span, row/boundary denominators, minimum span                                                                                                                                                      | screen px                                           | Projection inversion, row sampling and thin-span collapse have different degeneracies.                                                |
| [Terrain](../src/terrain/terrain-line.ts): flat-height coefficient                                                                                                                                                                                       | px·m                                                | This is the depth-dependent projection coefficient, not a height or pixel distance.                                                   |
| [Renderer](../src/render/renderer.ts): minimum texture span                                                                                                                                                                                              | screen px                                           | Guards affine texture inversion, independently of terrain generation.                                                                 |
| [GroundMap LOD](../src/groundmap/ground-map-lod.ts) and [asset compiler](../src/groundmap/ground-map-asset-compiler.ts): level/texel-count rounding                                                                                                      | dimensionless                                       | Discrete level selection and integer allocation round different quantities.                                                           |
| [Footprints](../src/dev/diagnostics/terrain-footprint-analysis.ts) and [target envelope](../src/groundmap/ground-map-target-envelope.ts): footprint, level capacity, observed footprint                                                                  | m                                                   | Source-footprint accumulation, compiled capacity and observed-bound checks are separate comparisons.                                  |
| [World gate](../src/gameplay/world-crossing-gate.ts), [physical race gate](../src/gameplay/physical-race-gate.ts): width, motion direction                                                                                                               | m                                                   | Gate width classification and directional motion checks do not define a crossing dead band.                                           |
| [Ordered race](../src/gameplay/ordered-race-progress.ts), [field route](../src/gameplay/field-route-progress.ts), [circuit race](../src/gameplay/circuit-race-progress.ts): progress, gate-candidate padding, finish runout                              | m                                                   | Validated progress, candidate search and unscored endpoint clearance are distinct responsibilities.                                   |
| [Route handoff](../src/gameplay/route-stage-handoff.ts), [continuation](../src/runtime/stage-continuation-link.ts), [package](../src/runtime/stage-runtime-content.ts), [circuit window](../src/runtime/circuit-runtime-window.ts): anchors and geometry | m; continuation heading in rad                      | Physical anchor agreement, chart overlap, package agreement and circuit seams validate different compiled relationships.              |
| [Successor](../src/runtime/raster-stage-successor.ts), [traveler](../src/runtime/live-route-traveler.ts): runout turn/length, lateral intent                                                                                                             | degrees; m; m                                       | Authored runout validation and AI lateral intent are not integration corrections.                                                     |
| [Shared route choice](../src/gameplay/shared-route-choice-authority.ts): crossing-fraction ties                                                                                                                                                          | dimensionless                                       | Arbitration compares a fraction within the current tick, not world distance.                                                          |
| [Race session](../src/gameplay/race-session.ts): rank progress, race time, timer rounding                                                                                                                                                                | m; s; ms                                            | Ranking, time comparison and displayed integer time have separate units.                                                              |
| [Wheel](../src/physics/tire-wheel.ts): torque residual                                                                                                                                                                                                   | N·m                                                 | Stops the signed torque solve; cannot replace geometric or control tolerances.                                                        |
| [Contact](../src/physics/vehicle-dynamics.ts), [steering limiter](../src/physics/steering-input-limiter.ts), [actuator](../src/physics/driving-actuator.ts): projected direction, plane determinant, target                                              | dimensionless                                       | Basis degeneracy, plane solvability and normalized actuator arrival are different numerical checks.                                   |
| [Camera](../src/camera/camera.ts), [rival](../src/gameplay/rival-driver.ts), [recovery](../src/gameplay/recovery.ts): response minimum, straight curvature/lookahead interval, penetration                                                               | s; 1/m and m; m                                     | These are presentation, driving and recovery policies, not shared source precision.                                                   |
| [Selector values](../src/browser/selector-values.ts), [tire selector](../src/browser/tire-friction-selection.ts): value equality, grid rounding                                                                                                          | selector value units; dimensionless grid coordinate | UI matching and grid alignment never change physical solver precision.                                                                |

## Raster and Guide

Raster is a polyline with `|Δheading| <= 10°` at every interior vertex. Left/right road and ground widths are independent. Edge continuity uses the exact miter basis; constant-width miter ratio is `1/cos(Δ/2)`. Road/ground bands must have finite joins and no local inversion or unintended intersections/overlaps. Validation must inspect the actual band geometry. Do not replace this with an approximate rule comparing width to corner radius.

Current automated compilation covers finite Raster vertices/miters, the turn limit, Guide metrics, fillet overlap and supported lateral envelopes. See the [content-validation limit](NEXT.md#remaining-limits) before accepting new courses. Intentional coincident circuit copies cannot be rejected as ordinary authoring collisions.

Guide lookup retains the adjacent segment at a roundoff-size fillet join, using the existing endpoint tolerance. It must never fall through to an unrelated end segment. Compiled coverage and omitted primitive intervals must fit the reader's sampling tolerance even when the author permits a larger dimensional validation tolerance. In particular, a positive straight longer than the sampling tolerance remains a real primitive.

Geometry breaks at the union of heading, render-height, road-width and ground-width changes. Surface/texture/GroundBase changes are paint/material lookups and do not require geometry splits. Interpolate geometry linearly inside a segment.

Guide rounds only the coordinate curve with straight/circular fillets; the rendered road stays Raster. For a turn Δ and radius R:

```
μ = |Δ| / (2 tan(|Δ|/2))     (μ=1 at zero turn)
κ = sign(Δ)/R
J = μ(1 - κl)
Rmin = lMax / (1 - mMin/μ)
trim = R tan(|Δ|/2)
max Guide/Raster deviation = R(sec(|Δ|/2) - 1)
```

Require `0 < mMin < μ`, `J >= mMin` throughout the supported chart, and adjacent trims not to overlap. Opposite-curvature fillets retain the compiler's required intervening straight. Guide is G¹ (continuous position and tangent direction); parameter speed changes between 1 and μ, so it is not generally C¹ in global s.

The compiler derives R from the chart margin or explicit circular authoring provenance; R is not another artist slider. Supported SurfaceMap envelopes must remain strictly inside the Guide chart: `maxSupportedAbsL + abs(lateralOrigin) < guide.lMax`. The reader owns a conservative bound in its local lateral frame, including junction support and boundary classification tolerance. Compilation checks this in authored packages, runtime registries, circuit windows and linear composition; there is no single stage compiler shared by every course. Visual width is independent. The positive chart margin is an authored content parameter, not a physical force or pose correction. The chart edge is a chosen metric bound (`J >= mMin > 0`), not the singularity `J=0`; physical local projection does not clamp lateral motion. Visual GroundMap may extend beyond it. See [guide compiler](../src/core/guide-curve.ts) and [geometry validation](../src/physics/surface-guide-envelope.ts).

## Height and projection

Terrain height is `Y(s,l)=Y(s)`: no lateral camber/bank in raster geometry. The height reader provides piecewise-linear render height and smooth physical/camera height. [Render height mapping](../src/render/render-height-space.ts) translates an actor's physical clearance above local ground into render height; it does not alter the actor's physical Y.

The complete pseudo projection is:

```
d = s_object - s_camera                  d > 0
xr = (X-Xcam) cos ψcam - (Z-Zcam) sin ψcam
scale = f/d
screenX = cx + scale*xr
screenY = cy - f*sin φ - scale*(Y-Ycam)*cos φ
horizonY = cy - f*sin φ
```

Depth contains no Euclidean distance, camera-space Z, lateral correction, course-length modulo, winding or route state. Same d gives the same scale; same d and height gives the same screen Y. Every terrain chainage maps to one horizontal line. This intentional pseudo-3D distortion must not be “corrected” into normal perspective.

[Projection](../src/core/projection.ts) owns the formula. [Terrain generation](../src/terrain/terrain-line.ts) uses it, with forward visibility limited by road heading and camera direction. Horizontal mapping along each line is affine; texture mapping is not perspective-correct. Terrain is emitted globally far-to-near, including hills/dips that overdraw the same row. Nearly horizontal/degenerate projected spans collapse to one destination row while preserving their complete source footprint.

## Camera and fixed metric

The player reference is physical width 2 m, source width 80 texels, screen width 80 px at player depth. Therefore `f/D_cam = 40 px/m`, `D_cam=f/40`; current f=200 px and D_cam=5 m. Current near/far depths are 2.5/200 m. Changing FOV changes D_cam to preserve this metric. No arbitrary visual scale is permitted.

[Current camera](../src/camera/camera.ts) keeps `s_camera=s_vehicle-D_cam` with no wrap. Its XZ offset follows the selected yaw; body yaw is the default, movement yaw the alternate. Player horizontal centering is derived from the projection, and vertical follow is bounded and smoothed. Physical body pitch is subtracted from the downward base pitch. Camera roll is always zero. Current composition derives height from base pitch 12°, player anchor row 190 and the fixed metric; vertical-follow τ=0.22 s and correction bound=4 m. These presentation parameters do not feed physics.

## Ground and background

GroundMap visual appearance and SurfaceMap physical support/friction are independent. TRANSPARENT visual GroundBase can coexist with a supported surface; VOID can coexist with visible terrain.

GroundBase fills outside the finite GroundMap strip on each emitted terrain line. It is not a separate depth layer. Each side independently selects solid color or transparency; transparent pixels leave already-drawn farther content visible. Far Background is a full image with meaningful pixels below its horizon, aligned by a source-horizon anchor. Yaw scrolls the background; no camera roll or alpha blending is introduced. The [background source format](../src/visual/far-background.ts) owns 640×320 pixels, horizon row 126 and yaw density 200 source pixels/radian. Source yaw density and camera focal length have different units and remain independent authoring/presentation quantities despite their equal current numbers.

Production courses currently use procedural GroundMap sampling. The offline compiler and finite baked reader are exercised by regression assets; production integration is planned, not complete. `roadMarkings` owns ordinary road paint; `junctionMarkings` owns paint relative to each junction carriageway center. Omitted paint means no marking. Source and stage samplers use the same paint primitive. Terrain lines resolve source/baked/stage sampling once before the pixel loop. Stage pixel-center overshoot is clipped to the authored local strip before its strict local classifier; ordinary source sampling retains its existing outer-material behavior. This is visual edge coverage, not physical lateral clamping. Logical left/right materials select outer textures; GroundBase transparency never implies rock. Loaded assets validate integer payload offsets and encoding, then own immutable metadata and a private byte copy. Source and circuit-window readers share the same integer texel-center metric. Palette/RGB555 encoding belongs to the [compiler encoder](../src/groundmap/ground-map-encoding.ts); chunk addressing and decoding belong to the [baked reader](../src/groundmap/baked-ground-map.ts). Source texel density at reference depth d0 follows:

```
qL = d0/f
qS = d0²/(f*h*cos φ)
```

The shared anisotropic pyramid downsamples lateral by 2^k and chainage by 4^k. Runtime chooses k from actual chainage footprint `Δs_eff`, not lateral footprint: `ceil(log4(Δs_eff/qS))`, bounded by the compiled pyramid. Lateral footprint is diagnostic. Collapsed spans include the entire source interval. `Δs_eff <= dMax-dMin` bounds required pyramid coverage. See [footprint contract](../src/groundmap/ground-map-lod.ts) and [target envelope](../src/groundmap/ground-map-target-envelope.ts).

## Sprites and Painter

Sprites have a source bitmap, physical width and a texel-center ground anchor. Uniform texel magnification is `(f/d)*worldWidth/sourceWidth`; identical d and size must produce identical scale. Course-attached anchors use render ground height and their known s. Dynamic actor anchors use observed course s and mapped physical height.

Yaw/bank variants are discrete authored assets. No arbitrary runtime bitmap rotation, z-buffer, alpha blending or extra visualScale. Current assets use at most 15 opaque colors plus transparent; 0 pixels are transparent. Scaling uses nearest-neighbor samples. Bank selection is presentation only; see [vehicle physics](vehicle-physics.md).

Order is optional clear -> full Far Background -> single far-to-near Terrain + World Sprite Painter -> player -> HUD. Equal-depth terrain is painted before sprites. Player is last among world visuals even where pseudo geometry distorts physical distance. [Current renderer](../src/render/renderer.ts) owns this pipeline. Detailed workload arrays are allocated only when instrumentation is requested.

## Layer and computation rules

Core owns RasterPath, GuidePath, HeightProfile and open source-domain operations. Graphics owns framebuffer, color codec, sprite blitting and Painter primitives; visual owns background/sprite assets and visual sections; render assembles the drawing pipeline and projected course/dynamic sprites. GroundMap owns logical/baked readers, baking, filtering and footprint contracts. Course owns road/shoulder cross-section geometry. GroundMap and physics independently map that geometry to paint and physical materials; physical surface/Guide containment belongs to physics. Circuit race compilation consumes a gameplay-owned window reader. Vehicle presentation-family metadata belongs to the vehicle catalog.

Audio owns procedural sound and consumer read contracts; vehicle binds authored acoustic profiles and browser adapts physical observations. Audio imports only Core; physics never imports audio. See [audio](audio.md).

All general directory dependencies, including type imports, follow the acyclic ownership graph enforced by [repository hygiene](../tests/infrastructure/repository-hygiene.test.mjs). A small directory can own a distinct contract; file count alone does not justify merging it.

General engine modules never import `src/dev`; only the three browser composition roots assemble concrete DEV content. Route/mode choices happen there. Runtime content provides ordinary reader contracts to physics, camera and renderer. Compilers own topology expansion, validation, static geometry and asset preparation; avoid per-pixel geometry, trigonometry or per-object alternative depth rules.

Keep painter, metric, physical-gate and local-coordinate regressions executable. Build-time asset cost, steady-state rendering cost and optional diagnostics are different measurements. Host timings are not target-device certification.

## Compiled profile and asset boundaries

Surface, logical GroundMap, visual sections and height nodes share immutable ordered construction and binary lookup. SurfaceMap owns physical-band sorting, overlap rejection and material validation. Terrain traversal merges explicit authored boundaries and emits adjacent positive intervals; it never advances coordinates by a nudge. Exact duplicate boundaries are removed, while distinct authored intervals remain represented.

Live envelope checks and `createSpriteAsset` validate consumed content. Sprite construction validates dimensions, buffer length, finite anchors and positive physical width, then freezes metadata so a second scale field cannot be attached. Runtime source reachability establishes production use; declared offline compiler reachability establishes build-time use. A test import alone establishes neither. Regression fixtures and diagnostics have separate DEV directories and must remain consumed by tests or tools.

## Ground authoring boundaries

`RoadCrossSection` owns ordinary road/shoulder dimensions. GroundMap profiles and stage road views
hold this geometry rather than independently authored width fields. Junctions retain a compiled
incoming cross-section and derive their outgoing road widths. Stage compilers derive terrain widths
and physical bands from the same geometry; terrain's flat numeric dimensions are compiled output.
The child-stage content currently explicitly uses 1 m shoulders, independently of the highway
parent's 1.5 m shoulders. Changing this content difference or boundary priority requires a separate
behavioral revision. Display extents and physical support extents remain separate inputs.
Stage registration exposes the applicable junction geometry and its chainage transform to route
intent; the runtime route tick does not inspect GroundMap paint or storage data.

Geometry does not own paint, grip or support. GroundMap materials, GroundBase sections and physical
surface sections retain independent ordered change points, compiled by their native profile types.
Visual types belong to visual/GroundMap, physical types to physics; no combined region table owns them.
The stadium's sand/dirt patches deliberately retain grass-colored diagnostic textures: their
physical materials are independent fixtures, not evidence of visually matched terrain authoring.

`OUTSIDE` interpretation is explicit: visual ground extents delimit drawing, while physical outside
bands delimit support and their absence means VOID. For example, branching-highway ground is drawn
out to 13 m to cover the split, while ordinary physical outside bands end at 12 m. These are separate
purposes, not competing road-width authorities. Existing shared-edge semantics are retained:
ordinary visual classification prefers road, ordered physical bands prefer the left inclusive band,
and junction classification uses its explicit lateral tolerance. Changing those conventions would
be a separate behavioral revision, not a cleanup.

## Accepted authoring target: pending implementation

The current procedural ground path and single-bitmap SpriteAsset remain the deployed implementation.
The accepted target below requires explicit rendering-contract revisions and causal tests before
activation; it does not silently advance the immutable mechanics/pixel reference.

- Sprite and ground-image source density is 40 texels/m in both authoring axes. Ground source
  density is distinct from the compiled anisotropic GroundMap spacing described above.
- Ordinary sprite masters and every generated LOD use RGB555, at most 15 opaque colors and one
  transparent slot, with binary final alpha. Runtime nearest scaling and continuous projected
  size remain; LOD images are spaced by one octave in linear resolution.
- Every LOD preserves the master's logical metric extent and anchor. Storage dimensions, crop,
  padding and texel-center mapping are separate. Odd dimensions and level selection must be
  resolved before extending SpriteAsset/the blitter. A stored LOD's width never redefines the
  vehicle's physical dimensions.
- GroundMap and its LOD are generated before game startup. Product runtime loads completed assets,
  selects a level and samples it; it does not composite source imagery or generate prefilters.
  Stage-local shoulders and junction paint must be included in the compiled color field. Loading
  completed chunks during play is distinct from generating them; residency remains undecided.
- Vehicles remain SINGLE: one sprite instance per vehicle. Yaw/bank sampling steps and source
  camera projection are undecided; there is no accepted fixed 24-by-5 sampling grid.

First measure stored/transfer bytes, alignment overhead, compiler peak memory, reader residency,
load-time copies and transition-time coexistence on representative courses. Current packed readers
must not be budgeted as if they expanded every texel to RGBA. Archive compression is not evidence
of HTTP compression. Preserve separate mechanics comparison when intentionally revising pixel output.

### GroundMap integration design: compiler implemented, runtime pending

The file-backed row compiler and final stage-local color sources below are implemented for
build/test assets. Product-density asset delivery, paged browser loading and readiness are still pending. Their executable contracts and migration
gates must land before activation. GroundMap owns the image lattice, filtering,
encoding and resident reader; runtime owns stage/circuit coordinate adapters; browser composition
owns asynchronous loading and readiness. Topology and physics do not depend on asset availability.

**Compiler input and domain.** Compile one immutable final-color source over an explicit finite
local rectangle. The source supplies its metric domain and a deterministic color evaluator; concrete
course/stage composition supplies geometry, paint and material inputs through existing owners.
`GroundMapCompileSource` owns the finite rectangle and evaluator; `createGroundMapCompileSource`
adapts ordinary profiles or a StageRoadView through the existing paint samplers. It rejects already
baked inputs and out-of-domain source access. Callers keep the referenced paint inputs immutable
throughout compilation. An absent logical profile retains the current grass fallback.
Its initial evaluator reproduces current point-sampled procedural paint. Exact-area composition,
new material palettes and color-space changes remain separate unresolved image-processing work.

A stage evaluator includes the existing local junction and shoulder precedence, then source
chainage/lateral transforms, exactly once. Its baked reader consumes stage-local coordinates directly;
runtime must not apply those transforms or repaint shoulders a second time. Ordinary source and
stage evaluators are compiler inputs to one baking pipeline, not permanent renderer alternatives.
Circuit repetition remains a runtime-owned mapping to one lap asset.

Keep the currently authored finite domains initially. A route gate or handoff seam is not an image
endpoint: camera lookahead, visible terrain, reverse travel and recovery may still require adjacent
source content. A smaller authored domain requires proof of all supported accesses, including run-in,
runout and transition overlap. Storage paging alone does not trim or rebase an asset's domain.

**Global lattice, bounded generation.** Derive aligned dimensions, actual spacing, texel centers and
all LOD grids once for the complete finite source. Storage pages reference integer row ranges on
those grids. They do not derive a new density or restart marking/material phase. Coarse-level
footprints may cross many fine-level storage pages; page size does not limit a filter footprint.

First preserve existing alignment, sequential 2-by-4 channel averaging/rounding, L0 palette selection,
RGB555 encoding and chunk enumeration. Stream source rows through bounded row buffers at each level,
then encode completed row groups. Never allocate a full L0 plus a copied L0 and all pyramid levels.
The implemented compiler samples L0 once into a temporary file while discovering its global palette.
Palette tracking stops after proving overflow; subsequent encoding reads that spool without
resampling the source. It never chooses a palette independently per chunk.
A compiler output sink spools completed payloads and supports bounded candidate reads for exact
dedup comparison. Keeping every encoded payload in RAM would defeat the memory bound.
Only directory/index metadata grows in RAM with course length; scratch disk and final output grow
with image data and are separate costs. The current compiler caps its owned live pixel/encoded
buffers with `maxWorkingBytes` (64 MiB default) and processes `rowsPerBatch` (256 default, multiples
of four). These are build controls, not smartphone budgets or guarantees about process RSS,
metadata, I/O internals or garbage-collection latency. Oversized chunks fail explicitly rather than
changing output layout. The caller owns a fresh storage workspace and its cleanup on failure.
[File storage](../tools/build/ground-map-files.mjs) supplies this contract without Node imports in
the compiler. Build tools publish the resulting binary only after compilation succeeds.

The first compiler refactor must reproduce current finite-source metadata and binary output,
independent of working-buffer sizes. A later paged transport format may change serialization,
but decoded texels and metric lookup must remain identical to that compiler. Do not combine
alignment optimization, different filtering or earlier quantization with this refactor.

**Asset identity and delivery.** Introduce a versioned product manifest with a stable source identity,
compiler/target identity, input digest, finite domain, lattice/LOD descriptors, palettes and an ordered
page-to-payload directory. A page identifies its level and row range; a payload identifies immutable
encoded bytes, byte length and digest. Palette interpretation belongs to the manifest, even when
two manifests share identical indexed payload bytes. Package IDs bind to a manifest digest, not
to mutable filenames. All references stay within the selected immutable deployment build.

Publish completed payloads as separately addressable files; do not depend on HTTP range support
or assume that compressed transfer bytes remain compressed in the reader. The monolithic v1 test
asset is a regression input during migration, not a second product loading mode. Wire schema,
transport granularity and actual server compression are validated before deployment.

**Resident reads and accounting.** One application-owned immutable payload store shares bytes across
readers, repeated circuit windows and consumers of the same content. Ground render demand determines
residency; a physics actor does not acquire image pages merely by occupying a stage. The frame
preparation step resolves level/row demand from the same terrain lines and selector used for drawing,
loads missing payloads asynchronously, then pins the required set for the whole draw. Sampling stays
synchronous and allocation-free with respect to fetching/decoding; it never starts I/O or filtering.

The loader owns fetched buffers exclusively and exposes no mutable aliases when publishing them to
the store. Preserve defensive copying at APIs that still accept caller-owned mutable bytes. Avoid a
whole-course copy by loading bounded payloads; remove a copy only where exclusive ownership is proven.
Concurrent requests for one payload share one load. Eviction releases only unpinned payloads; stale
requests from an old course selection cannot publish a reader into the new session.

The integration profile declares limits for compiler pixel/payload working buffers, resident payload
bytes and concurrent load/validation buffers. Count shared payloads once, but include simultaneous
old/new frame pins and incoming data. Metadata, network/decoder buffers and the rest of the application
are separate costs. A request that cannot fit must produce explicit capacity failure, not silently
exceed a limit, drop required pages or select a different LOD. Numeric target-device budgets remain
unapproved; host RSS and gzip measurements cannot establish those limits.

Unavailable data is an explicit readiness result before presentation, never grass substitution,
procedural fallback or hidden lower-resolution sampling. Browser loading behavior and simulation
scheduling are governed by the [content integration design](content-and-gameplay.md#groundmap-loading-and-handoff-design-not-active).
