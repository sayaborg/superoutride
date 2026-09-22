# Specification index

Each concept has one owning document. Topic specifications describe the current implementation;
[NEXT](NEXT.md) owns future requirements and the ordered work.

| Document                                        | Owns                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Product](product.md)                           | The current game's content, play and visible behavior                                                         |
| [Architecture](architecture.md)                 | Coordinates, geometry, projection, camera metric, rendering contracts and layer boundaries                    |
| [Content and gameplay](content-and-gameplay.md) | Course vocabulary and schema, reference identities, topology, occurrences, Session rules, timing and recovery |
| [Image assets](image-assets.md)                 | Image and Sprite Tool save formats, normalization, palettes, LOD compilation and resident-ground encoding     |
| [Vehicle physics](vehicle-physics.md)           | Mechanical state, contact, tire and wheel laws, powertrain, protection and steering                           |
| [Audio](audio.md)                               | Engine synthesis, acoustic observations, the current sound graph and audio lifetime                           |
| [Tire audio](tire-audio.md)                     | UNIFIED rolling/friction synthesis, signal domains and tuning-replacement semantics                           |
| [Calibration](calibration.md)                   | Current vehicle and acoustic tuning values, units, ranges and meanings                                        |
| [Browser](browser.md)                           | Display, scheduling, keyboard/touch input, URL settings, HUD and DEV controls                                 |
| [Development](development.md)                   | Commands, audition workflow, source-file conventions and generated/delivered outputs                          |
| [Development contract](../AGENTS.md)            | Design and construction conventions, standing checks and release procedure                                    |
| [NEXT](NEXT.md)                                 | Current restart point, future requirements, production selections and ordered work                            |

On restart, read [AGENTS](../AGENTS.md), this index, NEXT and the relevant topic specifications,
then inspect current Git, PR and CI state. A contract changes in its owning document together with
its implementation. Git and PRs hold historical decisions, audits and release evidence.
