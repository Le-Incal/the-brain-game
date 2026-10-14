/**
 * How each region is painted, and where it lies on the model (Kyle,
 * 2026-10-13). Asked about "the bright yellow spot on the top of the brain",
 * the guide guessed "my Primary Motor Cortex": it was never told its colours.
 *
 * `colour` names the paint in brainRegions.json; `families` are the everyday
 * colour words it answers to; `place` says where it lies, in the guide's own
 * voice; `where` are the place words it answers to. regionLooks.test.js checks
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
    place: 'the very top of me, along the midline, just in front of my motor strip',
    where: ['top', 'middle'],
  },
  5: { colour: 'terracotta', families: ['orange', 'red'], place: 'a strip across the top of me, from side to side', where: ['top'] },
  6: { colour: 'raspberry', families: ['pink', 'red'], place: 'my left side, low toward the front', where: ['side', 'left', 'front'] },
  7: { colour: 'green', families: ['green'], place: 'a strip across the top of me, just behind my motor strip', where: ['top'] },
  8: { colour: 'sea green', families: ['green', 'teal'], place: 'the top of me, toward the back', where: ['top', 'back'] },
  9: { colour: 'dark teal', families: ['teal', 'green', 'blue'], place: 'my side, toward the back, above the ear', where: ['side', 'back'] },
  10: { colour: 'pale mint', families: ['green'], place: 'the top of me at the back, along the midline', where: ['top', 'back'] },
  11: { colour: 'periwinkle', families: ['blue', 'purple'], place: 'my side, tucked into the deep groove above my temporal lobe', where: ['side'] },
  12: { colour: 'pale blue-grey', families: ['blue', 'grey'], place: 'my side, along the top of my temporal lobe', where: ['side'] },
  13: { colour: 'pale aqua', families: ['blue', 'teal'], place: 'my left side, at the back of my upper temporal lobe', where: ['side', 'left', 'back'] },
  14: { colour: 'orchid', families: ['purple', 'pink'], place: 'the lower side and underside of my temporal lobe', where: ['side', 'underneath'] },
  15: { colour: 'pale mauve', families: ['pink', 'purple'], place: 'my underside, toward the front of my temporal lobe', where: ['underneath'] },
  16: { colour: 'plum', families: ['purple'], place: 'my inner midline, best seen from below', where: ['underneath', 'middle'] },
  17: { colour: 'warm brown', families: ['brown'], place: 'the very back of me', where: ['back'] },
  18: { colour: 'tan', families: ['tan', 'brown'], place: 'the back of me, around my primary visual cortex', where: ['back'] },
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

const words = (text) => String(text).toLowerCase().replace(/['’]/g, '').split(/[^a-z]+/).filter(Boolean);

/**
 * Finds the region a visitor describes by colour (and place): `{ region }`,
 * `{ error }` naming the candidates or saying none fits, or null when the
 * words name no colour (then this is not a description by looks).
 *
 * Each region scores 2 for a colour word that is its main family, 1 for
 * another of its families, and 1 for each place word that fits; it must match
 * a colour, and a place when one is given. The best score wins; a tie asks which.
 */
export function findRegionByLooks(text) {
  const said = words(text);
  const families = [...new Set(said.map((word) => COLOUR_WORDS[word]).filter(Boolean))];
  if (families.length === 0) return null;
  const places = [...new Set(said.map((word) => PLACE_WORDS[word]).filter(Boolean))];
  const scored = Object.entries(REGION_LOOKS)
    .map(([id, looks]) => {
      const colour = families.reduce((sum, family) => sum + (looks.families[0] === family ? 2 : looks.families.includes(family) ? 1 : 0), 0);
      const place = places.filter((word) => looks.where.includes(word)).length;
      return { id: Number(id), looks, colour, place };
    })
    .filter(({ colour, place }) => colour > 0 && (places.length === 0 || place > 0));
  if (scored.length === 0) {
    const painted = Object.values(REGION_LOOKS).some((looks) => families.some((family) => looks.families.includes(family)));
    return { error: painted ? `No region of mine painted ${families.join(' or ')} lies there.` : `No region of mine is painted ${families.join(' or ')}.` };
  }
  const top = Math.max(...scored.map(({ colour, place }) => colour + place));
  const best = scored.filter(({ colour, place }) => colour + place === top);
  const byId = new Map(brainRegions.regions.map((region) => [region.id, region]));
  if (best.length === 1) return { region: byId.get(best[0].id) };
  const named = best.map(({ id, looks }) => `${byId.get(id).name} (${looks.colour}, ${looks.place})`);
  return { error: `"${text}" could mean ${named.join(' or ')}. Ask which.` };
}
