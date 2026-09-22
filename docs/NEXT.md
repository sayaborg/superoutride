# Next task checkpoint

## Current state

- The game uses one compiled graph scene, resident RGB555 ground, indexed sprites and a complete Session flow.
- BG uses the current single infinite plane: 80×40 tiles, 1280×640 pixels and sine mapping.
- Build generates vehicle envelopes and game time budgets; generated products are disposable.
- Stage 1 removes the tuning freeze, frozen-reference oracle and performance tests without changing runtime behavior.
  Remaining regression tests stay until Stage 2. Vehicle parameters still carry `DEV_UNCALIBRATED`; physics and
  tire-audio tuning are open work. BGM, wind and sound effects are not implemented yet.

K's decisions below govern the remaining work, including where existing topic target sections differ.
Stage 3 reconciles those specifications. Implement the stages in order.

## Stage 2 — Remove dormant code and checks

- Keep only `unified` tire audio and make it the default. Remove `tire-contact-model`, `stochastic-resonator`,
  `tire-hybrid-*`, `tire-modal-model`, `tire-spectral-*` and every other non-unified model, together with their
  branches, selection UI, documentation, tools and tests.
- Give shared components used by unified neutral names independent of a synthesis method.
- Remove remaining comparison/proof tools: equivalence, spectral/contact, benchmarks and physics probes.
- Reduce `src/dev` fixtures and diagnostics. Reduce tests to the three standing checks in AGENTS plus a justified minimum.
- Remove old-cache compatibility: the Pages `_site/dist` fallback and `audio-lifecycle.ts` older-cached-index handling.
  Keep delivery verification minimal.
- Decide whether any work from PR #238 should be reused, then close it. Also resolve the unmerged `indexed-background`
  branch; preserve useful work before removal.

## Stage 3 — Reorganize normative documents

- Keep present-tense specifications; remove repeated procedure, freezes, history and negative qualifications.
- Remove topic target chapters and centralize goals here.
- Rewrite Product §4 and Architecture's ground section with the Band requirements in Stage 4.
- Limit Content and gameplay to data meaning and rules. Delete `tire-squeal-research.md`.

## Stage 4 — Replace ground with Bands

- Make Bands the canonical course schema and implement their rendering under the requirements below.
- Remove resident ground, groundmap, GroundBase, tile dictionaries, paint/stamp systems and their build, HUD and
  documentation paths together.
- Replace the old development courses with provisional courses authored in the new schema. Remove course-specific
  numbers from documentation. Generated expansions are build products, not committed source.

### Band requirements

- Ground is an ordered list of colored Bands. Later Bands cover earlier ones; colors are direct RGB555 or transparent.
- Physical classification is independent of appearance.
- Bands replace the entire ground plane, including the open outside on both sides.
- Preblend along s over power-of-two intervals. Aim for exact lateral integration along l; compare multiple methods
  and choose the implementation from those results.
- Threshold transparent edges. Transparent areas reveal BG even below the horizon.
- Start with at most 64 active Bands and finalize the limit on real devices.
- Express arrows, letters, curbs and cliffs with Bands. Expand authored constructs at compile time and do not commit
  the expansions.

## Stage 5 — Simplify structure

- Replace the three forms of `GuideCoordinateSource` with one reader.
- Unify circuit and ordered progress engines; remove synthetic `':EXIT'` gates.
- Move running geometry proofs (`course-driving-view` calls to `compileCourseGeometryWindow`) to compilation.
- Consolidate validation into one layer and minimize version/hash management.
- Clarify physics responsibilities and names (`arcade-vehicle-physics` / `vehicle-dynamics`), and remove physics
  dependencies on course and input.
- Give surface properties one representation: remove `SurfaceMap`, assign material definitions one owner, and
  distinguish the `SHOULDER` role from material names.
- Give tuning values one authority, including running setters and the `DEV_UNCALIBRATED` label.
- Retain both body-fixed yaw and movement-direction yaw cameras; clarify their roles and names. A product selector
  may be added later.
- Give rendering concepts one owner and one name: resolve the meanings of presentation, BG splitting and the boundary
  between runtime and authoring. Unify the two course-sprite paths.
- Remove unnecessary indirection in `boot.ts` and define the product/DEV UI boundary.

## Stage 6 — Close specification gaps

- Implement TIME ATTACK.
- Make course selection data-driven, clarify the `mode` parameter name and remove SEAM from the choices.
- Define audio buses for BGM, environmental/wind audio and sound effects.
- Make all UI English, including DEV panels and tools.

## Stage 7 — Produce product courses

Create the product courses using the new schema and authoring workflow, then review their appearance, driving
experience and time margins on real devices.
