# Open profile boundary consolidation

Gate: (1) source-domain validation owns addressing, not renderer/topology; (2) four existing
profile validators already have exactly the same rule; (3) one shared numerical check replaces
copies, no cached coordinate/state; (4) no route/profile-kind branch; (5) preserve established
source semantics rather than impose one universal policy; (6) no wrapping, unchanged 1e-9
two-sided endpoint snapping and errors; (7) endpoint/error/consumer tests and complete suite.

Inventory: HeightProfile, VisualProfile, GroundMapLogicalProfile and BakedGroundMapAsset share
finite input, 1e-9 allowed excursion and two-sided endpoint snapping. These use one Core helper.
SurfaceMap is strictly bounded without tolerance and remains unchanged. RasterPath/GuidePath use
their own range tolerance and only clamp outside endpoints; near-interior values are not snapped.
They remain unchanged. Explicit Cyclic adapters retain their deliberate topology policy.

Lengths are validated by existing source constructors, not revalidated in every sample. Error
labels remain source-specific. No generic validator framework or policy-option bag is introduced.
This is unchanged M6.44/M6.45 authority; PR exact-head CI, no standalone archive record required.
