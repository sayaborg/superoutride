# Specifications and current implementation

This is the sole specification index. Product defines the intended game. Topic owners distinguish
implemented contracts from explicitly labelled targets; candidates are finalized at their named
acceptance gates. Adoption, executable implementation, validation and deployment have separate evidence.

| Document                                        | Authority                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Product](product.md)                           | Content, play, visible behavior and authoring scope                                    |
| [Development contract](../AGENTS.md)            | Priorities, construction/review conventions and work/release gates                     |
| [Architecture](architecture.md)                 | Coordinates, Raster/Guide geometry, projection, metric scale and layer boundaries      |
| [Image assets](image-assets.md)                 | Sprite/ground source formats, image compilation, Sprite Tool sessions and ground tiles |
| [Vehicle physics](vehicle-physics.md)           | Common mechanics, steering and torque constraints                                      |
| [Content and gameplay](content-and-gameplay.md) | Course compilation, authoring semantics, route/race transactions and recovery          |
| [Browser](browser.md)                           | Boot/shell composition, scheduling, URL settings, HUD and keyboard/touch adaptation     |
| [Audio](audio.md)                               | Procedural sound, observations, fixed voices and browser lifetime                      |
| [Tire audio](tire-audio.md)                     | Tire synthesis mechanisms, primitives and numerical/physical limits                    |
| [Calibration](calibration.md)                   | Vehicle defaults and tire-audio tuning ownership                                       |
| [Test design](test-design.md)                   | Behavioral/structural test boundaries and migration of source-spelling assertions      |
| [Development](development.md)                   | Build/test commands, diagnostics, measurement and delivery evidence                    |
| [NEXT](NEXT.md)                                 | Current restart point and ordered work                                                 |

On restart, read AGENTS, Product, Architecture and NEXT, then the relevant topic. Types, compilers and
causal tests enforce those contracts. Resolve a conflict in its owning topic and executable coverage;
a newer date or repeated wording does not create another authority.

The [tire sound evidence note](tire-squeal-research.md) supports mechanism discussion. Tire audio owns
methods, Calibration owns controls, and NEXT owns deferred decisions. Current contracts and one
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

## Target navigation

Remaining [gameplay and authoring](content-and-gameplay.md#course-editor-target),
[presentation qualification](architecture.md#course-editor-target),
[image authoring](image-assets.md#course-editor-target), and
[acceptance](development.md#course-editor-target-validation) targets belong to their topics.
[NEXT](NEXT.md) alone orders implementation. Changes preserve applicable mechanics, image and gate
contracts; completed contracts belong in ordinary sections rather than target chapters.
