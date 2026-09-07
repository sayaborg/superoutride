# Catalog presentation / optional binding gate

1. Product catalog owns identity membership and presentation; browser owns selector wiring.
2. Reuse the catalog, selector models and existing CAR/BIKE sprite sets, not mechanics identity tests.
3. Remove presentationFamily from raw/compiled mechanics; catalog is the single owner. Validate
   catalog identity and assigned-key uniqueness. Unassigned keys are not missing vehicles.
4. No product membership, vehicle kind or mode branch enters mechanics. Renderer receives metadata.
5. Existing nine identities, order, assigned keys, defaults and fixed Testarossa rivals stay unchanged.
   Rival sprite selection uses the actual catalog metadata rather than a hard-coded car asset.
6. Preserve physical state, handling, input arbitration, metric and Painter. Presentation bank
   remains output-only. No roster policy or paused tuning is introduced.
7. A synthetic tenth vehicle without a shortcut remains selectable through the real mobile model;
   duplicate ID/key and invalid metadata reject, and current catalog/physics/full tests remain exact.

This is an implementation correction under M9.8's existing catalog/presentation boundary.
No new product roster or game-mode specification. PR exact-head CI, no standalone archive required.

Course selectors follow the same boundary: one validated content list with optional digit bindings;
one route-kind-to-runner map, not a duplicated entry filename on every course. CIRCUIT fixture
factories are registered only in the existing top-level root and instantiate only the selection.
Synthetic additional entries exercise the actual selector and runner mapping without new unions
or mechanics branches. The four public URLs, labels, defaults and composed fixtures stay unchanged.

Local browser verification: TSUKUBA boots through the registered CIRCUIT factory; selecting RC30
reconstructs the player and displays BIKE art from catalog metadata. Selecting FISCO navigates to
the existing URL, boots its registered factory and renders the car/road/HUD. No captured console
errors. This is composition/presentation verification, not handling acceptance.

Final integration check: default course resolution uses the explicit branching identity in the
supplied catalog, never array position or an entry outside that catalog. Prepending unbound
content preserves the public default; an unknown query without that default rejects explicitly.
