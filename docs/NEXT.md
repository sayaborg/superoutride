# Next task checkpoint

## Current state

- M1–M5 are complete: saved graph courses, legacy removal, seams, circuit/rivals, branch/merge and the agent CLI.
- The browser and offline preview use one graph scene for LINEAR, SEAM, CIRCUIT and BRANCH.
- Static driving readers are shared across actors; occurrence, field and race state remain separate.
- N1 preserves mechanics/audio/input/camera/sprites and their immutable reference; tuning remains paused (DEV_UNCALIBRATED).
- All Sections use precompiled, deduplicated resident RGB555; N2 CI/Pages and delivered hashes passed, with device acceptance pending.
- Node reports SVG profiles/plans and course-scene timing/allocation; the browser exposes performance timing.
- Current courses and analyzed observations are development inputs, not reconstructed master content.
- Authored Session rules, exact checkpoint timing and offline physics-derived reference runs are integrated.

## Milestones

| Milestone | Status and completion requirement                                                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1        | Published: unified scene/readers, bounded sharing, recovery-safe seams, centralized settings, performance HUD/probe and Node SVG reports. Node 24, immutable reference, exact-head/main CI and Pages passed; human device timing remains required. |
| N2        | Published: all-Section resident RGB555, 40×10 L0, exact dictionary, filtered LOD and capacity admission. Exact-head/main CI, Pages and public payloads passed; device 60 fps remains required for Gate 3.                                          |
| N3        | Published implementation: authored grid/checkpoints/FINISH, CLASSIC/CUSTOM standing starts, clock/results, deterministic reference driver, numeric timings and vehicle envelopes. Human start-to-result play and difficulty acceptance remain.     |
| N4        | Pending: Cool Riders-style Left/Middle/Right fork and traffic with an explicit interaction policy.                                                                                                                                                 |
| N5        | Pending: time-based observations, template-free fit and reference-driver validation, then one video-derived saved/public course with timing table and same-time comparison images. Synthetic tool work may precede footage.                        |

Playable milestones require a publicly drivable Pages URL. After N5: actual content production, then GUI for inspection and small adjustments.

## Open decisions

- Ground variation: finite tile vocabulary aligned to the 1.6 m grid, or arbitrary patches with a unique-tile budget. Recommend the finite vocabulary plus a measured budget for exceptional stamps; decide before N2 art policy.
- Video waiting: no 30–90 second gameplay clip has been supplied for N5. K supplies a clip/edition; meanwhile complete the time-based tools with synthetic observations.
- Headroom utilization: choose relaxed/fast/limit defaults for K7 fitting. Recommend 0.55/0.75/0.95, saved as fitting inputs and verified by the reference driver.
- Traffic interaction: collision response, slowdown or legal-route recovery need a product decision before N4. Recommend an explicit lightweight contact policy, retaining player/rival mechanics.
- Reference difficulty: accept the development margin of 1.35 for production presets, or author course-specific margins after play tests. Recommend course-specific acceptance using the saved continuous reference runs.
