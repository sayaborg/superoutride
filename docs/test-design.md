# Test design

This document owns how tests express a contract. [Development](development.md) owns commands,
reference environments, measurement and release evidence. [AGENTS](../AGENTS.md) owns work procedure.
The topic specifications own the behavior being tested.

## Choose the observable boundary

Behavioral tests exercise inputs, outputs, state transitions and object relationships through the
responsible API. Compiler tests inspect the generated bindings and data. Runtime tests exercise the
real observers, adapters and composition roots. A local variable name, helper call spelling or the
order of source statements is an implementation detail.

Architecture tests inspect parsed imports, exports, symbols and reachability. Keep dependency rules
in repository hygiene, with a named module-level restriction when the directory rule is too broad.
A structural rule must identify its owner and intended dependency; renaming an internal helper or
changing whitespace must leave its result unchanged. Include type-only imports and dynamic imports
where applicable. A directory DAG alone does not prove every narrower module boundary.

Text assertions remain appropriate when text is the product: a serialized schema, public command,
user-facing label or generated file. Numeric traces, PCM hashes and pixel oracles test output, not
source spelling. Their reference environments and intentional-update rules remain in development.
Tests of an explicitly forbidden architectural mechanism should parse the relevant structure or
exercise the causal failure, rather than ban incidental words anywhere in a source file.

## Retiring source-spelling assertions

When a migration touches an owner, identify each source-string assertion's purpose in the PR.
Replace behavior claims with executable input/output or state tests, and place dependency claims in
the existing parsed hygiene check. Retire redundant text assertions only after that coverage exists.
An obsolete name or implementation sequence has no independent preservation requirement.

For derived IDs, vary the authored identities and row order, then check the actual generated
relationships and missing-reference diagnostics. For root wiring, exercise the root or its public
composition boundary. For a renamed builder, retain its geometry, gate and progress scenarios.
Intentional changes to a behavior require a topic-contract revision and new causal expectations.

Use a small mutant or an independently constructed inconsistent input to show that the replacement
catches the original failure mechanism when practical. Review removed coverage in the PR; a decrease
in test count or regex count is neither success nor failure by itself. Keep the full suite and its
immutable mechanics/audio/image references during this work.

## Course Editor acceptance additions

The [course compiler contract](content-and-gameplay.md#compiled-course-reference-graph) requires
arbitrary document IDs to resolve to shared immutable objects once, including diamonds and loops.
Test unresolved/duplicate references at admission, pointer identity inside one compiled product,
source-mutation isolation, failed publication, and serialization/reload through the same validator.
Independent compiled products may have equal content identities and different object identities.

Authoring diagnostics assert specific cause codes and actual input pointers for the existing invalid
geometry/content cases. Combine independent defects across boundaries/Sections and Links in one input;
assert deterministic ordered diagnostics, no dependent topology cascades, no partial product and no
mutation of the source or prior project publication. Repairing a sibling removes only its failures.
Unexpected exceptions preserve their identity and propagate. Schema admission remains a prerequisite;
the compiler does not fabricate products to continue through invalid dependencies.

Saved image tests use actual UTF-8 bytes and their digests, including alias descriptors and input-order
permutations. Check canonical source sharing, complete nested immutability and mutation during hashing.
Feed admitted indexed data through the ordinary sprite reader/blitter, distinguishing transparency
from opaque RGB555 zero. Missing/duplicate/unreferenced data, digest errors, malformed images and capacity
failures must publish no graph; independent errors retain scoped asset addresses. Exercise the real
file-backed compiler and atomic/stale project behavior. Source admission is not presentation continuity.

Presentation tests distinguish absent presentation from a fully declared supported subset. Verify
canonical Band/asset/scenery references, profile ownership, actual RGB555 output at shared/outer edges,
transparent versus opaque-black precedence, signed phase and static A/B mapping. Ordered stamps retain
positive/negative half-cell rounding and anchor replay through geometry edits. Paint changes must not
change physical materials. Reject missing bindings, bad profiles, unsupported image roles and placements
without partial publication. These source/data tests do not replace actual view/overlap qualification.

Presentation-domain tests compare whole partitioned cells, exact edges, integer texture cycles and
static A/B phase. Hide an interior mismatch between agreeing guard endpoints and seam; change stamps,
environment or canonical scenery independently and assert the causal diagnostic. Expand each consumer
and exercise all incoming merge Links. Actual camera-derived coverage tests record every ground query
and compare complete fork/merge framebuffers with transformed world/camera observations. A pure frame
change retains sprite screen/depth observations; test image/reference sharing and reject stale physical
camera/depth inputs. These checks do not establish pre-lock visibility or runtime commit readiness.

Offline Link tests round-trip saved chains and transformed loops, reorder declarations in two/three-way
fork/merge graphs, and assert shared successor/Port identity and actual cyclic back-references. Test
the rigid transform and inverse independently on points, vectors and equal frames. Overlap proofs
must catch short interior edge mismatches, Raster miter disagreement despite matching Guide geometry,
hidden curves/fillets and partial coverage gaps. Retain a fractional activation endpoint across seam
offset cancellation; reject distinct ruler stations that collapse to one relative coordinate. These
geometry tests do not claim physical/image continuity, consumer guard sufficiency or runtime commit.

Physical domain qualification expands each declared query footprint over the entire pose/step envelope.
Positive two/three-way fork/merge fixtures retain sibling parent roads without successor copies or VOID
holes. Expanding any physical consumer into unmatched support must fail. Exercise every incoming merge
Link and deterministic collection of independent failures. A clipping regression must hide its mismatch
at both clipped endpoints and the seam, requiring the interior Boundary/domain crossing partition to
detect it. Check closed domain edges separately from half-open Band ownership and keep whole-field
negative tests. Ordinary surface-reader agreement supports the physical proof; it is not evidence of
camera visibility, real consumer containment or runtime readiness.

Fork tests derive lock regions from saved geometry and canonical exits, preserving declaration-order
independence and anchor provenance. Interior parallel-zone changes, unsupported medians and bad ordering
must fail without replacing a project. Each pre-lock consumer can independently exhaust parent coverage;
actual projection/contact/driver/recovery demand and ordinary parent rendering exercise that boundary
without selecting a successor. Check every incoming Link's conservative clear interval, with complete
frame comparisons at its approach start. Keep these proofs distinct from lateral-transfer dynamics and
runtime envelope enforcement.

Occurrence/view regressions preserve actual incoming references at every merge, distinguish repeated
source identity from traversal/frame identity, and reverse the visited transform. Check bounded history
and shared sources after many loop traversals; missing history must fail without reconstruction. Assert
source addresses and narrow reader outputs across seams, exact Band activation stations and local
Guide bounds. Exercise each consumer's interval over its complete declared pose/step envelope. These
geometry checks do not replace product consumer, contact, camera or picture-continuity integration.
Selection tests prove that adjacent/multi-Link lookahead leaves the active frame and visited arrays
unchanged, then promotes the same instance only on advance. Preserve pending identity across reverse,
reject changing a chosen successor, and exercise both distance/count bounds without partial mutation.
Runtime/project state failures must not contain fabricated authoring pointers. Syntax/schema import
failure must leave an in-flight current-source compilation publishable.

Source reader tests retain native Raster/height record identity, original interpolation and seeded
projection. A deliberately short window rejects complete projection candidates and driver lookahead.
Car and bike occurrence comparisons exercise physical reads across a selected seam, retained/rebuilt
views, reverse history and full saved-presentation frames. Fractional-offset cases preserve exact
half-open Band ownership without an inverse coordinate round trip.

Saved product tests run actual browser roots and the shared headless scene. They exercise actor frame
commits, recovery without progress, finite source-reusing laps, field crossing order, legal-route
recovery, both fork paths and actual merge predecessors. Exit frames are compared with a successor-only
scene to prove parent-specific pixels have left the ordinary camera. Physics/audio tests separately
retain the immutable nine-profile traces and hashes.

Consumer-local geometry tests replace the obsolete whole-Section intersection rejection with paired
cases: the same XZ reached at two source intervals retains distinct seeded projections/physical height,
each small window qualifies, and a window containing both passages reports ambiguity for Raster and
Guide. Preserve local inversion failures. Exercise clipped cells, both arc directions, varying widths,
closed query endpoints, independent mapping diagnostics, exact resource ceilings and no partial results.
Synthetic long/capacity fixtures prove bounded one-Section admission, not named-master content acceptance.

The [geometry identity](content-and-gameplay.md#geometry-identity-and-anchor-replay) tests distinguish
recipe changes from unchanged builds. Reopening the same document reproduces its ruler and anchors;
a changed subdivision recipe invalidates dependent products and requires an explicit source migration.

The [target lateral partition](architecture.md#target-lateral-boundary-ownership) is tested immediately
below, at and above every shared and outer edge, including a median-center lock boundary. Rendering
source classification, physical support and route regions use the same ownership rule; image filtering
is checked against its own area-coverage contract. Existing current edge behavior remains covered until cutover.

Active-Band tests cross both sides of each longitudinal switch as well as every lateral edge.
Exercise zero-width birth/death, positive-width partition replacement, staggered partial domains and
continuous occupied unions including interior gaps. Verify per-cell carriageway contiguity and prove
that changing declaration order cannot make a partial first Band define the Section domain. Coverage,
interior-zero, overlap and discontinuity failures must preserve the current project.

The [local Guide envelope](architecture.md#target-local-guide-envelope) is tested on a narrow tight
curve and a distant wide straight fork in one Section, on a locally invalid wide bend, across envelope
knots/fillet interiors, and through translated or linked frames. Compare explicit constant-envelope
input with the existing accepted geometry and preserve out-of-domain/recovery behavior.

These are acceptance requirements for the target milestones. Each implementation PR records which
cases it actually implements and runs; this document does not report future tests as already passing.

Prepared occurrence transactions are tested through prospective consumer admission, unchanged live
history on failure, one-time publication, stale selection/movement and actual merge predecessors.
Seam-reader tests exercise both sides of the Link with ordinary nine-profile physics and full saved
frames; outside-domain world projection must fail even when clamping was requested. Pose and signed
step outcomes remain separate from seam crossing, frame commit and progress acceptance.
