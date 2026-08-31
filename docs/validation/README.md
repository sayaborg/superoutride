# Validation Evidence Archive

This directory stores historical SUPER OUTRIDE milestone, incident, and handoff validation records.

## Authority

These files are **immutable evidence**, not current design specifications.

They record facts such as:

- the package/version at a milestone;
- exact source SHAs or pre-validation SHAs;
- GitHub Actions run/job identifiers;
- test counts and outcomes;
- regression focus;
- intermediate CI failures and their correction;
- release discipline used at that point in history.

Do not rewrite an old validation file to use current terminology or current geometry/topology assumptions. For example, an early record may correctly mention a closed/cyclic DEV course because that was the implementation under test at that milestone.

Current design authority is resolved through `../README.md`, the Core Freeze/addenda, later numbered milestone documents, types, and regression tests.

## Filename gaps

There is not necessarily one standalone validation text file for every numbered milestone. Missing filenames such as M6.13–M6.18 do **not** by themselves mean that the work lacked tests or CI; some historical milestones used cumulative test/CI evidence without adding a separate root validation artifact.

Do not manufacture retrospective validation files to fill numbering gaps.

## Evidence-reference annotations

Immutable evidence may name a path that was later retired, moved, or transcribed incorrectly. Do
not recreate a compatibility file merely to make such a historical reference resolve, and do not
edit the evidence bytes. Interpret these known cases as follows:

- `M9_1_FOUR_PROFILE_DEBUG_HUD_VALIDATION.txt` names the superseded draft path
  `docs/88_m9_1_four_profile_debug_hud.md`; the released current authority is
  `docs/88_m9_1_six_profile_debug_hud.md`.
- `M9_2_SELECTABLE_STEERING_CALIBRATION_VALIDATION.txt` names `tests/input.test.mjs`; this is a
  filename transcription error. The exact-head suite and stale-source causal regressions are in
  `tests/input-core.test.mjs`.

Other missing source paths in older evidence normally document intentional authority retirement.
Use Git history and the current source-boundary tests rather than manufacturing the old module.

## Standalone-record decision rule

A new standalone validation record is required when the change is one of the following:

- a normative freeze, addendum, or milestone release that changes an authority boundary;
- an incident/hotfix whose release claim depends on preserved causal evidence;
- a repository migration or release checkpoint that explicitly invokes a validation-inclusive
  exact-head artifact.

Ordinary refactors, cleanup, test additions, and implementation work under an unchanged normative
authority use the PR's validation-inclusive exact-head CI as their evidence and do not create a
new archive file. State the applicable choice in the active milestone document or PR before
release. Never add retrospective files merely to make numbering continuous.

## Exact-head self-reference pattern

Many later validation records intentionally describe the last documentation-inclusive/pre-validation head and then require a fresh CI run after the validation file itself is added.

This avoids an infinite self-reference loop: editing a validation file to name the run that validated it would create a new SHA requiring another validation run.

Therefore a validation file can be historically correct even when its own text does not name the final validation-inclusive CI run. Final release identity is established by Git history, PR metadata, and exact-head workflow evidence.

## Current incident reference

The M6.51 public Pages branching freeze investigation/fix is recorded in:

```text
M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

It documents the physical first-gate miss, open-Guide AI lookahead RangeError, 545m -> 570m gate correction, and associated regressions.

## Archive rule

Move/rename archive files only as repository organization requires. Preserve their bytes whenever possible. Do not treat them as cleanup candidates merely because their milestone assumptions are older than the current architecture.
