# Current implementation

This directory describes the current system. It is not a chronological milestone archive.

[AGENTS.md](../AGENTS.md) defines project authority and development priorities.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [architecture](architecture.md)                 | Frozen coordinates, raster rendering, metric scale, open geometry and layer boundaries |
| [vehicle physics](vehicle-physics.md)           | Frozen common mechanics, steering and torque constraints; parameters remain tunable    |
| [content and gameplay](content-and-gameplay.md) | Authoring, route/race transactions and recovery composition                            |
| [calibration](calibration.md)                   | Parameter ownership, present defaults and unfinished handling work                     |
| [development](development.md)                   | Build, tests, diagnostics and exact-commit release procedure                           |
| [NEXT](NEXT.md)                                 | Single current restart checkpoint and next work                                        |

[AGENTS.md](../AGENTS.md) owns the development contract. Types, compilers and causal regressions enforce the implementation. If code and prose disagree, determine the responsible authority and resolve the conflict explicitly. Do not silently choose a convenient historical statement.

Previous specifications, experiments, audit reports and release records remain in Git and GitHub Actions. Keep only current contracts and the [restart checkpoint](NEXT.md) here.
