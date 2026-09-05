# SUPER OUTRIDE — M9.20 implementation checkpoint (NOT RELEASED)

2026-09-06. Navigation/evidence only. This is not a replacement for the current M9.19 authority.

## Exact status

The five-axis tire, selectors, documentation and regression suite were implemented and verified
locally. Remote publication was not completed: OpenAI tool safety verification blocked a custom
transport-workflow write and subsequently an ordinary Git tree write for the vehicle integration
source. Those blocked writes were not retried through another endpoint. No unvalidated M9.20
implementation was advanced to main. No M9.20 exact-head remote CI, validation-inclusive release
or Pages deployment is claimed.

This branch tip intentionally contains baseline M9.19 source plus this checkpoint only. Temporary
transport payloads are removed. Their historical commits are not implementation authority and
must not be executed. Do not merge this checkpoint as a released implementation.

Baseline/main last checked: `75b225cbe13ece991a437d1ad2754a5edc7acb25`.
Baseline tree: `ba96d9f6668c3e3d4885570f2f29a6aa0569d8f2`.
Local-only implementation commit: `a14d86012facf6f79514dfcdeea08e26e53ac49e`.
Local implementation tree: `7725ea6baadf3dec05b27d613347786b90fa7a87`.
The local commit/tree must not be assumed retrievable through the remote repository.

Conversation delivery:

- `SUPER_OUTRIDE_M9_20_IMPLEMENTATION_UNRELEASED.zip` (complete tracked source, patch, docs,
  original research Markdown snapshots, full test logs, diagnostics and offline UI evidence).
- ZIP SHA-256: `9f14b51a757a188801845cdd627d657a84fdb978b1e22ba7c712352000409fde`.
- `SUPER_OUTRIDE_M9_20_UNRELEASED.patch` against exact baseline.
- Patch SHA-256: `8c50aacc4d1b23d9ed3c5edb1f6eabf8c60d2ac67ee222373ffbf4c340ddd67d`.
- `SUPER_OUTRIDE_M9_20_STATUS.md` explains scope and limits.

The package is a continuation artifact, not a published release. Consult its UNRELEASED.md first.
Do not bypass the tool safety block or claim publication before an authorized supported action
actually succeeds. Re-read current remote main/PR/CI/Pages before any continuation.

## Approved scope and implemented candidate

- Independent GX/PX/GY/PY and one shared selectable knee.
- Defaults: GX2.50/PX8%/GY2.20/PY10%/knee0.74.
- G .50..4.00 step .05; P 1..60% step one percentage point; knee .10...95 step .01.
- Compact previous/value/next controls; H/J/G/L/N increase, Shift+key decreases.
- A single registry supplies keyboard/touch choices; each operation preserves the other axes.
- Compiled muX/muY/kX/kY/rhoKnee only; k=(2-knee)*G/P, no duplicate P/UI IDs/multipliers.
- One load-proportional demand and one monotone C1 capacity ellipse; old S/post-peak removed.
- Frozen front/rear characteristic pair owned by the vehicle. Equal values are provisional
  composition; tire math and compiler permit different station data without vehicle branches.
- TCS preparation only: shared slip derivation and delivered-torque boundary/documentation.
  No active TCS, hidden torque reduction, target beta, control memory or unused controller framework.
- ENG1/D12/M60/ACT.25, gearbox, non-tire profile values, suspension/guards, courses and renderer
  laws are unchanged. Stock/rival tire construction retains the old non-dropping reference.
- Five-selector UI fit includes responsive canvas containment, not a projection/metric change.

## Local verification, not release CI

Node v22.16.0 / locked TypeScript 5.9.2:

`675 tests / 675 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo`.

The old 659-test baseline was independently run. Forty-one old-law-specific tests are explicitly
superseded in candidate document 114 (every name and baseline file hash retained); 57 new tests
produce 675. No skipped test or hidden obsolete runtime keeps the old post-peak contract alive.

Coverage includes arbitrary unequal axis coefficients, knee/axis independence, pure-axis onset,
ellipse capacity, dissipation, load homogeneity, zero contact, signed implicit wheel roots/brake
atom, station independence, calibration lifecycle, selectors, up/down sweeps, transient probes,
prior extreme-anisotropy reference at both signs and 60/120/240 Hz, and all-nine finite/recovery.

Offline Chromium loaded actual compiled LINEAR modules for 390x844, 844x390, 320x568, 568x320 and
1280x800. Defaults, both selector directions, keyboard/Shift, knee independence, recovery/vehicle
replacement persistence and layout passed without JS errors. Network browser navigation was
blocked: this is not public HTTP or interactive human handling evidence. Screenshots are packaged.
The final patch was independently applied to baseline and recreated the exact candidate tree.

Node24 remote exact-head CI remains mandatory before release. No validation archive was created
before that success. The package's candidate handoff is
`repository/docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_20.md`.

## Discussion and decisions to preserve

The complete candidate decision history is
`repository/docs/research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md`.
Eight original research Markdown files and their SHA256 manifest are in the package under
`repository/docs/research/m9_20_source_reports/`. These historical experiments are not all newly
replayed by M9.20. The following summary prevents the important corrections being lost.

1. Grip circles, seeded drift equilibria, ordinary-input reachability and human handling are
   distinct. Finite failed searches never proved no intermediate equilibrium or no throttle entry.
2. Old stiffness C=k*Nstatic with capacity G*Nactual made P proportional to actual/static load.
   M9.18 changed to C=k*Nactual, intentionally cancelling load from normalized slip position.
   This omits real load sensitivity; it is not exact real-tire reproduction. No mu(N)/k(N) is added.
3. M9.19 G1.2/P8 retained old small-slip slope but reduced peak capacity to 40%. Its 54 km/h
   cycle was not proof of the intended high-speed game. G is a force/curvature limit, not speed cap.
4. One-k combined-slip already allocated force continuously. The added lateral post-peak negative
   slope caused fast unstable intermediate-angle equilibria in a tested slice. Holding the local
   multiplier value while removing its derivative changed amplification signs; this was a local
   diagnostic, not a deployable law.
5. Merely widening P-to-2P to 5P or imposing a slope bound moved unstable regions or removed a
   capture path. A nonmonotone radial post-peak substitution produced multiple wheel residual roots.
6. The assertion that throttle-only drift entry was impossible was withdrawn after a brake-free
   pulse-and-release path was found. Constant player steer is not constant physical rack angle:
   the existing CG-travel automatic steering remains active.
7. High-speed seeded holds did not prove entry. Speed, beta, radius, gear and power must be recorded
   together. Average beta alone can hide oscillation, ongoing deceleration and eventual regrip.
8. Downforce adds load, not energy. The quoted 250 km/h/1.89g/R159m figures were inconsistent for
   one steady circle. Body-lateral acceleration is not path-normal acceleration during drift.
9. High-speed large-angle losses cannot be wished away. The prior E25 case reported roughly
   548 kW wheel power at 200 km/h/25deg/R204m, including roughly 459 kW tire slip loss. The estimate
   m*a_lat*V*sin(beta) is not a generally exact energy ledger; use individual contact slip work,
   wheel rotational energy and drag. Different slip allocations can change required power.
10. A high-rpm engine alone does not isolate high vehicle speed: first and second gear also use
    high RPM. That proposal was explicitly withdrawn. A fixed wheel-torque cap and TCS are distinct.
11. An ellipse with muY3/muX.75/kX=kY47.25 and no drop demonstrated high-speed capability, but
    its 4:1 anisotropy, weak braking and approximately 93% rear longitudinal-capacity usage were
    serious limitations. It is a research contrast, not the approved default or real-tire certificate.
12. kX/kY are independent. Their equality was an old experimental choice, not a model constraint.
    Pure-axis capacity onset P=(2-knee)*mu/k is derived. Equal P does not require equal k.
13. Real tire longitudinal peak slip ratio and lateral peak slip angle require consistent
    definitions/conditions before comparison. Prior Continental/Hoosier figures were provisional
    published-data examples, not newly verified measurements or certified game defaults.
14. TCS cannot manufacture drive capacity. It can improve dynamic capture and suppress excessive
    spin. The statement that it can only monotonically reduce body beta is too broad dynamically.
15. Prior E25 slip-feedback plus ENG4/D6 reduced short input-error sensitivity, but abrupt throttle
    still overshot near 39deg, steady throttle was near 96%, and braking/headroom remained unresolved.
    Fixed-gain and D controls separated those effects. No part of that TCS is active in this candidate.
16. Implicit nonincreasing trial-Omega torque can preserve a single-wheel unique root when contact,
    requested torque and gear are held fixed. This does not prove global vehicle/gear stability.
    AWD common engine reduction couples roots; independent reductions alter the fixed split.
17. Station-specific tire data is technically possible but not automatically principled. Front-only
    brake grip or drive-wheel-only mu as an unexplained compensator was not adopted. Current equality
    is provisional, not a permanent ban on genuine different tire authoring.
18. Product acceptance emphasizes ordinary entry, useful transient travel, correction and exit,
    including speed loss. Steady circles remain useful diagnostics, not the only acceptance target.
    Permitting deceleration does not waive useful distance/exit-speed goals or prove ENG1 suffices.
19. Knee affects initial slope and shoulder at fixed G/P. The earlier global-freeze proposal was
    superseded by the user's explicit five-selector decision; knee is shared across X/Y but editable.
20. No new load sensitivity, tire memory, four-wheel/roll freedom, hidden forces, post-peak knobs,
    per-vehicle mechanics branches or speculative TCS framework is introduced.

## Continuation gates

Read remote AGENTS/README/docs index and this checkpoint, then the packaged candidate source,
document 114, decision history and tests. Keep main M9.19 until normal authorized publication and
full exact-head Node24 CI succeed. Then add the required immutable validation record, re-run full
record-inclusive CI, re-fetch main, verify behind=0/mergebase=main, pure fast-forward force=false,
verify main=PR head=merge SHA, and verify same-SHA main CI/Pages and artifact identity.

All-nine drift, human touch/keyboard, braking, low-speed tight turns, abrupt/repeated errors,
airborne/reverse closed-loop behavior, 250 km/h and real-course useful drift distance remain open.
Do not report this checkpoint as completed remote implementation or a deployed M9.20 release.
