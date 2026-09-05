# M9.18 — Load-Proportional One-K Tire

Status: current scoped tire load-normalization and permitted wheel-lift acceptance authority.
Handling remains `DEV_UNCALIBRATED`.

## 1. Decision and scoped supersession

Use the existing instantaneous normal load for both the one-k demand stiffness and friction
capacity. Replace `C = k*Nstatic` with `C = k*max(0,N)` before the existing calibration multiplier.
The resulting constitutive law is `F(N,slip,material) = N*f(slip,material)` for positive N.

This supersedes only the fixed static-load tire stiffness and its compiled `cornerStiffness` field
in the M8.0/M9.0 foundation and the retained M9.9/M9.10/M9.15 tire descriptions. Normalized stiffness
is now the sole compiled stiffness coefficient. The obsolete static product is removed, not kept
as a compatibility field. Tests formerly recovering reference load from that field must instead
use the existing mass/axle geometry; their reference-load force assertions remain unchanged.

M9.15 still owns absolute browser G/P/S, the three calibration scalars, P-to-2P smoothstep, common
force direction and diagnostic choices. M9.17 still owns direct robotized MT; M9.16 owns ENG.
M9.11 steering, M9.13/M9.14 input, suspension force laws, camera, renderer and topology are retained.
Section 8 explicitly adds one-sided contact validity and overturned gameplay recovery while allowing
wheelies and stoppies. No profile numerical value, selector default or range is retuned.

## 2. Architecture Decision Gate

1. Owner: `src/physics/tire-wheel.ts` owns the constitutive law; `vehicle-profiles.ts` owns compilation.
   Contact orientation belongs to `vehicle-dynamics.ts`; recovery policy belongs to gameplay.
2. Existing primitive: `normalizedStiffness` and the already supplied contact `normalLoad` suffice.
   Reuse the existing body basis, surface normal and `updateM5Recovery` path for overturns.
3. Authority: remove the redundant static-C field; no stored N, peak slip, alternate force or tire
   state is added. Actual suspension load remains the sole load input. Overturn is derived, not state.
4. Branches: the same law serves both stations and all nine profiles, independent of vehicle,
   drive layout, course, input device, drift angle or mode.
5. Simpler rule: scale the whole existing curve by load rather than freezing one denominator,
   adding a second stiffness, widening the tail again or introducing a controller. Permit wheel lift
   instead of adding premature torque control; reuse gameplay recovery only after overturn.
6. Invariants: retain world mechanics, nonnegative capacity, dissipative slip, force-vector direction,
   monotone scalar wheel root and every frozen renderer/metric/topology contract.
7. Evidence: test load homogeneity throughout the curve, reference equivalence, unloaded release,
   surface behavior, multi-second drift response, permitted single-wheel contact and overturned recovery.

## 3. One load law

For one station, let k be compiled normalized stiffness, L the existing linear stiffness multiplier,
G the selected reference peak friction, g the nonnegative material grip factor and N the current
nonnegative contact load. The existing slip regularization remains:

```text
Vref = sqrt(Vx^2 + v0^2)
sx = (R*Omega - Vx)/Vref
sy = -Vy/Vref
C = k*max(0,N)*L
Dx = C*sx
Dy = C*sy
Fpeak = G*g*max(0,N)
```

For positive N and g, both normalized demand magnitudes cancel N:

```text
rho = k*L*sqrt(sx^2+sy^2)/(G*g)
rhoLat = k*L*abs(sy)/(G*g)
F = Fpeak*radialC1Magnitude(rho,rhoKnee)*lateralPostPeakScale(rhoLat,rhoKnee,S/G)
    * normalize(Dx,Dy)
```

The radial function and lateral post-peak function are not changed. At g=1 the browser-selected
pure-lateral peak occurs at P and the sliding plateau begins at 2P at every positive load, not only
at the static reference. At another fixed material g, the retained peak positions are P*g and 2P*g;
this milestone does not make stiffness proportional to surface grip or remove surface response.
Deep-slide resultant is still `S*g*N`; increasing wheelspin at fixed lateral slip still rotates
that one resultant. At N<=0 demand force and output force are zero, without a positive stiffness
floor or stored-force memory. Kinematic slips may remain nonzero; they do not create unloaded force.
A missing/nonfinite load is rejected. Compiled coefficient validation rejects nonfinite values.

Suspension/pitch/load transfer remain fully active. A load change scales available force, but no
longer also moves the tire to a different normalized slip regime. This is a deliberately reduced
load law, not a claim to reproduce all measured tire load sensitivity, temperature or wear.

## 4. Numerical properties

At each wheel solve the contact load is fixed; C therefore remains independent of trial Omega.
The lateral post-peak scale is also independent of trial Omega. Fx remains nondecreasing with
Omega and bounded by the same Fpeak; the existing backward-Euler residual, finite bracket,
Coulomb brake atom and bisection are retained without a second solve or tire state.

Because the common positive scale leaves force parallel to (sx,sy):

```text
Fx*(Vx-R*Omega) + Fy*Vy <= 0
```

The contact law cannot generate energy from sliding. Speed maintenance still requires ordinary
powertrain work; no kinetic-energy replenishment, forced wheelspin or direct body force is added.
At N=Nstatic, every prior static-reference force curve is unchanged up to floating-point rounding.

## 5. Causal acceptance

`tests/m9-18-load-proportional-tire.test.mjs` exercises the ordinary production modules, not a
separate diagnostic tire copy. Required coverage:

- compiled normalized coefficient only and finite-domain validation;
- current-load demand in both directions and no missing-load fallback;
- load homogeneity across G/P/S, positive material factors and signed combined slips;
- P, middle falloff and 2P at many loads, with retained surface scaling;
- independent old-formula reference equivalence on both stations of all nine profiles;
- exact unloaded release, free driven-wheel integration and passive contact work;
- finite deterministic wheel roots and monotone residual over signed motion/load/torque samples;
- seeded Testarossa G3/P24/S1, ENG3, D12/M60, 15 m/s and about 25 degrees: 30-second
  hold with real driven-wheel slip, unchanged player inputs and no state reset;
- one-percentage-point throttle changes in opposite short-horizon angle directions;
- recovery from +/-1-degree perturbations under the same player input;
- time-scheduled input-only 25 -> 30 -> 25-degree traverse with bounded speed;
- 60/120/240-Hz refinement and source checks against hidden state or controllers.

The drift fixture initializes one documented equilibrium once. It does not lock gear or overwrite
speed, wheel rotation, angle, load or yaw rate during integration. All subsequent motion uses the
same public update path, actual suspension and automatic gearbox as gameplay. The traverse uses
only an elapsed-time input schedule, not measured-beta feedback. Its constants are test data, not
vehicle defaults, runtime targets or browser assist parameters.

All existing repository regressions remain required, subject only to the explicit test-contract
supersession in section 8. Obsolete static-C accesses are migrated under section 1. No test is skipped.

## 6. Explicit limits

This is not a declaration that pleasant drift handling is complete. Prior exploratory continuation
found an unstable entry interval near 20-23 degrees in this specific 54 km/h, G3/P24/S1 configuration,
and +/-5-degree disturbances did not remain on the deep branch. A short correct throttle response
is not a guarantee that every sustained pedal value has a stable equilibrium.

G=S full-input probes can still settle into shallow high-speed cornering; the normalization alone
does not certify a deep power drift for those settings. G3/S3 is a test-only calibration because
browser S still ends at 2.00. Extreme power/reversal can still reach the existing suspension guard.
Do not change that guard, inject damping, restore a retired steering assist or alter the renderer
in order to make this scoped tire release appear to solve those separate issues.

The retained browser default is G3/P20/S1 and ENG1. G3/P24/S1 with ENG3 is the new regression
comparison point, not an unannounced default change. Hands-on entry/exit and camera perception
remain separate evaluation tasks; seeded numerical holds do not prove them.

## 7. Release evidence

This changes a constitutive-law authority and therefore requires a standalone validation record
under `docs/validation/README.md`. Record complete implementation/documentation/test-inclusive CI,
then obtain another complete green CI on the record-inclusive exact head. Release by pure
fast-forward with force=false and verify main=PR head=PR merge SHA plus same-SHA main CI/Pages.
Do not rewrite historical authority or immutable evidence to erase the old model.

## 8. Permitted wheel lift and explicit overturn boundary

The 2026-09-05 product decision permits wheelies and stoppies for this milestone. Their control
will be considered together with ABS/TCS later; none of those controllers is introduced now.
Single-wheel support is ordinary physics, not a failure, and must not cause early recovery, torque
reduction, artificial pitch damping, angle clamping or changed CG/suspension/profile values.

The reduced two-station model is not a chassis/roof collision simulator. It must not make an
inverted vehicle stand on suspension reach points that face away from the road. Thus:

```text
withinReach = supportAvailable && dot(body.up, surface.normal) > 0 && gap <= 0
```

Support geography remains independent. Inverted contact produces zero load, not a second force law.
The existing qTravel error remains unchanged for ordinary facing contact; no clamp hides overtravel.

Gameplay derives `dot(body.up, localSurface.normal) <= 0` at the ordinary recovery tick and handles
it as `overturned`, using the existing recovery target, reset and calibration-retention path. It
checks pose before trusting cached supported flags. The existing body-basis function is exported
rather than copying its coordinate formula into gameplay. No new runtime state or threshold is
needed. This boundary is surface-relative, not a fixed world-pitch limit. It detects a completed
loss of upright orientation, not incipient wheel lift. All three composition roots already consume
recovery results and retain camera reset and route/race suppression on recovered ticks.

This explicitly supersedes the old assumption in the M9.11 all-nine extreme-selector probe that
held full throttle must always remain in an uninterrupted upright physics trajectory. That test
now uses the same physics-then-recovery sequence as the browser, while retaining finite-state and
rack-stop assertions on every tick. Its inputs, profiles, duration and steering limits do not change.
The VFR Tsukuba probe likewise includes ordinary recovery and now checks upright orientation as
well as the retained progress, lateral-position and final-support bounds. A green final supported
flag alone previously admitted an upside-down result and is no longer sufficient evidence.
The same acceptance applies to the M8.3 all-nine LINEAR and M9.6 FISCO course-integration probes:
use ordinary recovery, retain their input/duration/progress bounds, and check finite pre-recovery
state and upright post-recovery orientation. The route-gate tests' no-recovery assertions remain
unchanged; recovery must not become a hidden path-following mechanism.

The M5 world-lateral-freedom probe measures max absolute body-lateral speed over its full trace,
not its value at one incidental two-second endpoint. The original 0.1 m/s, 2 m displacement and
yaw-response thresholds are retained, with final finiteness checked. This tests free motion rather
than requiring a particular residual slip after tire-law evolution.

`tests/m9-18-wheel-lift-recovery.test.mjs` separately proves both signed single-contact poses retain
ordinary force, inverted reach points cannot support, overturned recovery precedes stale support,
explicit pending targets/calibrations survive, and the qTravel guard still rejects real overtravel.
The two short VFR failure traces are replayed at 60/120/240 Hz: wheel lift must actually occur,
recovery must not precede overturn, and the three-second run must continue with only one recovery.
This is not a global no-repeat guarantee: sustained full-throttle LINEAR driving can repeatedly
lift and overturn the VFR after each recovery. Suppression is expressly deferred; do not report
those recovery-safe traces as stable upright riding or completed pitch control.
