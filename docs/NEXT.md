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
partial Band activation, taper birth/death and continuous partition changes. Links/views, the combined physical/visual/lock edge
cutover and resident images remain targets.
Tire/audio tuning stays deferred.

### Implemented foundation

[CourseDocument v1](content-and-gameplay.md#coursedocument-v1-implemented-compiler-boundary) establishes
the exact wire fields, limits and supported single-Section LINEAR subset. IDs resolve
once to canonical objects. Draft round trips, deterministic Raster/Guide output, source/recipe identity,
shared references, nested immutability, failure preservation and stale-build exclusion are covered by
[causal tests](../tests/runtime/course-document.test.mjs). No driving root consumes the new graph yet.
Use the [offline entry](development.md#course-document-compiler) and saved fixture to reproduce it.

Geometry recipe and course compiler v3 include conservative mapped-cell interior validation, local
fillet envelopes and activation-aware partitioning. The wire schema stays v1; older geometry recipes are explicitly unsupported rather
than silently migrated. [Boundary tests](../tests/runtime/course-band-geometry.test.mjs) cover varying
asymmetric widths, shared reference identity, three structural carriageways, edge/gap ownership,
inversion/overlap diagnostics, bounded partitioning and atomic invalidation.
[Activation tests](../tests/runtime/course-band-activation.test.mjs) add partial domains, exact switch
ownership, zero-width birth/death, one-to-two/three-to-one static cross-sections, continuous occupied
unions and per-cell carriageway contiguity. Sections expose a narrow immutable `bandPartition` with
canonical Band references; no construction cells or ID joins are published. This is not Gate 2 completion.

### Next milestones

1. **Gate 1 — Documents and compilation: implemented.** The document/compiler/project boundary is
   available without GUI. Asset references are immutable identities, not loaded image payloads.
   Existing successor/growth builders remain consumed development content and fixtures.
2. **Gate 2 — Geometry, Links and views: in progress.** Local Guide envelopes and activation-aware
   varying/shared boundary readers with half-open membership are implemented offline. Next add
   oriented ports/Links, two/three-way fork connections, merges and transformed loops,
   followed by bounded views and the joint runtime edge cutover. Replace origin-based
   junction inference. Prove straddling contact, pre-lock coverage, common-only overlap, parent-specific
   exit visibility, actual predecessor history and neighboring-actor presentation. Migrate relevant
   Guide/junction helpers and names with their causal tests.
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

General nonadjacent road-band intersection classification is not implemented. The offline compiler
proves a bounded simple-strip subset through conservative quadratic-edge hulls; it does not admit
overpasses or classify intentional topology overlaps. Legacy vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Combined-control and changing-terrain acceptance, and real smartphone
performance/input checks remain open. Suspension travel recovery is not proof of physical stability
on arbitrary terrain. These limits are separate from tire sound.

This is the one current work checkpoint. Historical audits and release evidence remain in Git/PR/CI.
