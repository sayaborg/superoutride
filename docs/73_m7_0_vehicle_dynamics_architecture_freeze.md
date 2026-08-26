# M7.0 Vehicle Dynamics Architecture Freeze

Status: architecture frozen; handling and presentation gains remain `DEV_UNCALIBRATED`.

This milestone replaces the M5 concrete-state layout as the current vehicle-dynamics authority. It does not freeze a final product feel, tire curve, assist threshold, suspension travel, camera gain, or vehicle profile number. Those values require human driving evaluation.

## 1. Architecture decision gate

1. Vehicle physics owns authoritative body motion, contact state, actuator output and integration. Guide coordinates remain derived observation; gameplay owns recovery; camera/render own presentation.
2. Existing world X/Y/Z, Guide projection, SurfaceMap, HeightProfile and read-contract primitives are reused.
3. World velocity is the only stored linear-velocity truth. Body-frame velocity and speed are derived. Surface support availability and physical contact phase are different facts.
4. Common physics contains no route, product mode, stage, car-only or bike-only runtime branch.
5. Car/bike differences are expressed through model-specific profile and force/control solvers above one ordinary body/contact/integration representation.
6. World-state continuity, open source domains, renderer chainage depth, fixed metric scale, zero camera roll and topology separation remain unchanged.
7. `tests/m7-0-vehicle-dynamics-architecture.test.mjs` makes the principal authority and causal boundaries executable; the complete prior integration suite protects route, circuit, recovery, camera and renderer behavior.

## 2. Chosen reduced model

Both vehicle kinds use two longitudinal contact stations:

```text
common VehicleDynamicsState
  world pose + world velocity + yaw/yaw rate
  sprung pitch/roll presentation state
  FRONT contact station
  REAR contact station
  post-assist actuator state
  engine + automatic transmission state
```

For a car, FRONT and REAR are axle stations. Each station probes left/right support at the authored track half-width and aggregates the axle material/contact observation. This is deliberately not a four-independent-tire force model.

For a motorcycle, FRONT and REAR are the two physical wheels and have zero lateral probe width.

This choice preserves common body/contact/integration boundaries while avoiding four wheel states whose individual load, steering and visual motion cannot yet be authored or presented. A later four-contact car model may replace the car solver behind the same station/body boundary only through a new explicit architecture decision.

## 3. State authority

Authoritative stored state:

```text
world position: x, y, z
world velocity: velocityX, velocityY, velocityZ
body attitude: yaw, yawRate
contact phase and contact observations per station
post-assist actual steer/drive/brake state
engine RPM, selected forward gear and shift transient
model-owned dynamic state (for example motorcycle bank)
```

Derived observation:

```text
Guide course coordinate
longitudinal/lateral body velocity
planar speed
representative surface
grounded = any station in CONTACT
```

The M5-named concrete state currently exposes `speed`, `verticalSpeed`, `longitudinalSpeed`, `lateralSpeed`, `steerAngle` and `supported` as derived migration accessors. They allocate no second stored truth. New general consumers must use `VehicleDynamicsState`, the read contracts, or the derivation helpers. These accessors are a bounded migration surface, not compatibility authority to copy into new code.

## 4. Support and contact

`supportAvailable` answers whether a SurfaceMap-supported surface exists under a station probe. `phase` answers whether that station is physically in `CONTACT` or `AIRBORNE`.

A supported road below an airborne body does not manufacture contact. New contact requires the station to reach the contact tolerance while descending. Retained contact allows explicit suspension droop before release. With no contact, vertical body motion is ballistic and planar forces are unavailable.

SurfaceMap physical semantics remain independent of GroundMap pixels and GroundBase transparency.

## 5. Solver boundary

Common layer:

- world/body velocity transforms;
- front/rear station support sampling and contact transition;
- vertical body and sprung-pitch evolution;
- world planar pose integration;
- derived representative contact material;
- common state transfer and actuator reset.

Car solver:

- axle normal-load split;
- front/rear slip and lateral force;
- drive/brake distribution and friction limiting;
- useful-slip steering limit;
- car sprung-roll cue.

Motorcycle solver:

- bank target and bank dynamics;
- bank-derived lateral acceleration and yaw response;
- front/rear brake and rear drive limits;
- wheel steer observation and bike sprung-roll cue.

Shared automatic-powertrain primitive, parameterized per vehicle model:

- engine torque-curve interpolation;
- engine RPM response and driveline coupling;
- ordered forward gear ratios, final drive, wheel radius and efficiency;
- hysteretic automatic upshift/downshift selection;
- explicit shift torque interruption;
- delivered drive force returned to the model-specific tire/assist solver.

Engine RPM and gear are independent rotational/power-delivery state. They never replace or rewrite authoritative world linear velocity. Driven-wheel angular speed is contact/wheel state; the solver couples it to longitudinal motion when contact and assists prevent lock/spin.

World velocity integration must not also apply body-frame rotation compensation twice. Body-frame velocity is re-derived from the updated yaw on the next observation.

## 6. Control and assists

Keyboard and touch adapters publish digital player intent only:

```text
steering = -1 | 0 | +1
throttle = false | true
brake = false | true
```

AI may publish a continuous normalized steering request; the vehicle solver owns actual actuator travel for every source.

Actual steering is continuous and limited by the current useful front-slip envelope before further steering would only deepen understeer. Neutral input returns steering toward zero. M7.0 does not introduce automatic countersteer.

Actual drive and front/rear brake application are post-friction-limit values. `tractionControlActive` and `absActive` report intervention. The HUD must always display actual steering, drive and brake state, plus active TCS/ABS intervention; raw digital intent is not a substitute. Selected AT gear and engine RPM are also always visible.

The current transmission is forward automatic only because reverse driving is not yet part of the product physics. Manual shift authority, neutral/park and reverse require a later explicit product/control decision.

## 7. Spawn, recovery and model switch

Physics constructors own valid initial body/contact/control state from an explicit Guide coordinate and current physical sources.

Gameplay recovery owns target geography and reason. The common reset operation clears unsafe world motion components, contact transients, sprung state and actuator state but cannot manufacture route choice, checkpoint, lap or finish progress.

Model switching preserves world pose, world velocity, yaw/yaw rate, derived Guide coordinate and common contact/control/powertrain state. The target solver then interprets the common rotational state through its model profile. Only model-specific bank/roll state is adapted.

## 8. Pitch, roll and camera presentation

Sprung pitch and roll remain physical/presentation observations even when the current sprite set cannot show every attitude.

- sprung pitch may contribute to camera pitch;
- lateral acceleration may contribute to bounded camera lateral displacement;
- motorcycle bank continues to select discrete authored sprite variants;
- car roll may later select discrete authored variants;
- camera yaw target is vehicle body yaw, not velocity direction;
- camera roll remains exactly zero;
- no arbitrary runtime sprite rotation is introduced.

Camera cue gains are presentation tuning, not handling authority.

## 9. Parameter authority

Vehicle geometry, mass/inertia, tire/force coefficients, actuator limits, contact tolerances, engine torque curve, shift thresholds, gear/final-drive ratios, wheel radius and model time constants belong to the concrete vehicle profile. Shared universal constants and common-state semantics belong to the common dynamics layer. Camera cue gains belong to the camera profile. Recovery thresholds belong to the gameplay recovery profile.

No handling parameter may be hidden in input adapters, renderer code, route topology or stage-specific branches. Current values remain `DEV_UNCALIBRATED`; changes to them are not evidence of final product feel.

## 10. Future world-space collision boundary

Future collision detection consumes authoritative previous/current world body pose and declared body/contact geometry. It may produce world-space impulses or constraints for the common integration boundary. It must not use screen coordinates, Guide lateral position, route progress or renderer pseudo-depth as collision truth.

Collision response may change world velocity, yaw rate and contact state. It must not directly award or rewrite topology/race authority. World-to-Guide location remains a derived observation after the response.

## 11. Explicitly deferred

- final car/bike handling feel and all human trial values;
- final engine curves, gear ratios and shift scheduling feel;
- automatic countersteer policy;
- a four-independent-tire car solver;
- wheel animation and detailed unsprung suspension state;
- car roll sprite production;
- damage and world-object collision implementation;
- final camera pitch/G cue gains.
