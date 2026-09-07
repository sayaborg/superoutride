# Vehicle content / compiler boundary

1. Product values belong above the generic mechanical compiler; compiler owns validation and
   resolved contact-station construction. Catalog owns the shipped identities.
2. Existing authored profile schema and compileArcadeVehicleProfile express all current values.
3. Move the nine records, shared product seeds and their compiled exports to vehicle content;
   do not retain re-exports or a second list in physics.
4. Physics accepts an opaque nonempty identity, never an enumeration of production models.
5. New content compiles using the same mechanics. Current nine/defaults/keys do not change.
6. Preserve exact numbers, compile ordering and resulting physical trajectories; no tire tuning,
   solver, topology, camera or renderer change.
7. Import-boundary checks and synthetic identity compilation/ordinary updates prove independence;
   pinned same-host full-state probe and full suite preserve current behavior.

The compiled runtime shape is explicit, not an extension/spread of authored input. Wheel radius,
inertia, brake limits, suspension and tire data have one runtime owner: the resolved stations.
Authoring remains separately available above the compiler for deliberate compile-time variants.
Tests must compile authored records, never use a runtime profile as a second authoring authority.
Remaining scalar body/driver/powertrain fields retain their existing meaning and exact values.

This changes implementation representation only under M9.8's existing product-above-mechanics
authority. Presentation ownership remains a separate ledger item.
PR exact-head CI is sufficient; no standalone archive record is required.
