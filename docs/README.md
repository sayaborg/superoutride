# Specifications and current implementation

This is the sole specification index. Product defines the intended game; topic documents own their
technical contracts. NEXT owns current state, K's decisions and ordered implementation work.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Product](product.md)                           | Content, play, visible behavior and authoring scope                                    |
| [Development contract](../AGENTS.md)            | Design, construction/documentation conventions, checks and release procedure           |
| [Architecture](architecture.md)                 | Coordinates, Raster/Guide geometry, projection, metric scale and layer boundaries      |
| [Image assets](image-assets.md)                 | Sprite/ground source formats, image compilation, Sprite Tool sessions and ground tiles |
| [Vehicle physics](vehicle-physics.md)           | Common mechanics, steering and torque constraints                                      |
| [Content and gameplay](content-and-gameplay.md) | Course compilation, authoring semantics, route/race transactions and recovery          |
| [Browser](browser.md)                           | Boot/shell composition, scheduling, URL settings, HUD and keyboard/touch adaptation    |
| [Audio](audio.md)                               | Procedural sound, observations, fixed voices and browser lifetime                      |
| [Tire audio](tire-audio.md)                     | Tire synthesis mechanisms, primitives and numerical/physical limits                    |
| [Calibration](calibration.md)                   | Vehicle defaults and tire-audio tuning ownership                                       |
| [Development](development.md)                   | Commands and build outputs                                                             |
| [NEXT](NEXT.md)                                 | Current restart point and ordered work                                                 |

On restart, read AGENTS, Product, Architecture and NEXT, then the relevant topic. Types, compilers and
checks enforce those contracts. Resolve a conflict in its owning topic and implementation;
a newer date or repeated wording does not create another authority.

The [tire sound evidence note](tire-squeal-research.md) supports mechanism discussion. Tire audio owns
methods, Calibration owns controls, and NEXT owns ordered work. Current contracts and one
checkpoint live here; historical audits, experiments and release records live in Git/PR/CI.

## Vocabulary

These definitions identify the CourseDocument model; topic documents own their precise contracts.

| Term            | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| Section         | One reusable authored road/content chart                             |
| Link            | Directed port-to-port connection with compiled transform             |
| Port            | Oriented connection anchor in a Section                              |
| Occurrence      | A traversal of a Section with actual incoming Link and history       |
| Frame           | Coordinate basis for position, orientation and vectors               |
| View            | Bounded continuous reader over occurrence spans                      |
| Boundary / Band | Longitudinal edge profile / region between edges                     |
| Carriageway     | Group of pavement Bands associated with a road or exit               |
| CompiledCourse  | Validated immutable reference graph with resolved readers and assets |
| Commit          | Per-actor change of occurrence/frame after physical seam crossing    |

Positive lateral coordinates point right in their named frame. APIs distinguish source/target Port
coordinates, transforms and carriageway centers. An original stage or checkpoint interval need not
be a Section. Product topology uses LINEAR, CIRCUIT and BRANCH.
