"""Rewrite the word bank onto the v17 painted taxonomy.

The old atlas and the painted master both carry twenty regions, but the ids
moved and the temporal lobe was properly subdivided. Everything except the old
catch-all "Temporal lobe, unsubdivided" maps one to one; that one is split per
word, because a word about prosody and a word about object identity do not
belong to the same piece of temporal cortex.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGIONS_JS = ROOT / "src/data/regions.js"

OLD_NAMES = {
    1: "Prefrontal cortex", 2: "Orbitofrontal cortex", 3: "Premotor cortex",
    4: "Supplementary motor area", 5: "Primary motor cortex",
    6: "Broca's area", 7: "Primary somatosensory cortex",
    8: "Superior parietal lobule", 10: "Angular gyrus", 11: "Precuneus",
    12: "Primary auditory cortex", 13: "Wernicke's area",
    15: "Fusiform gyrus", 17: "Piriform cortex", 18: "Primary visual cortex",
    19: "Visual association cortex", 20: "Cerebellar cortex", 22: "Pons",
    24: "Cingulate cortex", 30: "Temporal lobe, unsubdivided",
}

# One-to-one renames and renumberings. The only judgement here is that the
# superior parietal lobule became the somatosensory association cortex and the
# fusiform gyrus was folded into inferior temporal cortex, which is what the
# painted master shows those areas to be.
DIRECT = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 10: 9, 11: 10,
    12: 11, 13: 13, 15: 14, 17: 15, 18: 17, 19: 18, 20: 19, 22: 20, 24: 16,
}

# The retired temporal catch-all, resolved per word. 12 is the superior
# temporal gyrus (auditory association: prosody, melody, phonology); 14 is
# inferior temporal cortex (object identity and semantic knowledge).
TEMPORAL_SPLIT = {
    "LISTENING TO MUSIC": 12,
    "UNDERSTANDING WORDS": 12,
    "NAMING AN OBJECT": 14,
    "REMEMBERING A SMELL": 14,
    "UNDERSTANDING SARCASM": 12,
    "DETECTING A LIE": 12,
    "RECOGNISING A MELODY": 12,
    "TIP-OF-THE-TONGUE": 12,
    "ABSOLUTE PITCH": 12,
    "PROSODY OF SPEECH": 12,
    "SEMANTIC PRIMING": 14,
}

# Two factoids named regions the new taxonomy retired. The science is unchanged.
FACTOID_REWRITES = {
    "RECOGNISING A FACE": (
        "Inferior temporal cortex contains a fusiform patch strongly "
        "specialised for face recognition."
    ),
    "KNOWING WHERE YOUR HAND IS": (
        "Somatosensory association cortex integrates proprioception into a "
        "body-centred spatial map."
    ),
    "MENTAL ROTATION": (
        "Mental rotation strongly recruits parietal visuospatial systems."
    ),
}

ENTRY = re.compile(
    r"\{ word: '(?P<word>[^']+)', targetRegion: (?P<target>\d+), "
    r"tier: (?P<tier>\d+)(?P<alternates>, acceptAlternates: \[[^\]]*\])?"
    r", factoid: (?P<factoid>.+) \},"
)


def main():
    source = REGIONS_JS.read_text()
    atlas = json.loads((ROOT / "src/data/brainRegions.json").read_text())
    new_names = {region["id"]: region["name"] for region in atlas["regions"]}

    rows = []

    def remap(word, old_id):
        if old_id == 30:
            if word not in TEMPORAL_SPLIT:
                raise KeyError(f"No temporal split decided for {word!r}")
            return TEMPORAL_SPLIT[word]
        if old_id not in DIRECT:
            raise KeyError(f"Unmapped old region {old_id} in {word!r}")
        return DIRECT[old_id]

    def rewrite(match):
        word = match.group("word")
        old_target = int(match.group("target"))
        target = remap(word, old_target)

        old_alternates = []
        if match.group("alternates"):
            old_alternates = [
                int(value)
                for value in re.findall(r"\d+", match.group("alternates"))
            ]
        alternates = []
        for old_id in old_alternates:
            new_id = remap(word, old_id)
            # A split or a merge can collide an alternate with its own target.
            if new_id != target and new_id not in alternates:
                alternates.append(new_id)

        factoid = FACTOID_REWRITES.get(word)
        factoid_literal = (
            json.dumps(factoid) if factoid else match.group("factoid")
        )

        rows.append(
            {
                "word": word,
                "oldTarget": old_target,
                "newTarget": target,
                "oldName": OLD_NAMES[old_target],
                "newName": new_names[target],
                "oldAlternates": old_alternates,
                "newAlternates": alternates,
                "retargeted": OLD_NAMES[old_target] != new_names[target],
                "factoidRewritten": bool(factoid),
            }
        )

        parts = [
            f"{{ word: '{word}'",
            f"targetRegion: {target}",
            f"tier: {match.group('tier')}",
        ]
        if alternates:
            parts.append(f"acceptAlternates: [{', '.join(map(str, alternates))}]")
        parts.append(f"factoid: {factoid_literal} }},")
        return ", ".join(parts)

    migrated, count = ENTRY.subn(rewrite, source)
    if count != len(rows):
        raise SystemExit("entry count mismatch")
    REGIONS_JS.write_text(migrated)

    valid = set(new_names)
    for row in rows:
        unknown = ({row["newTarget"]} | set(row["newAlternates"])) - valid
        if unknown:
            raise SystemExit(f"{row['word']} references unknown {unknown}")

    print(f"migrated {count} entries\n")
    print(f"{'word':28} {'old region':30} -> {'new region':32} alternates")
    for row in rows:
        marker = "*" if row["retargeted"] else " "
        alternates = (
            ", ".join(new_names[a] for a in row["newAlternates"]) or "—"
        )
        print(
            f"{marker}{row['word'][:27]:27} {row['oldName'][:29]:29} -> "
            f"{row['newName'][:31]:31} {alternates[:52]}"
        )
    print(f"\nretargeted (name changed): "
          f"{sum(r['retargeted'] for r in rows)}")
    print(f"factoids rewritten: {sum(r['factoidRewritten'] for r in rows)}")


if __name__ == "__main__":
    main()
