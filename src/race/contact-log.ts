/** What a contact's other side is: another vehicle, a wall or course limit, a fixed object or a movable one. */
export type ContactCounterpart = 'vehicle' | 'wall' | 'object' | 'movable';

/** A contact of the player that began during one step: its counterpart and the work its damper term dissipated, J. */
export interface ContactStart {
  readonly counterpart: ContactCounterpart;
  readonly work: number;
}

/** The player's contacts of one fixed step, published at the step's end; read-only, with no sound values. */
export interface PlayerContacts {
  readonly starts: readonly ContactStart[];
}

const NONE: PlayerContacts = Object.freeze({ starts: Object.freeze([]) });

/**
 * The race's record of the contacts the player's vehicle takes part in during a step: the contacts report every body's
 * contacts and the log keeps the player's. `publish` closes the step and returns its frozen record.
 */
export function createContactLog(playerId: string) {
  let starts: ContactStart[] = [];
  return Object.freeze({
    /** A contact of the body `id` with `counterpart` began this step, its damper term dissipating `work`. */
    start(id: string, counterpart: ContactCounterpart, work: number): void {
      if (id === playerId) starts.push(Object.freeze({ counterpart, work }));
    },
    publish(): PlayerContacts {
      if (!starts.length) return NONE;
      const published = Object.freeze({ starts: Object.freeze(starts) });
      starts = [];
      return published;
    },
  });
}
export type ContactLog = ReturnType<typeof createContactLog>;
