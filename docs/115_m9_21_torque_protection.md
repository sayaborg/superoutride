# M9.21 — Independent Station Torque Protection

Status: current scoped drive/brake protection and product-composition authority.
Handling remains `DEV_UNCALIBRATED`. This does not close tire calibration or human drift feel.

## 1. Decision and supersession

The product now uses independent station TCS and ABS. The four motorcycle catalog entries also
use a separate support-loss prevention constraint. Car entries do not enable support protection.
AWD distributes the requested engine torque with the existing authored front fraction BEFORE
independent TCS. Actual delivered split may differ. Removed torque is not redistributed. Front and
rear wheel speeds are NOT locked together. No left/right-wheel or differential model is introduced.

Power-over drifting is no longer a product acceptance goal. Inertia-driven entry, sliding travel,
angle correction and acceleration exit remain goals; a torque limiter is not ESC and does not
prove the absence of every throttle-induced yaw transient or braking spin.

This supersedes document 114's inactive-TCS/product no-control scope and its deferred AWD choice.
It selects the explicitly-authorized independent actuator architecture, NOT common engine reduction
with a preserved delivered split. Document 112's physical one-sided support, single-wheel force,
qTravel guard and overturned recovery remain unchanged. Its unprotected lift fixtures remain raw
physics evidence, not the protected product's acceptance target. Document 114's five-axis tire,
all G/P/KNEE values/ranges, compiler, load proportionality and force law remain current and unchanged.

The lower constructor `createArcadeVehicle` has an explicit final protection-policy argument and
retains an unprotected default for raw mechanics/diagnostics. EVERY browser construction, rival and
replacement passes its catalog policy. There is no browser protection-off selector, implicit legacy
force model, or vehicle-kind branch in the solver. Tests verify this complete composition wiring.

## 2. Architecture Decision Gate

1. Ownership: `torque-protection.ts` alone resolves delivered wheel torques. `tire-wheel.ts` owns
   the constitutive law, inverse net-torque evaluation and the unique signed wheel root.
   `vehicle-wrench.ts` owns the one existing force/moment assembly; the vehicle integrator consumes it.
2. Reuse: existing wheel Omega, contact geometry, q/qDot, body angular motion, suspension frequency,
   requested engine/brake torque and actuator response. No controller memory, drift state or tire state.
3. One authority: tire calibration remains immutable station data; current loads come only from fresh
   contact observations. Policy is immutable composition data. New telemetry is output-only, never
   fed back as a second load, speed or torque state.
4. No vehicle-ID/kind/drive-layout branch in protection or tire mechanics. Catalog entries explicitly
   choose ROAD or TWO_WHEEL policy. Two independent station calls cover FWD, RWD and AWD.
5. Composition: fixed REQUEST split, independent reduction, no reallocation, one delivered boundary.
   Support protection is a second constraint, not a second writer to body state or delivered torque.
6. Invariants: existing world integration, signed wheel roots, friction ellipse/passivity, zero-load
   force, steering, suspension, gearbox, renderer metrics, camera and route topology are retained.
7. Causal evidence: torque-bound inversions, per-station independence, simultaneous residual pedals,
   reverse/stop/airborne domains, raw-vs-protected pitch failures, all-bike multi-rate tests,
   raw drift reference preservation and protected product-rival integration.

## 3. Policy and lifecycle

`TorqueProtectionPolicy` contains `wheelSlip` and optional `supportReserve`, not dynamic state.
Catalog ROAD policy: wheelSlip=true, supportReserve=null.
Catalog TWO_WHEEL policy: wheelSlip=true, supportReserve=0.08.
The 8% value reserves static suspension compression; it is an explicit protection calibration,
not a normal-load floor, invented tire coefficient, physical measurement or hidden pitch target.

The instance freezes its policy. Ordinary recovery preserves it while clearing output caches.
Vehicle replacement obtains the NEW catalog entry's policy (a car must not inherit bike protection),
while the existing tire/steering/ENG selections retain their normal lifecycle.
Raw construction and historical research probes remain unprotected unless a policy is supplied.
The existing fork helper preserves immutable policy identity and independently copies dynamic state.

## 4. Local signed wheel-torque boundary

Contact geometry/load/material, requested torque and gear are fixed during each substep root.
The inverse of the same backward-Euler equation is:

```text
Q(Omega) = I/dt * (Omega-OmegaOld) + R*Fx(Omega) + Trolling(Omega)
```

For positive wheel rotation Q=D-B. For negative rotation Q=D+B. At Omega=0 the retained Coulomb
brake atom applies. Q is strictly increasing; the tyre-wheel residual is not replaced by a new law.
`wheelRequiredNetTorque` shares the actual residual implementation instead of copying tire equations.

The initial slip envelope uses the current pure-X capacity-onset slip:

```text
P = (2-rhoKnee)*muX/kX
sLimit = materialGrip*P
Vref = hypot(Vx, tire.lowSpeedRegularization)
```

This is an explicit control-boundary choice, NOT a claim that P is the universally optimal combined-
slip value. TCS/ABS remain distinct from the tire's force-capacity enforcement. Tire selection changes
the boundary through those same resolved characteristics; there is no duplicated P authority.

Forward drive: OmegaUpper=(Vx+sLimit*Vref)/R and D <= Q(OmegaUpper)+B.
Forward braking: OmegaLower=(Vx-sLimit*Vref)/R > 0 and B <= D-Q(OmegaLower).
Reverse braking uses OmegaBoundary=-(abs(Vx)-sLimit*Vref)/R and B <= Q(OmegaBoundary)-D.
All limits clip ONLY the appropriate nonnegative requested torque into [0,requested].

Actuator handoff can leave both effective pedals positive even though canonical requests are
exclusive. Resolve drive, then brake, then recheck the upper net-torque boundary after brake release.
Thus the actual pair, not an imagined single active pedal, enters the wheel root.

At abs(Vx)<=the existing tire v0, ABS leaves stopping/holding to the physical signed brake atom.
If the lower bound crosses zero, it likewise does not force positive rotation. TCS still limits
forward launch. During backward motion positive drive opposes rolling, so the forward-drive TCS
bound is not applied to that stopping action. Zero valid contact/grip bypasses road-slip protection;
airborne wheels remain real free rotating wheels. Recontact does not reset their speed.

An already excessive slip may be unreachable by torque reduction alone in one step. Deliver the
closest allowed reduction; never inject an unrequested brake/throttle or snap Omega to the interval.
Finite bounded input remains mandatory. The local guarantee is conditional on a feasible torque
interval, not a global guarantee of all-body stability or instantaneous recapture.

## 5. AWD independent-actuator approximation

For requested total D and authored front fraction f:

```text
DF_request=f*D; DR_request=(1-f)*D
0<=DF_delivered<=DF_request
0<=DR_delivered<=DR_request
```

The final ratio is a derived observation, undefined as a ratio when total delivered drive is zero.
No second requested distribution is created and reduced torque is not handed to another station.
This ideal independent wheel-side actuator model is NOT a detailed mechanical center differential,
clutch-loss model or two-motor EV simulation. The existing weighted wheel observation still supplies
M9.17 RPM/gear; no non-monotone engine evaluation is placed inside a wheel root. Requested and
actual wheel-side torques are observed separately. At forward wheel rates, delivered wheel work is
bounded by the pre-intervention budget at the same rates. Do not claim an unmodeled engine rotor or
clutch energy ledger, especially from signed reverse transients.

## 6. Bike support prevention, without changing support physics

Support protection is a local tangent-plane compression constraint. Let r be CG-to-free-reach,
n the current surface normal, OmegaBody the body angular velocity and alpha its derivative from
the SAME reduced yaw/pitch equations used by integration. The moving body-right basis term is
included in alpha. Current wheel rotation reactions, tire forces, gravity and aero all come from
`evaluateVehicleWrench`, shared with the actual integration, not from a second longitudinal model.

```text
q = -gap                        (signed geometry, NOT a synthetic load)
qDot = -dot(reachVelocity,n)
aReach = aCG + alpha x r + OmegaBody x (OmegaBody x r)
qDDot = -dot(aReach,n)
w = sqrt(g/qStatic)              (existing station suspension frequency)
margin = qDDot + 2*w*qDot + w*w*(q-supportReserve*qStatic)
```

Require margin>=0 on the front when requested drive is positive, and on the rear when requested
braking is positive. The opposite station must actually carry load, the target must have supported
upright valid geometry. With neither station loaded there is no artificial road attachment.
Normal force still comes only from the original spring/damper/bump law. This local approximation
freezes the surface tangent within the prediction; it is not an all-road continuous-time viability
proof. qDot/inherited pitch momentum are retained, unlike a detector waiting for load==0.

First evaluate the requested torques through independent slip protection and the real wheel solve.
If support margins pass, deliver them unchanged. Otherwise evaluate zero request. If zero is still
infeasible, deliver zero, report supportFeasible=false, and retain ordinary physics/recovery.
Do not declare that state protected or clear inherited velocity/pitch.

When zero is feasible, a 12-iteration bracketed search returns a VERIFIED feasible release-connected
request scale. No global monotonicity or maximum-performance claim is made for the support function.
Each trial reruns independent slip protection and the same wheel roots; selected wheel results and
wrench are the ones integrated. Trials do not mutate physical state or gear.

The support scalar scales both station requests. In pure acceleration it limits drive only; in
pure braking it limits both authored brake requests proportionally BEFORE independent ABS. During
residual-pedal overlap it scales both active requests, rather than adding another brake allocation
optimizer. Independent ABS may still change final brake split. No excess torque is redistributed.
The scalar is a derived output cache, not additional controller memory or a multiplicative sequence
of four feedback loops. Margin infeasibility remains observable.

## 7. Acceptance and known bounds

Raw mechanics must reproduce M9.20 force and no-TCS reference regressions. Protected product tests
must use explicit catalog policies; historical raw tests cannot certify protected handling.
New tests exercise local signed torque inversion, simultaneous drive/brake requests, independent AWD
and ABS, stops/reverse, already-overspinning states, unloaded wheels, recovery/replacement, unchanged
neutral inertia, fresh-state rather than telemetry feedback, and all-bike drive/brake at 60/120/240Hz.
Current product rivals are tested on mountain, Tsukuba and FISCO with protection explicitly enabled.

The forward straight 54 km/h baseline must no longer overturn any of the four bikes under full brake,
or lift VFR/R80 under drive, without early recovery. It must retain useful acceleration and stop;
zeroing every input is not success. All nine must launch and survive pedal handoff under protection.

Still DEV_UNCALIBRATED: real human touch/keyboard feel, full-domain tire-grid protection calibration,
arbitrary terrain/inherited high pitch momentum, and all-condition yaw controllability are NOT closed.
Abrupt reversal/braking can still spin laterally despite anti-lock and support protection. No yaw/beta
controller was authorized. Natural crest airborne/recontact and physical qTravel/overturn guards remain.

## 8. Regression migration and release

No old tire test is removed or skipped. The M9.20 source assertion that delivered total equals raw
engine request is superseded only for protected composition; raw equality stays tested. The source
boundary assertion now points to explicit delivered station torques. The raw all-nine diagnostic is
renamed to prevent calling it a protected-browser certificate. Product rival tests now pass the
catalog protection policy while retaining their original route/lateral/slip/no-recovery assertions.

This changes normative control authority and requires a NEW immutable validation record only after
complete implementation/doc/test head CI is green. Then full record-inclusive CI, fresh main compare,
force=false pure fast-forward and same-SHA main/PR/Pages verification per AGENTS. Do not rewrite the
M9.20 validation or original research snapshots. The temporary source-snapshot workflow used because
local Git networking was unavailable must not exist in the released tree.

Continuation: `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_21.md`.

Evidence and limits: `docs/research/M9_21_IMPLEMENTATION_EVIDENCE.md`.
