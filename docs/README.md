# Current implementation

This directory describes the current system. It is not a chronological milestone archive.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Development contract](../AGENTS.md)            | Development priorities, design questions and branch/release gates                      |
| [architecture](architecture.md)                 | Frozen coordinates, raster rendering, metric scale, open geometry and layer boundaries |
| [vehicle physics](vehicle-physics.md)           | Frozen common mechanics, steering and torque constraints; parameters remain tunable    |
| [content and gameplay](content-and-gameplay.md) | Authoring, route/race transactions and recovery composition                            |
| [audio](audio.md)                               | Procedural sound, acoustic observation, fixed voices and browser lifetime              |
| [tire audio](tire-audio.md)                     | Tire synthesis mechanisms, shared primitives, numerical and physical limits            |
| [calibration](calibration.md)                   | Vehicle defaults and tire-audio tuning ownership                                       |
| [development](development.md)                   | Build, tests, diagnostics and browser delivery                                         |
| [NEXT](NEXT.md)                                 | Single current restart checkpoint and next work                                        |

The [tire sound evidence note](tire-squeal-research.md) supports mechanism discussion, not runtime
behavior or numerical calibration. [Tire audio](tire-audio.md) owns default HYBRID, the MODAL and UNIFIED comparisons
and the HOPF/CONTACT/SPECTRAL references;
[calibration](calibration.md#tire-audio-tuning) maps tuning controls;
[NEXT](NEXT.md#deferred-tuning) owns the visual-presentation restart and deferred tuning decisions.
Do not duplicate those responsibilities in another proposal or handoff file.

This is the sole specification index. On restart, read the development contract, architecture and NEXT, then the topic relevant to the task. Types, compilers and causal regressions enforce the implementation.

If code and prose disagree, or two documents make conflicting claims, use this ownership table to identify the responsible contract. Resolve the conflict explicitly in that contract and its executable coverage, and remove the duplicate claim from other documents. A newer date or repeated wording does not establish authority; technical invariants are not independently redefined by the development contract or restart checkpoint.

Previous specifications, experiments, audit reports and release records remain in Git and GitHub Actions. Keep only current contracts and the [restart checkpoint](NEXT.md) here.
