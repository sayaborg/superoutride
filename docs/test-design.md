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

The [geometry identity](content-and-gameplay.md#geometry-identity-and-anchor-replay) tests distinguish
recipe changes from unchanged builds. Reopening the same document reproduces its ruler and anchors;
a changed subdivision recipe invalidates dependent products and requires an explicit source migration.

The [target lateral partition](architecture.md#target-lateral-boundary-ownership) is tested immediately
below, at and above every shared and outer edge, including a median-center lock boundary. Rendering
source classification, physical support and route regions use the same ownership rule; image filtering
is checked against its own area-coverage contract. Existing current edge behavior remains covered until cutover.

The [local Guide envelope](architecture.md#target-local-guide-envelope) is tested on a narrow tight
curve and a distant wide straight fork in one Section, on a locally invalid wide bend, across envelope
knots/fillet interiors, and through translated or linked frames. Compare explicit constant-envelope
input with the existing accepted geometry and preserve out-of-domain/recovery behavior.

These are acceptance requirements for the target milestones. Each implementation PR records which
cases it actually implements and runs; this document does not report future tests as already passing.
