# M9.23 — Combined-Slip Superellipse Exponent

Status: scoped tire geometry and sixth diagnostic selector authority. Handling remains
`DEV_UNCALIBRATED`. Default LP remains **2.00**; no handling retuning is approved here.

## Decision and supersession

M9.20's GX/PX/GY/PY/KNEE controls cannot independently change longitudinal/lateral capacity
competition while preserving pure-axis characteristics. Generalize only its radial coordinate
from L2 to finite Lp. This supersedes document 114's fixed ellipse, exact five-coefficient/selector
count and prohibition on an extra norm exponent; it does not change its magnitude shoulder,
load law, slip, stiffness compilation or other defaults. Document 115's shared wheel inverse
now evaluates this geometry; protection policy and its pure-X slip boundary remain unchanged.
No historical milestone or released validation record is rewritten.

## Architecture Decision Gate

1. `tire-friction-calibration.ts` owns authoring/resolved characteristics; `tire-wheel.ts` owns
   constitutive force, reserve and scalar wheel equation. Browser registry owns the grid.
2. Extend existing immutable front/rear characteristic slots and registry, not another controller.
3. One resolved `combinedSlipExponent` per station; no duplicated UI state, drift state or coordinate.
4. No vehicle/station identity, drive-layout, course, mode or device branch enters the tire law.
5. Browser linked editing is composition; independent authored station values remain supported.
6. Preserve current-load contact, dissipativity, wheel uniqueness, one contact-force wrench,
   world-state integration and every frozen renderer/metric/topology invariant.
7. Exact pre-change trace, pure axes, full-grid constitutive/root/protection tests, lifecycle,
   captured-input replay and actual-browser responsive checks provide causal evidence.

## Definition and ownership

Authoring and compiled tire characteristics require finite `combinedSlipExponent >= 2`.
There is no infinity mode, implicit missing-field fallback or per-vehicle interpretation.
All stock authoring and browser defaults explicitly use 2. Lower compilation accepts continuous
finite values in this domain; the browser restricts selection to the grid below.

With current slip definitions, N=current valid load, m=material grip, a=rhoKnee:

```text
Dx=N*kX*sx; Dy=N*kY*sy
Bx=m*muX*N; By=m*muY*N
x=kX*sx/muX; y=kY*sy/muY
r=(abs(x)^p+abs(y)^p)^(1/p); rho=r/m
Fx=Bx*H(rho)*x/r; Fy=By*H(rho)*y/r
```

H is unchanged: rho below a; rho-(rho-a)^2/[4(1-a)] in the shoulder; 1 at/above 2-a.
Return exact demand in the linear region and exact zero for absent capacity/zero demand.
For p=2 retain `Math.hypot(x,y)` and the old force evaluation order. For p>2 evaluate the
scaled norm `maxAbs*(1+(minAbs/maxAbs)^p)^(1/p)` to avoid overflow from raw powers. When either
component is zero, return the other absolute component exactly. No force direction rotation occurs.

## Invariants and wheel proof

Pure axes have r=abs(x) or abs(y), independent of p. Both pure capacities and their onset slips,
GX/PX/GY/PY/KNEE meanings, reference-speed regularization and surface material factors are retained.
At zero steering on the flat fixture the complete straight acceleration/braking traces are identical.

Let C=N*H(rho)/rho, with its linear limit N. C>=0 and (Fx,Fy)=C*(kX*sx,kY*sy), hence

```text
Fx*(Vx-R*Omega)+Fy*Vy = -C*Vref*(kX*sx^2+kY*sy^2) <= 0
Lp(Fx/Bx,Fy/By)=H(rho)<=1
F(c*N)=c*F(N)
```

With fixed y and q=abs(x/r)^p, differentiation in the current x=kX*sx/muX notation gives

```text
dFx/dx = Bx * [H(rho)/r*(1-q) + H'(rho)/m*q] >= 0.
dx/dOmega = kX*R/(muX*Vref) > 0.
```

H,H' are nonnegative and q lies in [0,1]. The origin uses the linear limit. The argument holds
for p>=1, although the implemented domain is >=2. Thus Q'(Omega)>=I/dt>0 after adding the
retained nondecreasing rolling resistance. The signed Coulomb atom, unique root and finite
bracket remain unchanged: abs(Fx)<=Bx still bounds maximum road torque R*Bx.

A 90-degree slide with Omega=Vx=0 gives Fx=0 and Fy opposing Vy. No heading propulsion,
artificial yaw moment, velocity correction, speed compensation or hidden stability state is added.
Translation and moment continue to derive from `evaluateVehicleWrench`'s same contact forces.

## Geometry audit and protection

`usefulLateralCapacity` is currently diagnostic-only (no production caller). Generalize its
linear-region reserve to `By * [max(0,a^p-abs(Dx/Bx)^p)]^(1/p)`. Retain the old square-root
expression exactly for p=2; p>2 uses the scaled equivalent with abs(Dx/Bx)/a clamped at 1.

TCS/ABS do **not** use this diagnostic reserve. `limitWheelTorques` uses the retained pure-X
onset boundary and `wheelRequiredNetTorque`, which invokes the same updated constitutive law
as the wheel solve. Support protection likewise evaluates the same wheel results and shared
wrench. No second ellipse or duplicated controller capacity is introduced.

Repository source audit of ellipse/hypot/rho/capacity identified only the constitutive norm and
reserve as ellipse geometry. Other hypot uses are Vref, physical speed, vector length, geometry
and rendering; ground-map rhoL/rhoS are unrelated texture density. Torque-HUD capacities are
requested torque scales, not tire ellipse capacities. Those meanings remain unchanged.

## Browser and lifecycle

LP is the sixth tire axis after KN: min2.00, max8.00, step0.50, default2.00; minus/value/plus
with endpoint wrap, integer-hundredth grid validation and keyboard forward cycle.
**B** is selected because preferred P is already owned by BODY/MOVE camera selection.
Source key audit found no other KeyB owner. P retains its camera behavior.

The existing five axes, ENG, steering, protection policies, brake bias and all profile parameters
retain their defaults/ranges/steps. LP editing preserves the other five displayed values and
recompiles one immutable linked pair. Recovery and vehicle replacement retain it; rivals keep
independently owned stock p=2 data. Invalid input rejects atomically. No mutable calibration object
is shared with another actor. Reload/course navigation retains the existing reset behavior.

Existing auto-fit CSS accommodates six steppers + ENG. No layout retuning was needed. Actual
browser checks at320x568,390x844,568x320,844x390,1366x768 verify group/label bounds, grid wrap,
keyboard cycling and320x240 backing resolution. `tools/combined-slip-ui-check.html` reruns these
checks against the actual page; it is a development diagnostic, not a production page dependency.

## Falsification and release

See [matched-input findings](research/M9_23_COMBINED_SLIP_FALSIFICATION.md), its 50-row summary,
and the reproducible full-trace probe. This establishes the capacity change, not uniformly improved
handling. Strong-entry beta can increase; trail-braking beta can decrease; protected ordinary
power-on effects can be small. High-p selection is not promoted into a new default or drift goal.
Human control feel, useful drift margins, broad vehicle/terrain calibration and whether p>2 should
be adopted remain undecided. Existing paused five-axis/front-rear retuning remains paused.

This changes normative tire authority and requires a new standalone validation record after the
implementation/doc/test-inclusive head passes complete CI. Then validate the record-inclusive
head and release only by AGENTS' non-force exact-head fast-forward/Pages procedure.
