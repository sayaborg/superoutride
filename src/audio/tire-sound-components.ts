export const TIRE_COMPONENTS = Object.freeze([
  Object.freeze({ key: 'rolling', label: 'R', description: 'Rolling' }),
  Object.freeze({ key: 'friction', label: 'Q', description: 'Friction' }),
] as const);
type TireComponent = (typeof TIRE_COMPONENTS)[number]['key'];
export type TireComponents = Readonly<Record<TireComponent, boolean>>;
export const TIRE_COMPONENT_RANGE = Object.freeze({ minValue: 0, maxValue: 1, defaultValue: 1 });
