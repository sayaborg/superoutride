# DEV composition and regression fixtures

This directory assembles concrete authored courses, focused integration fixtures and read-only diagnostics from ordinary engine primitives. Current browser compositions include LINEAR, BRANCHING, Tsukuba and FISCO. M-numbered fixture names are stable test identifiers; they do not grant authority to superseded implementations.

Only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` may import these fixtures from outside DEV. General physics, camera, renderer, gameplay and runtime must not depend on DEV. [Boundary regression](../../tests/source-boundary-normalization.test.mjs) enforces this across all TypeScript source.

Retain a fixture when it supplies distinct causal coverage (gate ordering, overlapping charts, terrain footprints, physical recovery). Remove unused or duplicate implementations instead of archiving old engine variants here. Static renderer poses belong under tests; diagnostics must observe existing state and never become physical or gameplay authority.

See [current architecture](../../docs/architecture.md), [content and gameplay](../../docs/content-and-gameplay.md) and [restart checkpoint](../../docs/NEXT.md).
