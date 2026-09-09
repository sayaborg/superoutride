# Current implementation

This directory describes the current system. It is not a chronological milestone archive.

| Document | Authority |
| --- | --- |
| [architecture](architecture.md) | Frozen coordinates, raster rendering, metric scale, open geometry and layer boundaries |
| [vehicle physics](vehicle-physics.md) | Current common mechanics, steering and torque constraints |
| [content and gameplay](content-and-gameplay.md) | Authoring, route/race transactions and recovery composition |
| [calibration](calibration.md) | Parameter ownership, present defaults and unfinished handling work |
| [development](development.md) | Build, tests, diagnostics and exact-commit release procedure |
| [NEXT](NEXT.md) | Single current restart checkpoint and next work |
| [AUDIT](AUDIT.md) | Scope and verification of the current cleanup |

[AGENTS.md](../AGENTS.md) owns the development contract. Types, compilers and causal regressions enforce the implementation. If code and prose disagree, determine the responsible authority and resolve the conflict explicitly. Do not silently choose a convenient historical statement.

The current topic documents consolidate the retained Core Freeze/addenda and later decisions. Removing those chronological files does not loosen their retained invariants. Previous versions, experiments, audit reports and release records remain available through Git history and GitHub Actions. Do not duplicate them in this directory.
