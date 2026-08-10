"""Make the id texture agree with the artist's paint inside every region.

COLOR_1 and brain_region_ids_4096.png were baked from the same source, but not
identically: in places the texture names a different region from the triangle it
sits inside. Where that triangle's three corners agree, there is no border to
argue about, so the texture is simply wrong - and because the triangle borders
the other region somewhere within one hop, the shader's candidate check lets it
through. That is what a pinhole inside a region and a speck outside one are.

Two rules, both conservative:

  interior  a triangle whose three corners name one region shows that region
  border    a triangle whose corners disagree may show any of its own corners'
            regions, and nothing else

The second rule leaves the exact line inside a border triangle to the texture,
which is where the artist drew it, so no boundary moves.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from atlas_uv import read_accessor, read_glb  # noqa: E402

ROOT = SCRIPTS.parent
MODEL_PATH = ROOT / "public/brain.glb"
ID_MAP_PATH = ROOT / "public/maps/brain_region_ids_4096.png"
ATLAS_PATH = ROOT / "src/data/brainRegions.json"


def interior_sample_weights(steps=8):
    """Strictly interior barycentric points, standing in for fragments."""
    weights = [
        (i / steps, j / steps, 1 - i / steps - j / steps)
        for i in range(1, steps)
        for j in range(1, steps - i)
    ]
    return np.array(weights, dtype=np.float64)


def reconcile_samples(id_map, uv, triangles, labels):
    """Correct the texels that fragments inside a unanimous triangle land on.

    A triangle smaller than a texel covers no texel centre, so rasterising by
    centres misses it, yet fragments on it still read somewhere. This follows
    the renderer instead: sample the triangle where fragments fall, and correct
    whatever texel that lookup returns.
    """
    height, width = id_map.shape
    corners = labels[triangles]
    unanimous = np.flatnonzero(
        (corners[:, 0] == corners[:, 1]) & (corners[:, 1] == corners[:, 2])
    )
    corner_uv = uv[triangles[unanimous]]
    owner = corners[unanimous, 0]
    output = id_map.copy()
    corrected, conflicts = 0, 0
    for weight in interior_sample_weights():
        point = (
            corner_uv[:, 0] * weight[0]
            + corner_uv[:, 1] * weight[1]
            + corner_uv[:, 2] * weight[2]
        )
        px = np.clip((point[:, 0] * width).astype(np.int64), 0, width - 1)
        py = np.clip((point[:, 1] * height).astype(np.int64), 0, height - 1)
        wrong = output[py, px] != owner
        if not wrong.any():
            continue
        # Two unanimous triangles of different regions can share one texel only
        # where the atlas is packed tighter than its own resolution.
        keys = py[wrong] * width + px[wrong]
        order = np.argsort(keys, kind="stable")
        unique, first = np.unique(keys[order], return_index=True)
        conflicts += int(
            np.count_nonzero(
                np.bincount(
                    np.searchsorted(unique, keys[order]),
                    weights=None,
                    minlength=len(unique),
                )
                > 1
            )
        )
        corrected += len(unique)
        chosen = order[first]
        output[py[wrong][chosen], px[wrong][chosen]] = owner[wrong][chosen]
    return output, corrected, conflicts


def reconcile(id_map, uv, triangles, labels):
    height, width = id_map.shape
    output = id_map.copy()
    corners = labels[triangles]
    unanimous = (corners[:, 0] == corners[:, 1]) & (
        corners[:, 1] == corners[:, 2]
    )
    changed = {"interior": {}, "border": {}}

    for index in range(len(triangles)):
        corner = corners[index]
        pu = uv[triangles[index], 0] * (width - 1)
        # flipY is false on this texture, so image row 0 is v=0.
        pv = uv[triangles[index], 1] * (height - 1)
        x0 = max(int(np.floor(pu.min())), 0)
        x1 = min(int(np.ceil(pu.max())) + 1, width)
        y0 = max(int(np.floor(pv.min())), 0)
        y1 = min(int(np.ceil(pv.max())) + 1, height)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        e1x, e1y = pu[1] - pu[0], pv[1] - pv[0]
        e2x, e2y = pu[2] - pu[0], pv[2] - pv[0]
        det = e1x * e2y - e2x * e1y
        if abs(det) < 1e-12:
            continue
        ox, oy = gx - pu[0], gy - pv[0]
        w1 = (ox * e2y - oy * e2x) / det
        w2 = (oy * e1x - ox * e1y) / det
        w0 = 1 - w1 - w2
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue

        patch = output[y0:y1, x0:x1]
        if unanimous[index]:
            wrong = inside & (patch != corner[0])
            if wrong.any():
                for value in np.unique(patch[wrong]):
                    key = f"{int(value)}->{int(corner[0])}"
                    changed["interior"][key] = changed["interior"].get(
                        key, 0
                    ) + int(np.count_nonzero(patch[wrong] == value))
                patch[wrong] = corner[0]
        else:
            foreign = inside & ~np.isin(patch, corner)
            if foreign.any():
                # Hand the texel to whichever corner it lies nearest, so the
                # correction follows the triangle rather than a global guess.
                nearest = corner[
                    np.argmax(np.stack([w0, w1, w2]), axis=0)
                ]
                for value in np.unique(patch[foreign]):
                    key = f"{int(value)}"
                    changed["border"][key] = changed["border"].get(
                        key, 0
                    ) + int(np.count_nonzero(patch[foreign] == value))
                patch[foreign] = nearest[foreign]
    return output, changed


def main():
    dry_run = "--apply" not in sys.argv
    document, binary = read_glb(str(MODEL_PATH))
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    labels = read_accessor(document, binary, attributes["COLOR_1"])[:, 0].astype(
        np.int64
    )
    uv = read_accessor(
        document, binary, attributes["TEXCOORD_3"]
    ).astype(np.float64)
    triangles = read_accessor(document, binary, primitive["indices"]).reshape(
        -1, 3
    )
    id_map = np.array(Image.open(ID_MAP_PATH))

    corrected, changed = reconcile(id_map, uv, triangles, labels)
    corrected, sampled, conflicts = reconcile_samples(
        corrected, uv, triangles, labels
    )
    names = {
        region["id"]: region["name"]
        for region in json.loads(ATLAS_PATH.read_text())["regions"]
    }

    def describe(bucket, arrow):
        rows = []
        for key, count in sorted(bucket.items(), key=lambda kv: -kv[1]):
            if arrow:
                source, target = key.split("->")
                rows.append(
                    f"{names[int(source)]} -> {names[int(target)]}: {count}"
                )
            else:
                rows.append(f"{names[int(key)]}: {count}")
        return rows

    report = {
        "texelsChanged": int(np.count_nonzero(corrected != id_map)),
        "texelsCorrectedBySampling": sampled,
        "texelsContestedByTwoRegions": conflicts,
        "insideRegions": describe(changed["interior"], True),
        "onBorders": describe(changed["border"], False),
        "applied": not dry_run,
    }
    if not dry_run:
        Image.fromarray(corrected).save(ID_MAP_PATH)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
