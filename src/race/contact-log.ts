/** What a contact's other side is: another vehicle, a wall or course limit, a fixed object or a movable one. */
export type ContactCounterpart = 'vehicle' | 'wall' | 'object' | 'movable';

/** A barrier line pushing the player during one step: the line, its friction's power and the speeds it acts on. */
export interface BarrierRub {
  /** The barrier line's identity. */
  readonly line: string;
  /** The power its friction removes: the friction force times the speed along the road, W. */
  readonly frictionPower: number;
  /** The player's speed along the road, m/s. */
  readonly speed: number;
  /** The line's push, N. */
  readonly push: number;
}

/** A contact of the player that began during one step: its counterpart and the work its damper term dissipated, J. */
export interface ContactStart {
  readonly counterpart: ContactCounterpart;
  readonly work: number;
}

/** The player's contacts of one fixed step, published at the step's end; read-only, with no sound values. */
export interface PlayerContacts {
  readonly rubs: readonly BarrierRub[];
  readonly starts: readonly ContactStart[];
}

const NONE: PlayerContacts = Object.freeze({ rubs: Object.freeze([]), starts: Object.freeze([]) });

/**
 * The race's record of the contacts the player's vehicle takes part in during a step: the contacts report every body's
 * contacts and the log keeps the player's. `publish` closes the step and returns its frozen record.
 */
export function createContactLog(playerId: string) {
  let rubs: BarrierRub[] = [],
    starts: ContactStart[] = [];
  return Object.freeze({
    /** A barrier line pushes the body `id` this step. */
    rub(id: string, line: string, frictionPower: number, speed: number, push: number): void {
      if (id === playerId) rubs.push(Object.freeze({ line, frictionPower, speed, push }));
    },
    /** A contact of the body `id` with `counterpart` began this step, its damper term dissipating `work`. */
    start(id: string, counterpart: ContactCounterpart, work: number): void {
      if (id === playerId) starts.push(Object.freeze({ counterpart, work }));
    },
    publish(): PlayerContacts {
      if (!rubs.length && !starts.length) return NONE;
      const published = Object.freeze({ rubs: Object.freeze(rubs), starts: Object.freeze(starts) });
      [rubs, starts] = [[], []];
      return published;
    },
  });
}
export type ContactLog = ReturnType<typeof createContactLog>;
