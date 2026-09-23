# Specification index

Each concept has one owning document. Topic specifications describe the implementation;
[NEXT](NEXT.md) owns future requirements and the ordered work.

| Document                                        | Owns                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Product](product.md)                           | Game content, play and visible behavior                                                                       |
| [Architecture](architecture.md)                 | Coordinates, geometry, projection, camera metric, rendering contracts and layer boundaries                    |
| [Content and gameplay](content-and-gameplay.md) | Course vocabulary and schema, reference identities, topology, occurrences, Session rules, timing and recovery |
| [Image assets](image-assets.md)                 | Image and Sprite Tool save formats, normalization, palettes, LOD compilation and image-source admission       |
| [Vehicle physics](vehicle-physics.md)           | Mechanical state, contact, tire and wheel laws, powertrain, protection and steering                           |
| [Audio](audio.md)                               | Engine synthesis, acoustic observations, the sound graph and audio lifetime                                   |
| [Tire audio](tire-audio.md)                     | UNIFIED rolling/friction synthesis, signal domains and tuning-replacement semantics                           |
| [Calibration](calibration.md)                   | Vehicle and acoustic tuning values, units, ranges and meanings                                                |
| [Browser](browser.md)                           | Display, scheduling, keyboard/touch input, URL settings, HUD and DEV controls                                 |
| [Development](development.md)                   | Commands, audition workflow, source-file conventions and generated/delivered outputs                          |
| [Development contract](../AGENTS.md)            | Design and construction conventions, standing checks and release procedure                                    |
| [NEXT](NEXT.md)                                 | Restart point, future requirements, production selections and ordered work                                    |

On restart, read [AGENTS](../AGENTS.md), this index, NEXT and the relevant topic specifications,
then inspect Git, PR and CI state. A contract changes in its owning document together with
its implementation. Git and PRs hold historical decisions, audits and release evidence.

## Vocabulary

Reserved terms apply to project domain names, including compound identifiers. Platform/API names
(such as `DataView` and `AudioBufferSourceNode`) retain their external spelling. Existing names
explicitly scheduled in [NEXT](NEXT.md) are replaced with their owning concepts.

| Term                  | Meaning                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                | Session rules selection only: CLASSIC, CUSTOM or TIME ATTACK.                                                                                             |
| `method`              | A choice of algorithm or application method outside Session rules.                                                                                        |
| `view`                | The rendering layer (`src/view`), not an occurrence reader or an observation.                                                                             |
| `Window`              | A bounded read domain; an occurrence window connects spans expressed in one frame.                                                                        |
| `source`              | Author-supplied data before compilation, including retained copies of that authored representation; not live readers, coordinate origins or input owners. |
| `presentation`        | Retired; use `appearance` for authored course visuals and a concrete rendering, display or audio name elsewhere.                                          |
| `appearance`          | Authored course visuals, independent of physical structure and materials.                                                                                 |
| `Profile` / `profile` | A Section's vertical alignment: height and grade along s, not a parameter record or a general varying attribute.                                          |
| `Knot` / `Knots`      | One station/value record / an ordered station/value sequence for variation along s; use `*Knot` and `*Knots` consistently.                                |
| `Definition`          | An author-written parameter record describing a vehicle, tire, material or sound.                                                                         |
| `Compiled*`           | A validated immutable product derived from authored inputs.                                                                                               |
| `Reader`              | A query interface over admitted data; it does not own the consumer's live simulation state.                                                               |
| `Observation`         | A measured or derived fact at sampling time, not an independent authority.                                                                                |
| `State`               | Mutable live state owned by its responsible model or consumer.                                                                                            |
| `Settings`            | The selected configuration applied to a running instance or its controls.                                                                                 |
| `Policy`              | Rules consumed by an algorithm, distinct from its live state.                                                                                             |
| `LateralField`        | Compiled Band color and coverage as a function of lateral position.                                                                                       |
| `native`              | Coordinates in the originating Section or data object's own ruler, before a frame mapping.                                                                |
| `owner`               | The identity of an input publisher participating in arbitration.                                                                                          |
| `excitation`          | A signal driving an acoustic system; a live sound generator is not an authored source.                                                                    |
| Prefixes              | Use the owning concept, such as `Vehicle*`, and semantic constant names; do not use historical `Arcade*` or `CURRENT_` prefixes for new names.            |
