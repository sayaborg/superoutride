# Current implementation

This directory describes the current system. It is not a chronological milestone archive.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Development contract](../AGENTS.md)            | Development priorities, design questions and branch/release gates                      |
| [architecture](architecture.md)                 | Frozen coordinates, raster rendering, metric scale, open geometry and layer boundaries |
| [vehicle physics](vehicle-physics.md)           | Frozen common mechanics, steering and torque constraints; parameters remain tunable    |
| [content and gameplay](content-and-gameplay.md) | Authoring, route/race transactions and recovery composition                            |
| [audio](audio.md)                               | Procedural sound, acoustic observation, fixed voices and browser lifetime              |
| [calibration](calibration.md)                   | Parameter ownership, present defaults and tuning guidance                              |
| [development](development.md)                   | Build, tests, diagnostics and browser delivery                                         |
| [NEXT](NEXT.md)                                 | Single current restart checkpoint and next work                                        |

The [tire sound evidence note](tire-squeal-research.md) is supporting research and records source limits,
not a runtime contract or a selected algorithm. [Audio](audio.md) owns CURRENT/CONTACT/SPECTRAL
behavior; [NEXT](NEXT.md#next-decision-a-third-tire-sound-method) owns SPECTRAL game assessment and the listening decision and
restart. Do not duplicate that brief in another handoff file.

This is the sole specification index. On restart, read the development contract, architecture and NEXT, then the topic relevant to the task. Types, compilers and causal regressions enforce the implementation.

If code and prose disagree, or two documents make conflicting claims, use this ownership table to identify the responsible contract. Resolve the conflict explicitly in that contract and its executable coverage, and remove the duplicate claim from other documents. A newer date or repeated wording does not establish authority; technical invariants are not independently redefined by the development contract or restart checkpoint.

Previous specifications, experiments, audit reports and release records remain in Git and GitHub Actions. Keep only current contracts and the [restart checkpoint](NEXT.md) here.
