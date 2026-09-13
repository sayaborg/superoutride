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

The [tire squeal evidence note](tire-squeal-research.md) records physical sources and implementation implications;
[audio](audio.md) remains the sole owner of runtime sound behavior.

This is the sole specification index. On restart, read the development contract, architecture and NEXT, then the topic relevant to the task. Types, compilers and causal regressions enforce the implementation.

If code and prose disagree, or two documents make conflicting claims, use this ownership table to identify the responsible contract. Resolve the conflict explicitly in that contract and its executable coverage, and remove the duplicate claim from other documents. A newer date or repeated wording does not establish authority; technical invariants are not independently redefined by the development contract or restart checkpoint.

Previous specifications, experiments, audit reports and release records remain in Git and GitHub Actions. Keep only current contracts and the [restart checkpoint](NEXT.md) here.
