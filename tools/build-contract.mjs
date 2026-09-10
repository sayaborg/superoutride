/** Input-only bridge for immutable reference builds; never changes recorded outputs. */
export function vehicleUpdateForBuild(update) {
  if (update.length === 4) return update;
  if (update.length === 6) return ({ guide, height, surfaces }, ...args) => update(guide, height, surfaces, ...args);
  throw new Error('unknown vehicle update contract');
}
