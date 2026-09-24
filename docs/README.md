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

| Term                  | Meaning                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mode`                | Session rules selection only: CLASSIC, CUSTOM or TIME ATTACK.                                                                                                            |
| `method`              | A choice of algorithm or application method outside Session rules.                                                                                                       |
| `view`                | The rendering layer (`src/view`), not an occurrence reader or an observation.                                                                                            |
| `Window`              | A bounded query interval.                                                                                                                                                |
| `source`              | Author-supplied data before compilation, including retained copies of that authored representation; not live readers, coordinate origins or input owners.                |
| `presentation`        | Retired; use `appearance` for authored course visuals and a concrete rendering, display or audio name elsewhere.                                                         |
| `Strip`               | An ordered Section surface declaration with independently optional color and material; later declarations overwrite each supplied channel.                               |
| `Region`              | Retired; use `Strip` for surface declarations and `Carriageway` for roads between Boundaries.                                                                            |
| `Band`                | Retired; use `Strip` for authored and compiled surface pieces, tables and readers.                                                                                       |
| `appearance`          | Authored course visuals, independent of physical structure and materials; compiled as `CourseAppearance`.                                                                |
| `Section`             | A reusable course interval; environment-name intervals are `EnvironmentInterval` records in an `EnvironmentTimeline`, read through `EnvironmentReader`.                  |
| `Profile` / `profile` | A Section's vertical alignment: height and grade along s, not a parameter record or a general varying attribute.                                                         |
| `Knot` / `Knots`      | An authored s-position/value record / ordered sequence, including vertical PVIs and Boundary knots; not a derived polyline point. Use `*Knot` and `*Knots` consistently. |
| `vertex`              | A polyline point derived during compilation, including compiled Boundary vertices and `ProfilePolyline` points; never authored.                                          |
| `segment`             | A planar straight or circular arc derived from authored PIs during compilation; never authored.                                                                          |
| `Definition`          | An author-written parameter record describing a vehicle, game-wide driving assists and tires, material or sound.                                                         |
| `Compiled*`           | A validated immutable product derived from authored inputs.                                                                                                              |
| `Reader`              | A query interface over admitted data; it does not own the consumer's live simulation state.                                                                              |
| `Route`               | The one selected, ordered sequence of Section occurrences measured from the entry; all vehicles share its chainage.                                                      |
| `RouteRuntime`        | The shared live Route, readers and loading owner; race Session state belongs to the race.                                                                                |
| `Session`             | One race run and its selected rules, competitors, timing and progress.                                                                                                   |
| `RouteOccurrence`     | A Section visit with its route start, lateral origin and world transform; repeating a Section creates a new occurrence.                                                  |
| `Observation`         | A measured or derived fact at sampling time, not an independent authority.                                                                                               |
| `State`               | Mutable live state owned by its responsible model or consumer.                                                                                                           |
| `Settings`            | The selected configuration applied to a running instance or its controls.                                                                                                |
| `Policy`              | Rules consumed by an algorithm, distinct from its live state.                                                                                                            |
| `LateralField`        | A color-table cell’s preblended Strip color and coverage as a function of lateral position.                                                                              |
| `native`              | Coordinates in the originating Section or data object's own ruler, before mapping into the shared Route.                                                                 |
| `owner`               | The identity of an input publisher participating in arbitration.                                                                                                         |
| `excitation`          | A signal driving an acoustic system; a live sound generator is not an authored source.                                                                                   |
| Prefixes              | Use the owning concept, such as `Vehicle*`, and semantic constant names; do not use historical `Arcade*` or `CURRENT_` prefixes for new names.                           |
