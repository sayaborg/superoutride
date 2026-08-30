# `src/dev` — DEV composition fixtures and evidence

`src/dev` contains development-only composition material. It is intentionally separate from the general runtime/source layers.

## Categories

### A. Current public DEV composition fixtures

Files in this category assemble concrete authored content used by the current browser compositions, including LINEAR, BRANCHING and CIRCUIT development fixtures.

They may combine ordinary production authorities from `src/core`, `src/camera`, `src/gameplay`, `src/runtime`, `src/render`, `src/physics`, `src/visual`, `src/world`, and related general layers into a specific top-level development composition.

### B. Historical milestone / regression fixtures

Milestone-named files may remain here when tests use them to preserve historical construction sequences, regression coverage, or evidence for previously completed milestones.

Their names do not make them current general runtime authority. Do not promote a milestone fixture into a lower general layer merely to make its filename look current, and do not recreate retired paths as compatibility shims.

### C. Instrumentation / telemetry

Development instrumentation, traces, debug authoring helpers, and observational telemetry may live here when they are not authoritative gameplay/runtime behavior.

Instrumentation must observe or assemble existing authority; it must not become an alternate source of product rules.

## Dependency rule

> **`src/dev` is not a general runtime authority. General layers must not import it. Only explicit top-level composition roots may assemble DEV fixtures.**

The only current non-DEV TypeScript roots allowed to import `src/dev` are:

```text
src/main-linear.ts
src/main.ts
src/main-circuit.ts
```

`src/dev/**` may freely depend on ordinary general layers as needed to assemble fixtures. The dependency direction must not be reversed.

`tests/source-boundary-normalization.test.mjs` enforces this boundary across all `src/**/*.ts` files.
