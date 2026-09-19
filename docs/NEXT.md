# Next task checkpoint

## Restart

Read [AGENTS](../AGENTS.md), the [index/glossary](README.md), [Product](product.md),
[Architecture](architecture.md) and the topic owning the task. Inspect exact main, open PRs, CI and
Pages; preserve unrelated work and start a `codex/` branch from that main. Repository evidence is
the continuation authority. [Development](development.md) owns commands and release evidence.

## Next work: Course Editor

Current driving code uses paged compiled ground, constant Guide inputs, finite circuit unfolding and three
composition roots. Sprite Tool exists. Gate 1 now provides a versioned CourseDocument, pinned geometry
recipe, immutable compiled reference graph and atomic authoring project boundary through a separate
offline compiler entry. Gate 2 adds local Guide profiles and offline varying/shared Boundary readers,
partial Band activation, taper birth/death and continuous partition changes. Oriented Ports and
geometric Links now support offline chains, forks, merges and transformed loops. Bounded geometry views
retain actual occurrence history and expose narrow point readers in an active frame. Complete common-content/consumer qualification, runtime Link commit, the combined
physical/visual/lock edge cutover and resident images remain targets.
Tire/audio tuning stays deferred.

### Implemented foundation

[CourseDocument v5](content-and-gameplay.md#coursedocument-v5-implemented-compiler-boundary) establishes
the exact wire fields, limits and supported LINEAR/BRANCH/CIRCUIT geometry subset. IDs resolve
once to canonical objects. Draft round trips, deterministic Raster/Guide output, source/recipe identity,
shared references, nested immutability, failure preservation and stale-build exclusion are covered by
[causal tests](../tests/runtime/course-document.test.mjs). Shipped browser roots do not consume the new graph yet;
the single-Section driving adapter below now exercises real consumers offline.
Use the [offline entry](development.md#course-document-compiler) and saved fixture to reproduce it.

Geometry recipe v4 includes mapped-cell non-inversion, local
fillet envelopes and activation-aware partitioning. Older geometry recipes are explicitly unsupported rather
than silently migrated. [Boundary tests](../tests/runtime/course-band-geometry.test.mjs) cover varying
asymmetric widths, shared reference identity, three structural carriageways, edge/gap ownership,
inversion/overlap diagnostics, bounded partitioning and atomic invalidation.
[Activation tests](../tests/runtime/course-band-activation.test.mjs) add partial domains, exact switch
ownership, zero-width birth/death, one-to-two/three-to-one static cross-sections, continuous occupied
unions and per-cell carriageway contiguity. Sections expose a narrow immutable `bandPartition` with
canonical Band references; no construction cells or ID joins are published.

The [local-window qualifier](content-and-gameplay.md#consumer-local-geometry-qualification) separately
checks conservative complete-cell Raster/Guide enclosures within an explicit source interval. Repeated
XZ positions are admitted as distinct chainages; small windows qualify and a window containing both
passages fails. Seeded Core projection and ordinary physical-height sampling preserve passage identity.
The former global simple-strip restriction is superseded; actual consumer/multi-occurrence coverage
remains unqualified. [Capacity cases](development.md#course-geometry-capacity) retain one Section per
CIRCUIT, exercise 20.8 km with 4760 Raster segments, and exact 2048-primitive/16384-segment ceilings.
These are synthetic host workloads, not named-master acceptance. Recipe identities contain semantic
versions/operative parameters, not explanatory prose.

Schema v5 includes explicit fork controls and presentation alongside entry Section, Section-local Ports and document-wide
Links/instances; schemas v1/v2/v3/v4 receive an unsupported-version diagnostic. Course compiler v12 includes
the pinned carriageway-Link recipe v1, physical recipe v2, image-source and presentation recipes v1.
[Link tests](../tests/runtime/course-links.test.mjs) prove canonical cyclic references, two/three-way
forks, shared merge successors, transformed one-source loops, deterministic round trips and atomic
invalidation. Full-cell Raster/Guide edge proof includes partial Band domains and exact ruler stations.
This certifies selected Carriageway geometry only, not complete content or driving readiness. Gate 2
remains in progress.

[Occurrence/view tests](../tests/runtime/course-geometry-view.test.mjs) establish offline canonical
traversal history, actual merge predecessors, inverse visited-Link traversal, bounded loop history,
shared source/assets and active-frame Raster/Guide/Band mapping. Explicitly selected unvisited occurrences
are separate from history and the active frame, support lookahead without forward/reverse, retain identity
through visits and reverse, and have declared distance/count bounds. Traversal/view and project state
outcomes no longer pretend to be authoring diagnostics. Failed syntax/schema imports preserve pending
compilation; format/units have distinct codes, and padded IDs are rejected without renaming.
All four consumer intervals are
explicit and include the admitted pose interval/step advance; missing history/selection/geometry
coverage is diagnosed. The [offline entry](development.md#course-document-compiler) can inspect an
explicit itinerary. This remains geometry-only: current driving reader interfaces and full physical/
presentation continuity across Links are not qualified, and traversal operations are not actor seam commits.

The [single-Section driving slice](content-and-gameplay.md#single-section-driving-view) connects the graph
and bounded view to real physics/contact, driver, recovery, camera and renderer readers. Native source
chainage/seeds survive moving windows, source interpolation and record references are shared, and actual
longitudinal demand derives from consumer settings/search intervals. [Integration tests](../tests/runtime/course-driving-view.test.mjs)
compare all nine vehicle profiles, both turn signs, reverse/recovery and complete frames with native
readers. Rebuilding every step and retaining a window produce identical outputs; the reproducible probe
measures construction and metadata counts. This is explicit diagnostic presentation, not admitted image
bindings or full common-content qualification. A view touching another occurrence is rejected for driving.

Explicit height and per-Band material profiles now compile to immutable Core height readers and
canonical physical bindings. A narrow Physics surface adapter shares the half-open partition, without
changing existing driving readers. [Physical-content tests](../tests/runtime/course-physical-content.test.mjs)
cover admission, no inferred defaults, canonical references, invalidation and a separate `physical-overlap`
qualification. The offline entry checks all Links for horizontal full-guard height and all-Band
support/material agreement. Extra unmatched parent roads correctly fail despite valid pavement geometry.
The same comparison now qualifies an explicit pose/step/physical-query domain. The saved three-way
fork/merge passes all incoming Links without sibling copies or VOID holes; whole-field qualification
still rejects its unmatched roads. [Domain tests](../tests/runtime/course-physical-domain.test.mjs)
cover every declared physical consumer, domain-edge crossings, half-open endpoint ownership, narrow
interior mismatches, independent multi-Link diagnostics and ordinary surface-reader agreement.
Compiler now owns the static graph without propagated material type parameters; Authoring owns project
state. No material ID is rejoined by a consumer. This is not complete common-content qualification:
full product pose/lateral admission remains absent; scoped occurrence readers are described below.
Single-Section consumer integration does not qualify a Link. The saved physical demand is a
reproducible test envelope, not a product default.

[Image-source admission](image-assets.md#course-image-source-admission) now requires and verifies exact
saved bytes for declared assets, sharing deeply immutable indexed sources through the canonical graph.
Independent asset diagnostics, input mutation isolation, limits, atomic/stale project behavior and the
ordinary sprite reader/blitter are covered. [Saved presentation](image-assets.md#saved-course-presentation)
now adds canonical Band paint profiles, static A/B phase, ordered anchored stamps, explicit backgrounds/
GroundBase and shared scenery instances. Source RGB555 evaluation and authoring failures are tested;
geometry fixtures explicitly retain absent presentation. Marking/boundary/scatter/pattern-row recipes remain
unsupported, not filled with inferred defaults.

[Presentation-domain qualification](content-and-gameplay.md#declared-presentation-query-domains) now
compares complete source-pattern cells, static phase, ordered stamps, environment/background and canonical
scenery over explicit camera/filter/anchor domains. Camera-derived straight-guard footprints contain
actual ground queries; complete paired frames agree over three forks and every incoming merge Link.
An ordinary sprite observation reader preserves screen/depth observations during pure frame changes.
This is scoped source-domain and renderer evidence, not runtime envelope enforcement, general
unrestricted occurrence-mapped presentation or an atomic actor transition. Gate 2 remains in progress.

[Authored fork controls](content-and-gameplay.md#authored-fork-controls-and-coverage) now resolve lock/
closure anchors and canonical half-open median-center regions. Scoped pre-lock qualification checks
all six consumer intervals in the parent before selection, including actual projection/driver/recovery
demand. Nine vehicle profiles exercise contact/driver queries in the admitted source view without a
selected successor. Actual parent rendering stays in its declared domain; complete paired frames agree
at each conservative exit clear-interval start. Exit bounds derive from matching full guards and query
footprints for all incoming Links. This is not a lateral-transfer, runtime lock/pose-admission or actor
commit certificate. General occurrence readers and final joint consumer cutover remain.

The [common-guard driving adapter](content-and-gameplay.md#common-guard-occurrence-driving-view) now maps
ordinary physical and saved-presentation readers across one immediate qualified occurrence. Stable active
chainage/occurrence seeds and exact ownership stations survive moving windows; incomplete projection
candidates fail. Nine-profile forward/reverse comparisons and complete saved-content frames exercise
the selected seam and retained actual predecessor without actor commits. Source images/readers remain
shared and common scenery appears once. The saved-file CLI reproduces the scoped reader admission.
Its whole window must fit the active source's local geometry proof and neighbor common guard; longer/
multiple-neighbor windows, full runtime envelopes, transfer dynamics and atomic commits remain pending.

Compiler diagnostics now distinguish authored geometry/content causes without a catch-all semantic
code. Independent failures at each reached construction phase are collected in declaration order;
invalid prerequisites stop dependent work. [Diagnostic regressions](../tests/runtime/course-diagnostics.test.mjs)
preserve input/prior publication, causal locations and exception identity. Schema/image admission,
runtime outcomes and internal invariant failures retain their separate contracts.

Traversal preparation now produces an immutable prospective history without moving the active frame;
failed view admission preserves state and stale plans cannot publish. Explicit seam views constrain
both active and neighboring queries to the qualified common guard, observe signed world-motion
pose/step bounds independently for physics/presentation, and reject projection inputs before clamping.
Nine-profile driving and complete saved-content frames retain their previous outputs. This supports
transaction preparation; camera/consumer envelope enforcement and physical actor commits still remain.

### Next milestones

1. **Gate 1 — Documents and compilation: implemented.** The document/compiler/project boundary is
   available without GUI. Asset references now own admitted immutable indexed image sources; this is
   not completed resident ground or presentation qualification.
   Existing successor/growth builders remain consumed development content and fixtures.
2. **Gate 2 — Geometry, Links and views: in progress.** Local Guide envelopes and activation-aware
   varying/shared boundary readers with half-open membership, oriented Ports/geometric Links,
   two/three-way fork connections, merges, transformed loops and scoped physical qualification are implemented
   offline. Follow the corrective sequence below before claiming Gate 2 acceptance.
3. **Gate 3 — Images.** Compile saved layers and static A/B recipes to resident RGB555 records; qualify
   lattice/filter candidates and whole-course capacity. Separate paint inputs from final-color readers
   and remove redundant stage reprojection/road-edge outputs under mapped-band/pixel coverage.
4. **Gate 4 — Session integration.** Compose one lifecycle with authored grids and physical FINISH,
   including LINEAR. Replace old locking policies/roots after real-root tests pass. Retire source-spelling
   assertions and construction-order names while preserving behavior and parsed dependency coverage.
5. **Gate 5 — Editor and content.** Add GUI over the proven file/compiler boundary, product-path preview,
   stale-output handling and source/art conversion. Keep the old course fixtures' causal coverage.
6. **Gate 6 — Product acceptance.** Qualify interactions, reference AI, timed presets, production art and
   named-device full-scene performance. Open Product choices are decided in their own scope.

[Test design](test-design.md) owns assertion migration. [Development](development.md#course-editor-target-validation)
owns acceptance detail. Every released milestone requires complete exact-head CI and Pages verification.
Retire materialized lap windows and driving-time streaming only after replacement coverage and failure
handling pass. Separate intentional pixel changes from the immutable mechanics reference.

### Gate 2 remaining order

1. Extend scoped physical/presentation proofs to complete common-content requirements; unsupported
   content recipes stay explicit rather than receiving placeholders. Enforce the scoped pre-lock and
   exit clear-interval envelopes at runtime, and qualify lateral-transfer dynamics. Preserve the implemented actual
   camera-query/full-frame evidence for every incoming merge Link. Physical reachability is not an
   image-visibility proof. Resident RGB555 remains Gate 3.
   Extend the implemented one-neighbor common-guard readers to the remaining qualified windows and
   derive/enforce full pose/lateral envelopes in addition to longitudinal demand. Selection/history and
   real LINEAR seam-reader integration are implemented, not evidence that an actor commit is ready.
2. Only for qualified Links, implement per-actor seam-driven atomic frame commit, coherent world state/
   cache/camera transformation, and unchanged checkpoint/lap credit. Test straddling contacts, neighboring
   actors, actual merge predecessors, reverse and recovery through the real integration path.
3. Complete the joint local-Guide/half-open physical, visual and lock edge cutover. Remove only replaced
   legacy paths after causal/integration coverage exists. Recheck the entire Gate 2 acceptance matrix;
   individual physical, geometry or LINEAR milestones do not establish complete Gate 2 readiness.

## Deferred tuning

All three areas below remain undecided and are paused, not approved as final defaults. Resume only
when the user returns to that area. Current numeric defaults remain available for reproducible play.

| Area                     | Preserved state                                                         | Decision still open                              |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| Physical tire parameters | Common mechanics and provisional calibration                            | Vehicle/axle calibration and handling acceptance |
| Engine sound             | Current synthesis and controls                                          | Timbre, parameter values and mix                 |
| Tire sound               | All methods and session behavior defined by [tire audio](tire-audio.md) | Final mechanism, onset, pitch, roughness and mix |

UNIFIED and MODAL remain available. Their coexistence is not a final method selection. The user
favored HYBRID squeal; listening feedback does not settle physical calibration. Wind remains deferred.
Audio model registry/seed consolidation, `audio/tire/` organization and HOPF/tool renaming belong to
sound-preserving cleanup when audio work resumes, not the authoring foundations above.

When tire-noise work resumes, compare Q alone at equal physical calibration and playback levels:
HYBRID with R/S off, UNIFIED with R off, and MODAL. Recheck mild turns around 20 km/h, increasing
slip, strong cornering/recovery, locked sliding, stationary wheelspin, loose surfaces, reverse and
loss/recovery of contact. Check phone panel scrolling, mute, reset, model switching and sound retry.
[Comparison tools](development.md#tire-comparison-tools) regenerate references and low-speed probes.
Synthetic RMS, spectrum and host timing do not establish audible realism or phone performance.
SPECTRAL rolling still reuses its texture length as an authored numeric ratio, explicitly marked
in source; reconsider that retained waveform mapping with final method selection, not visual cleanup.

## Remaining limits

Single-source local-window geometry qualification is implemented; actual consumer containment,
multi-occurrence window separation, neighboring-actor height selection and overpass presentation remain
unqualified. Source crossing admission alone does not certify a working Suzuka/grade-separated route.
Legacy vertex, fillet and supported-envelope checks do not replace the
[validity requirement](architecture.md#raster-and-guide); existing circuit copies remain above Core until cutover.

Handling is `DEV_UNCALIBRATED`. Combined-control and changing-terrain acceptance, and real smartphone
performance/input checks remain open. Suspension travel recovery is not proof of physical stability
on arbitrary terrain. These limits are separate from tire sound.

This is the one current work checkpoint. Historical audits and release evidence remain in Git/PR/CI.
