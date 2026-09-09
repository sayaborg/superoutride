# Steering limiter audit response

The supplied audit is preserved verbatim in M9_26_STEERING_LIMITER_USER_AUDIT.txt. The implemented
policy is authority121, not the previous J maximization. No old research is rewritten.

Accepted: distinguish D from front contact slip; account for actual surface projection; locked/
zero-force degeneracy; no nested wheel solves; explain changes to80/101 explicitly. The45deg
pure-lateral maximum is an extreme-low-speed conditional limit, not a broad low-speed setting.
Existing control has no speed table. New work is a state-dependent reduction of requested uD.

Qualification of audit claims:
- Its stock Testarossa M45/D9.5 and reference tire are valid constructor data. Published browser
  player defaults are M60/D12, GX4/GY2.5/PX8%/PY8%, per120. These must not be conflated.
- The anti-parallel locked-tire formula requires equal normalized directional stiffness as well
  as the stated isotropic capacity for the given law; equal mu alone is insufficient when kX!=kY.
  The stock reference has both equalities, so its counterexample is valid.
- For equal stiffness/capacity and fully saturated rolling-plane motion, with V,w>0,
  J=B*w*sin(alpha)/sqrt(w^2+V^2-2*w*V*cos(alpha)). Differentiation gives cos(alpha*)=w/V
  on the braking branch w<V, and V/w on the driving branch w>V. The root must remain inside
  the saturated/mechanical domain. At w=0 the isotropic locked force has J=0.
- A rapidly moving optimum is not necessarily a mathematical discontinuity. The unexpected
  state-driven change in allowed authority remains a valid design concern.
- Nested wheel solving is expensive in evaluation count; “impossible at60fps” needs actual host
  measurements. The selected closed-form limiter avoids that cost regardless.

Policy difference from the recommendation to bound total rho: total rho can exhaust lateral
permission under braking/lock.121 instead caps the pure-lateral normalized demand component at
its onset, with a baseline allowance to preserve existing self-steering. It is a transparent
input-saturation policy, not maximum force, combined-grip reserve or vehicle-stability proof.
Wheel spin cannot widen its interval at fixed contact/body/tire data because it is not an input.
