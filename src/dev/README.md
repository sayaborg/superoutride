# Concrete content, fixtures and diagnostics

- `courses/` owns the browser's authored courses, scenery and shared content composition.
- `fixtures/` owns focused regression inputs, including the stadium asset-baking source.
- `diagnostics/` owns input recording, vehicle/render/terrain telemetry and tire-audition worklets. Engine and front/rear tire synthesis belong to [audio](../../docs/audio.md); sound audition pages and scripts live in `tools/audio/`. Browser debug overlays belong to `src/browser/debug/`, because they are part of the driving shell.

Only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` assemble shipped DEV courses from outside this directory. General engines never import DEV, and shipped courses never import fixtures or diagnostics. [Repository hygiene](../../tests/infrastructure/repository-hygiene.test.mjs) enforces dependency direction, descriptive naming and a test/tool consumer for every regression source. Fixture availability alone never makes an unreachable general module live.

Retain distinct causal scenarios (gate ordering, overlapping charts, terrain footprints and physical recovery). Fixed calibration inputs are independent of browser defaults. Remove duplicate or unused implementations; Git retains past designs. [The specification index](../../docs/README.md) identifies the authority for each concept.
