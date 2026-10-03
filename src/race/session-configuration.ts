import { SESSION_RULE_LIMITS, compileTrafficSettings, type TrafficSettings } from '../course/session-rules.js';

export interface SessionConfiguration {
  /** TIME TRIAL runs alone: no rivals and no clock. */
  readonly mode: 'ARCADE' | 'FREE_PLAY' | 'TIME_TRIAL';
  /** Opponents only; the player is not included. */
  readonly rivalCount: number;
  readonly lapCount: number;
  /** The checkpoint clock; ARCADE only, FREE PLAY and TIME TRIAL have none. */
  readonly timeLimit: boolean;
  /** m/s along the grid slot's road tangent for every competitor at spawn; finite, negative allowed. The product uses 0. */
  readonly initialSpeed: number;
  /** The Session's 32-bit unsigned random seed; rival target exits and traffic derive from it. */
  readonly seed: number;
  /** Traffic, or null for none; TIME TRIAL has none. ARCADE takes its series course's. */
  readonly traffic: TrafficSettings | null;
}

export function compileSessionConfiguration(authoring: SessionConfiguration): Readonly<SessionConfiguration> {
  if (authoring.mode !== 'ARCADE' && authoring.mode !== 'FREE_PLAY' && authoring.mode !== 'TIME_TRIAL')
    throw new RangeError('Session mode must be ARCADE, FREE_PLAY or TIME_TRIAL');
  if (
    !Number.isInteger(authoring.rivalCount) ||
    authoring.rivalCount < 0 ||
    authoring.rivalCount > SESSION_RULE_LIMITS.rivals
  )
    throw new RangeError(`session rivalCount must be an integer within 0..${SESSION_RULE_LIMITS.rivals}`);
  if (!Number.isInteger(authoring.lapCount) || authoring.lapCount < 1 || authoring.lapCount > SESSION_RULE_LIMITS.laps)
    throw new RangeError(`Session lapCount must be an integer within 1..${SESSION_RULE_LIMITS.laps}`);
  if (typeof authoring.timeLimit !== 'boolean') throw new TypeError('Session timeLimit must be boolean');
  if (authoring.mode === 'FREE_PLAY' && authoring.timeLimit) throw new RangeError('FREE PLAY has no clock');
  if (authoring.mode === 'TIME_TRIAL' && (authoring.timeLimit || authoring.rivalCount !== 0 || authoring.traffic))
    throw new RangeError('TIME TRIAL has no rivals, no traffic and no clock');
  if (!Number.isInteger(authoring.seed) || authoring.seed < 0 || authoring.seed > 0xffffffff)
    throw new RangeError('Session seed must be a 32-bit unsigned integer');
  return Object.freeze({
    mode: authoring.mode,
    rivalCount: authoring.rivalCount,
    lapCount: authoring.lapCount,
    timeLimit: authoring.timeLimit,
    initialSpeed: authoring.initialSpeed,
    seed: authoring.seed,
    traffic: authoring.traffic === null ? null : compileTrafficSettings(authoring.traffic),
  });
}
