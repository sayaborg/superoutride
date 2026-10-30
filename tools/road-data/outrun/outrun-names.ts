/** OUTRUN's stages' names and skies, which the road data tool's commands share. */
/** The stages by number: their names on the original's map and their Sections' names. */
export const OUTRUN_NAMES: ReadonlyMap<number, string> = new Map([
  [0x3c, 'COCONUT BEACH'],
  [0x1e, "DEVIL'S CANYON"],
  [0x3b, 'GATEWAY'],
  [0x20, 'CLOUDY MOUNTAIN'],
  [0x2f, 'ALPS'],
  [0x2a, 'DESERT'],
  [0x2d, 'SEASIDE TOWN'],
  [0x35, 'WHEAT FIELD'],
  [0x33, 'OLD CAPITAL'],
  [0x21, 'WILDERNESS'],
  [0x32, 'LAKESIDE'],
  [0x23, 'AUTOBAHN'],
  [0x38, 'DESOLATION HILL'],
  [0x22, 'DEATH VALLEY'],
  [0x26, 'VINEYARD'],
]);
export const slug = (name: string) => name.toLowerCase().replace(/'/g, '').replace(/ /g, '-');

/** Stage `number`'s sky image. */
export const skyName = (number: number) => `outrun-${slug(OUTRUN_NAMES.get(number)!)}-sky`;
