/**
 * How each region is painted, and where it lies on the model (Kyle,
 * 2026-10-13). Asked about "the bright yellow spot on the top of the brain",
 * the guide guessed "my Primary Motor Cortex": it was never told its colours.
 *
 * `colour` names the paint in brainRegions.json; `families` are the everyday
 * colour words it answers to; `place` says where it lies, in the guide's own
 * voice, never naming a region or lobe (the guide reads it aloud, and its words
 * light what they name); `where` are the place words it answers to. regionLooks.test.js checks
 * every family against the paint's hue and every place word against the
 * model's anchor points, so no word here is a guess.
 */
import brainRegions from '../data/brainRegions.json';

export const REGION_LOOKS = Object.freeze({
  1: { colour: 'rose', families: ['red', 'pink'], place: 'the front of me', where: ['front'] },
  2: { colour: 'pale pink', families: ['pink'], place: 'the underside of my front, above the eyes', where: ['underneath', 'front'] },
  3: { colour: 'orange', families: ['orange'], place: 'the top of me, toward the front', where: ['top', 'front'] },
  4: {
    colour: 'golden yellow',
    families: ['yellow', 'gold'],
    place: 'the very top of me, along the midline, toward the front',
    where: ['top', 'middle'],
  },
  5: { colour: 'terracotta', families: ['orange', 'red'], place: 'a strip across the top of me, from side to side', where: ['top'] },
  6: { colour: 'raspberry', families: ['pink', 'red'], place: 'my left side, low toward the front', where: ['side', 'left', 'front'] },
  7: { colour: 'green', families: ['green'], place: 'a strip across the top of me, just behind the middle', where: ['top'] },
  8: { colour: 'sea green', families: ['teal', 'green'], place: 'the top of me, toward the back', where: ['top', 'back'] },
  9: { colour: 'dark teal', families: ['teal', 'green', 'blue'], place: 'my side, toward the back, above the ear', where: ['side', 'back'] },
  10: { colour: 'pale mint', families: ['green'], place: 'the top of me at the back, along the midline', where: ['top', 'back'] },
  11: { colour: 'periwinkle', families: ['blue', 'purple'], place: 'my side, tucked deep inside the groove above my ear', where: ['side'] },
  12: { colour: 'pale blue-grey', families: ['blue', 'grey'], place: 'my side, just above my ear', where: ['side'] },
  13: { colour: 'pale aqua', families: ['blue', 'teal'], place: 'my left side, behind and above my ear', where: ['side', 'left', 'back'] },
  14: { colour: 'orchid', families: ['purple', 'pink'], place: 'my lower side and underside, below my ear', where: ['side', 'underneath'] },
  15: { colour: 'pale mauve', families: ['pink', 'purple'], place: 'my underside, a little toward the front', where: ['underneath'] },
  16: { colour: 'plum', families: ['purple'], place: 'my inner midline, best seen from below', where: ['underneath', 'middle'] },
  17: { colour: 'warm brown', families: ['brown'], place: 'the very back of me', where: ['back'] },
  18: { colour: 'tan', families: ['tan', 'brown'], place: 'the back of me, around the very tip', where: ['back'] },
  19: { colour: 'pale yellow', families: ['yellow'], place: 'underneath me, at the back', where: ['underneath', 'back'] },
  20: { colour: 'grey', families: ['grey'], place: 'underneath me, at the centre', where: ['underneath', 'middle'] },
});

// The words a visitor uses, mapped to the families and places above.
const COLOUR_WORDS = {
  red: 'red', reddish: 'red', pink: 'pink', pinkish: 'pink', rose: 'pink', orange: 'orange', orangey: 'orange',
  yellow: 'yellow', yellowish: 'yellow', gold: 'gold', golden: 'gold', green: 'green', greenish: 'green',
  mint: 'green', teal: 'teal', aqua: 'teal', turquoise: 'teal', blue: 'blue', bluish: 'blue', periwinkle: 'blue',
  purple: 'purple', violet: 'purple', lilac: 'purple', mauve: 'purple', plum: 'purple', orchid: 'purple',
  brown: 'brown', brownish: 'brown', tan: 'tan', beige: 'tan', grey: 'grey', gray: 'grey', silver: 'grey',
  terracotta: 'orange', raspberry: 'pink',
};
const PLACE_WORDS = {
  top: 'top', above: 'top', upper: 'top', crown: 'top',
  bottom: 'underneath', underneath: 'underneath', under: 'underneath', underside: 'underneath', below: 'underneath', beneath: 'underneath',
  front: 'front', forehead: 'front',
  back: 'back', rear: 'back', behind: 'back',
  side: 'side', sides: 'side',
  left: 'left',
  middle: 'middle', midline: 'middle', centre: 'middle', center: 'middle',
};

// "bright", "pale", "dark": the paint's lightness and strength, in %.
const SHADE_WORDS = {
  bright: 'bright', vivid: 'bright', strong: 'bright', rich: 'bright',
  pale: 'pale', light: 'pale', soft: 'pale', pastel: 'pale',
  dark: 'dark', deep: 'dark',
};
function lightness(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { l: l * 100, s: s * 100 };
}
const SHADE_FITS = {
  bright: ({ l, s }) => s >= 40 && l < 70,
  pale: ({ l }) => l >= 70,
  dark: ({ l }) => l <= 50,
};

const words = (text) => String(text).toLowerCase().replace(/['’]/g, '').split(/[^a-z]+/).filter(Boolean);

/**
 * Finds the region a visitor describes by colour (and place): `{ region }`,
 * `{ error }` naming the candidates or saying none fits, or null when the
 * words name no colour (then this is not a description by looks).
 *
 * Each region scores 2 for a colour word that is its main family, 1 for
 * another of its families, 2 for a shade word (bright, pale, dark) its paint
 * fits, and 1 for each place word that fits; it must match a colour, and a
 * place when one is given. The best score wins; a tie asks which.
 */
export function findRegionByLooks(text) {
  const said = words(text);
  const families = [...new Set(said.map((word) => COLOUR_WORDS[word]).filter(Boolean))];
  if (families.length === 0) return null;
  const places = [...new Set(said.map((word) => PLACE_WORDS[word]).filter(Boolean))];
  const shades = [...new Set(said.map((word) => SHADE_WORDS[word]).filter(Boolean))];
  const hexById = new Map(brainRegions.regions.map((region) => [region.id, region.hex]));
  const scored = Object.entries(REGION_LOOKS)
    .map(([id, looks]) => {
      const colour = families.reduce((sum, family) => sum + (looks.families[0] === family ? 2 : looks.families.includes(family) ? 1 : 0), 0);
      const place = places.filter((word) => looks.where.includes(word)).length;
      const paint = lightness(hexById.get(Number(id)));
      const shade = 2 * shades.filter((word) => SHADE_FITS[word](paint)).length;
      return { id: Number(id), looks, colour, place, shade };
    })
    .filter(({ colour, place }) => colour > 0 && (places.length === 0 || place > 0));
  if (scored.length === 0) {
    const painted = Object.values(REGION_LOOKS).some((looks) => families.some((family) => looks.families.includes(family)));
    return { error: painted ? `No region of mine painted ${families.join(' or ')} lies there.` : `No region of mine is painted ${families.join(' or ')}.` };
  }
  const total = ({ colour, place, shade }) => colour + place + shade;
  const top = Math.max(...scored.map(total));
  const best = scored.filter((entry) => total(entry) === top);
  const byId = new Map(brainRegions.regions.map((region) => [region.id, region]));
  if (best.length === 1) return { region: byId.get(best[0].id) };
  const named = best.map(({ id, looks }) => `${byId.get(id).name} (${looks.colour}, ${looks.place})`);
  // Named aloud, each would light in turn: the guide asks by colour and place.
  return { error: `"${text}" could mean ${named.join(' or ')}. Ask which by colour and place, without naming them.` };
}
