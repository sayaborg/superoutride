# SUPER OUTRIDE — M9.20 Continuation Handoff

2026-09-06. Navigation only. Repository is sole project authority.

## First reads and identity

Re-fetch main, open PRs, exact-head CI and Pages. Read AGENTS.md, README.md, docs/README.md,
then document 114, retained 112/111/110/101/107/108, implementation/types/compiler/tests.
Historical starting main was `75b225cbe13ece991a437d1ad2754a5edc7acb25` (M9.19, PR133),
tree `ba96d9f6668c3e3d4885570f2f29a6aa0569d8f2`. It is not a self-referential release SHA.
Find final M9.20 release identity in Git/PR/CI; do not assume an older handoff SHA is current.

## What changed

- `docs/114_m9_20_five_axis_tire.md` is the current scoped law/selector/acceptance authority.
- One monotone two-axis ellipse with independent GX/PX/GY/PY and shared selectable knee.
- Default GX2.50/PX8%/GY2.20/PY10%/KN.74. G .50..4/.05, P1..60%/1pt, knee.10...95/.01.
- H/J/G/L/N forward-cycle keys; five compact minus/value/plus UI groups provide both directions. Other axes preserved.
- Compiled muX/muY/kX/kY/rhoKnee only, no stored P/UI ID/multiplier duplicates. Atomic frozen
  front/rear pair owned by vehicle. Current browser and stock tires are linked equally as a
  provisional composition; compiler/lower solver permit differing station data.
- Old S, lateralPostPeakScale and multiplier APIs retired. Historical old-law tests are explicitly
  superseded, not weakened or skipped; doc114 lists every removed test and baseline hashes.
- TCS is NOT implemented or active. Shared deriveTireSlip and actual driveTorque boundary only.
- ENG1/D12/M60/ACT.25, all non-tire profile values, engine/gearbox, suspension/guards, controls,
  camera/renderer/core/topology unchanged. Rivals/stock construction retain old non-drop reference.

## Discussion and evidence

`docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md` preserves the research decision chain,
including withdrawn impossible-entry assertions, load-induced peak movement, combined-slip vs
postpeak, steady vs transient evidence, high-speed power/geometry, extreme 4:1 research tires,
TCS fixed-gain controls, independent stiffness, real-tire evidence caveats and the user's final
five-selector decision.

Preservation follow-up: M9.20 release `8113a70de880283dfb2c36d7443d330ebd28579e` omitted the
source-report directory despite the history's preservation claim. The
[repair record](research/M9_20_PRESERVATION_REPAIR_2026-09-06.md) documents restoration of the
[eight originals](research/m9_20_source_reports/), the unchanged
[manifest](research/m9_20_source_reports/manifest.json), and rejection tests for missing or altered
archives. The history links each report; read its final decisions before historical proposals.
This follow-up changes documentation and tests only, not the five-axis law or product defaults.
Report snapshots are not the complete chat transcript or all old scripts/JSON/ZIPs. Their
checksums certify preserved bytes, not correctness or rerun of historical experiments.
Resolve the repair's final SHA/PR/CI/Pages from current Git evidence; PR #136 identifies the
original M9.20 implementation release, not this later documentation repair.

Immutable milestone evidence is:

```text
docs/validation/M9_20_FIVE_AXIS_TIRE_VALIDATION.txt
```

That record was created only after implementation/documentation/test-inclusive head
`611e0b669fa97388133fdf26b9e54c46d38cfd40` passed PR CI #832 / run `33996294996` / build
`101387323802` on Node 24.20.0 with 675/675 tests. The record intentionally does not self-name the
later validation-inclusive run; resolve final release identity through current PR #136, Git and
workflow evidence. Never edit the immutable record after release merely to add later terminology.

Run:

```bash
npm ci
npm test
node tools/drift-control-probe.mjs --mode transient --out transient.json
node tools/drift-control-probe.mjs --mode sweep --out sweep.json
node tools/drift-control-probe.mjs --mode reference --hz 120 --mirror --out reference.json
```

Reference mode is explicitly the previous high-anisotropy no-TCS/ENG3 capability case, not a
hidden product preset. Current default is not certified to drift at every input or speed.

## Next work, not completed handling

Measure transient entry -> useful travel -> correction -> exit with actual speed loss and
curvature, not circle cumulative distance. Retain sweep up/down history and short-window extrema.
Compare Gx/Gy/Px/Py/knee independently before inventing more shape knobs. All-nine normal/recovery
checks do not certify all-nine drift or human keyboard/touch feel. Full braking, low-speed tight
turns, abrupt/repeated input errors, airborne/reverse, 250km/h and real-course useful flight
remain further calibration work. Do not add front-only brake grip or drive-wheel-specific mu
as an invisible compensator.

Future TCS must own only delivered torque, never tire coefficients or body state. For an implicit
single-station controller a nonincreasing trial-Omega torque can retain a unique root, with
fixed requested engine torque/gear inside that solve. AWD shared reduction couples station roots;
independent reductions change fixed split. Resolve this at an explicit drivetrain Decision Gate.
Do not infer that implicit feedback guarantees no whole-car/gear hunting. No stale unused TCS
framework is shipped to constrain that choice.

## Release procedure

Full exact-head implementation CI, immutable validation record only after green, full record-
inclusive CI, fresh main comparison and force=false fast-forward, then main=PR head=merge SHA
and same-SHA main/Pages verification. No temporary transport workflow or payload may remain in
the final source tree. Never report a CI artifact match as proof of human driving feel.
