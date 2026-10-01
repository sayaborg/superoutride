/** At most sixteen competitors take part in a Session, the player included. */
const COMPETITORS = 16;

/** Product Session rules, shared by series, runtime admission and controls; rivals are the competitors but one. */
export const SESSION_RULE_LIMITS = Object.freeze({
  competitors: COMPETITORS,
  rivals: COMPETITORS - 1,
  laps: 99,
  timeMargin: 10,
});
