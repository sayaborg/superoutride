# Specifications and current implementation

This is the sole specification index. Product defines the intended game. Topic owners distinguish
implemented contracts from explicitly labelled targets; candidates are finalized at their named
acceptance gates. Adoption, executable implementation, validation and deployment have separate evidence.

| Document                                        | Authority                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Product](product.md)                           | Content, play, visible behavior and authoring scope                                     |
| [Development contract](../AGENTS.md)            | Priorities, construction/review conventions and work/release gates                      |
| [Architecture](architecture.md)                 | Coordinates, Raster/Guide geometry, projection, metric scale and layer boundaries       |
| [Image assets](image-assets.md)                 | Sprite/ground source formats, image compilation, Sprite Tool sessions and target tiles  |
| [Ground delivery](ground-delivery.md)           | Current compiled-ground manifests, HTTP loading, payload ownership and admission limits |
| [Vehicle physics](vehicle-physics.md)           | Common mechanics, steering and torque constraints                                       |
| [Content and gameplay](content-and-gameplay.md) | Course compilation, authoring semantics, route/race transactions and recovery           |
| [Audio](audio.md)                               | Procedural sound, observations, fixed voices and browser lifetime                       |
| [Tire audio](tire-audio.md)                     | Tire synthesis mechanisms, primitives and numerical/physical limits                     |
| [Calibration](calibration.md)                   | Vehicle defaults and tire-audio tuning ownership                                        |
| [Test design](test-design.md)                   | Behavioral/structural test boundaries and migration of source-spelling assertions       |
| [Development](development.md)                   | Build/test commands, diagnostics, measurement and delivery evidence                     |
| [NEXT](NEXT.md)                                 | Current restart point and ordered work                                                  |

On restart, read AGENTS, Product, Architecture and NEXT, then the relevant topic. Types, compilers and
causal tests enforce those contracts. Resolve a conflict in its owning topic and executable coverage;
a newer date or repeated wording does not create another authority.

The [tire sound evidence note](tire-squeal-research.md) supports mechanism discussion. Tire audio owns
methods, Calibration owns controls, and NEXT owns deferred decisions. Current contracts and one
checkpoint live here; historical audits, experiments and release records live in Git/PR/CI.

## Vocabulary

These definitions identify concepts; topic documents own their precise contracts. Capitalized target
terms refer to the Course Editor model. A legacy name is a migration starting point, not an exact alias.

| Target term     | Meaning                                                                  | Legacy vocabulary and migration                                                                                   |
| --------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Section         | One reusable authored road/content chart                                 | A stage and its package contribute geometry/content; route progress belongs to an occurrence                      |
| Link            | Directed port-to-port connection with compiled transform                 | transition/choice plus handoff describe parts of this connection; intent and lock remain gameplay state           |
| Port            | Oriented connection anchor in a Section                                  | seam center/heading and source/target seam coordinates; seam is the physical crossing section                     |
| Occurrence      | A traversal of a Section, with incoming Link and lap/history context     | active stage/chart and winding contain parts of this state                                                        |
| Frame           | Coordinate basis used to express position, orientation and vectors       | worldFrame; a Guide chart also contains a coordinate reader and is more than a basis                              |
| View            | Bounded, continuous reader over relevant occurrences                     | window, stage road view and their adapters contribute to this role                                                |
| Boundary / Band | Longitudinal edge profile / region between two edges                     | ordinary cross-section and junction dimensions become referenced boundary geometry                                |
| Carriageway     | Group of pavement bands associated with a road/exit                      | child road and LEFT/RIGHT-specific geometry; lanes remain subdivisions within it                                  |
| CompiledCourse  | One validated immutable reference graph and its readers/assets           | RouteDag, content manifest, gates, handoffs and registry become derived facets, not independently rejoined tables |
| Commit          | Per-actor change of active occurrence/frame after physical seam crossing | handoff COMMIT; distinct from route lock and checkpoint credit                                                    |

Product `BRANCH` corresponds to the current DEV catalog identifier `BRANCHING` and URL
`?mode=branching`. That compatibility belongs at composition. An original game's stage may name a
checkpoint interval or environment change; it does not automatically create a Section.

### Lateral coordinates

Positive lateral coordinates point right in their named chart. These existing fields have different
roles even when some values happen to be equal:

| Existing name                   | Role                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| `lateralOrigin`                 | Local chart zero expressed in the underlying Guide's lateral basis |
| `sourceLateralOrigin`           | Stage-view local zero expressed in its source lateral basis        |
| `roadCenterL`                   | Road/paint center expressed in the source's lateral basis          |
| `sourceLocalL` / `targetLocalL` | Two coordinates of a connection anchor in different charts         |
| `childCenterL`                  | Child-carriageway center derived in the parent chart               |

For the existing translated view, `sourceL = localL + originL`. A general Link uses its compiled
frame transform. New APIs name the coordinate's frame and its role: source/target port coordinates,
source-to-local transform, or derived carriageway center. Rename by meaning while updating consumers;
an origin offset, a point coordinate and a road center remain different quantities.

## Target navigation

[Course compilation and gameplay](content-and-gameplay.md#course-editor-target),
[frame and geometry](architecture.md#course-editor-target),
[image compilation](image-assets.md#course-editor-target), and
[acceptance](development.md#course-editor-target-validation) are owned by those topics.
[NEXT](NEXT.md) alone orders implementation. Retire superseded current paths at their validated cutover,
while preserving the still-applicable mechanics, image, gate and loading contracts.
