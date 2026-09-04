# M9.16 Engine Power Diagnostic Selector

Status: normative scoped engine-output calibration and browser-selector authority.
Handling remains `DEV_UNCALIBRATED`.

## 1. Purpose and scope

Hands-on feedback reports usable handling with non-dropping tire force but substantial speed loss
in drift. This milestone adds an engine-output comparison axis to test power availability without
changing the tire curve, G/P/S calibration, steering, transmission strategy, camera or renderer.
It does not declare engine power to be the proven cause of the reported speed loss or certify that
increased output makes drift stable.

## 2. Architecture decision gate

1. Automatic powertrain owns engine-curve sampling and delivery of wheel torque. Browser composition
   owns the diagnostic selector and applies it only to the selected player instance.
2. Reuse the existing torque-curve sample, gear/efficiency/cut factors, ordinary drive split, implicit
   wheel solve and contact-force integration. Do not introduce another drive-force route.
3. Exactly one instance-owned scalar, `powertrain.engineTorqueMultiplier`, owns the calibration.
   Browser controls and HUD read it; neither stores a second current selection. Profile torque curves
   remain immutable. The existing three tire-calibration scalars remain unchanged.
4. Common mechanics adds no vehicle-ID, CAR/BIKE, drive-layout, route, camera, or drift branch.
5. One browser adapter serves keyboard and touch in all three existing composition roots. One compact
   cycling button shares the calibration presentation row without owning any tire calibration.
6. All world-state, contact, wheel, renderer, metric, topology and input invariants remain unchanged.
7. Regressions prove fixed-RPM torque scaling, baseline identity, unchanged cuts/RPM/shift state,
   instance isolation, atomic rejection, recovery/replacement retention, browser wiring and finite
   all-nine-profile response at the maximum selectable multiplier.

## 3. Engine calibration authority

```text
engineTorque = sample(profile.torqueCurve, engineRpm) * engineTorqueMultiplier
wheelTorque  = throttle * engineTorque * gearRatio * finalDriveRatio * efficiency
               * shiftDriveScale * redlineScale
```

The default multiplier is exactly 1. Multipliers must be finite and strictly positive. A setter
validates before changing only that scalar. RPM, gear, shift timer, actuator state, wheel Omega,
vehicle motion and cached torque observations are not rewritten by the setter. Derived torque
observations update on the next ordinary powertrain step.

At the same RPM and powertrain state, engine torque and power scale by the multiplier. Vehicle
speed, acceleration, drift distance and realized power during changing RPM are not guaranteed to
scale by it. Shift-drive cutoff and redline reduction remain in force, including their zero outputs.
This is a diagnostic torque-curve scale, not a guaranteed constant-power source or speed assist.

## 4. Browser controls and lifecycle

```text
choices = 1.0 / 1.5 / 2.0 / 3.0 / 4.0
initial = 1.0
keyboard = K, one cycle per non-repeated keydown
sequence = 1.0 -> 1.5 -> 2.0 -> 3.0 -> 4.0 -> 1.0
touch = ENG xN button in the tire/engine calibration row
HUD = ENG [K] xN, alongside the unchanged tire readout
```

The browser choice array is the sole choice/cycle authority. The button reads the current player
through a getter, so vehicle replacement cannot leave the controls attached to the old instance.
Recovery resets dynamic powertrain state while preserving the multiplier. Explicit safe-spawn
vehicle replacement copies the previous multiplier to the new powertrain instance. Rivals and
ordinary constructors stay at 1.0. A full page/course reload starts at 1.0, like the current browser
calibration session; no persistent storage authority is added.

No G/P/S value, domain or default changes. In particular M9.15 still exposes S=1.00..2.00: this
milestone does not silently add G3/S3 to the browser. The available G2/S2 point already provides a
non-dropping tire comparison; tests can additionally construct G3/S3 through existing calibration.

## 5. Presentation

The engine button is appended after the existing three tire buttons. Landscape uses three tire
columns and a full-width engine button below them, fitting the existing two-button-row selector
height. Portrait uses four columns on the existing final calibration row. No new full-screen input
layer, steering gesture or pedal gesture is added. The shared selector-button interaction exclusion
keeps calibration taps out of driving input.

## 6. Retained authorities and explicit supersession

This document adds one generic instance-owned engine-output scalar to M9.0/M9.8 powertrain/profile
ownership. The base profile still owns the unscaled curve and all mechanical data. M9.15 remains
current tire-law authority; M9.11 remains steering law; M9.14/M9.13 remain touch authority. Current
entry documents name M9.16; historical milestone documents and immutable validation are not rewritten.

## 7. Acceptance and release evidence

The complete suite must pass on the implementation/documentation exact head. This is a normative
calibration-boundary addition and requires a new standalone validation record under
`docs/validation/README.md`, followed by complete CI on the validation-inclusive exact head and the
pure fast-forward/same-SHA main and Pages release required by `AGENTS.md`.

Automatic tests establish correct engine scaling and lifecycle, not pleasant sustained drift. The
hands-on comparison should hold tire/steering/course choices fixed while changing only ENG. More
power can reduce speed loss yet increase wheelspin and oversteer; that is an observation to record,
not something this selector hides or automatically corrects.
