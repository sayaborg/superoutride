# Next task checkpoint

## Current state

- CourseDocument/compiler, Band/Link, occurrence/view and single-Section driving foundations are available.
- The default browser root drives the saved provisional LINEAR through the shared headless/browser scene.
- New product courses live in `content/courses/`; their saved assets are delivered with each build.
- Ground uses level-zero source paint until resident RGB555 is implemented.
- Physics/audio/input/camera/sprites and their immutable reference remain fixed; tuning is paused (DEV_UNCALIBRATED).
- Draft PR #222 supplies candidate seam code for M2; its old work order is superseded.
- Node 24, ffmpeg frame extraction and image inspection are available in the current environment.

## Milestones

| Milestone | Status and completion requirement                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Complete: saved 2.8 km LINEAR, row scenery, shared scene and publicly verified driving.                                                  |
| M1b       | Complete: old courses/routes/paged ground removed; default root is the saved LINEAR.                                                     |
| M2        | Release candidate: two-Section LINEAR, 30 m guards, span-composed readers, actor commit, reverse/recovery and car/bike frame invariance. |
| M3        | Pending: transformed one-source CIRCUIT, finite occurrence history, laps/FINISH and rivals.                                              |
| M4        | Pending: two-way fork, crossable median, ordered field lock, closure recovery, merge and rival retarget.                                 |
| M5        | Pending: compile/render/report CLI, source observations and offline fitting; rebuild one provisional course through the CLI loop.        |

M1–M4 complete only when publicly drivable. M5 completes when an agent edits, compiles and visually
checks a course using the CLI alone. Afterwards: resident RGB555 → checkpoint clock/Session presets
→ traffic → actual content → GUI. Three-way forks follow M4.

## Open decisions

None blocks the current milestone. Unresolved production content, presets and interaction choices remain in
[Product](product.md#6-remaining-product-decisions). Record any newly blocking decision here with
options and a recommendation in at most three lines.
