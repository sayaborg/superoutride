/** The tire kernel's output components: rolling (R) and friction (Q). */
export const TIRE_COMPONENTS = Object.freeze(['rolling', 'friction'] as const);
export type TireComponent = (typeof TIRE_COMPONENTS)[number];
export type TireComponents = Readonly<Record<TireComponent, boolean>>;
export const TIRE_COMPONENT_RANGE = Object.freeze({ minValue: 0, maxValue: 1, defaultValue: 1 });
