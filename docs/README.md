# Specifications and current implementation

This is the sole specification index. Product defines the intended game; topic documents own
current contracts and explicitly labelled Course Editor target chapters. Existing behaviour and
unimplemented targets are separate scopes. Technical candidates stay unfrozen until their named
gates pass. An unmarked paragraph is not evidence of separate historical approval. Adoption of a
revision, executable implementation, validation and deployment have distinct evidence.

This directory contains current contracts, their active target revision and one next-work checkpoint,
not a chronological archive.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Product target](product.md)                    | Shipped-content target, play, visible behaviour and authoring scope                    |
| [Development contract](../AGENTS.md)            | Development priorities, design questions and branch/release gates                      |
| [architecture](architecture.md)                 | Frozen coordinates, raster rendering, metric scale, open geometry and layer boundaries |
| [vehicle physics](vehicle-physics.md)           | Frozen common mechanics, steering and torque constraints; parameters remain tunable    |
| [content and gameplay](content-and-gameplay.md) | Authoring, route/race transactions and recovery composition                            |
| [audio](audio.md)                               | Procedural sound, acoustic observation, fixed voices and browser lifetime              |
| [tire audio](tire-audio.md)                     | Tire synthesis mechanisms, shared primitives, numerical and physical limits            |
| [calibration](calibration.md)                   | Vehicle defaults and tire-audio tuning ownership                                       |
| [development](development.md)                   | Build, tests, diagnostics and browser delivery                                         |
| [NEXT](NEXT.md)                                 | Single current restart checkpoint and next work                                        |

The [tire sound evidence note](tire-squeal-research.md) supports mechanism discussion, not runtime behavior or numerical calibration.
[Tire audio](tire-audio.md) owns synthesis methods and session behavior;
[calibration](calibration.md#tire-audio-tuning) maps tuning controls;
[NEXT](NEXT.md#deferred-tuning) owns the restart and deferred decisions.
Do not duplicate those responsibilities in another proposal or handoff file.

On restart, read the development contract, product, architecture and NEXT, then the topic relevant to the task. Types, compilers and causal regressions enforce the implementation.

If code and prose disagree, or two documents make conflicting claims, use this ownership table to identify the responsible contract. Resolve the conflict explicitly in that contract and its executable coverage, and remove the duplicate claim from other documents. A newer date or repeated wording does not establish authority; technical invariants are not independently redefined by the development contract or restart checkpoint.

Previous specifications, experiments, audit reports and release records remain in Git and GitHub Actions. Keep only current contracts and the [restart checkpoint](NEXT.md) here.

## Active target navigation

[Course/gameplay target](content-and-gameplay.md#course-editor-target),
[frame/image target](architecture.md#course-editor-target) and
[acceptance target](development.md#course-editor-target-validation) belong to those topic owners.
[NEXT](NEXT.md) alone owns work order. Retire superseded current descriptions at the validated cutover,
while preserving still-valid mechanics, image, gate and delivery contracts and their causal tests.
