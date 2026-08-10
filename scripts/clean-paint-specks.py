"""Remove stray specks and pinholes from the painted region identity.

A region is a connected patch of cortex. Where the paint leaves a handful of
vertices of one region stranded inside another, the renderer is entitled to
show them, because the triangle around them genuinely carries that region in
its candidate set - so a speck of colour appears far from the region it belongs
to, and a pinhole appears inside it.

This finds every connected patch on the welded surface that is too small to be
anatomy and hands it to whichever region surrounds it. The id texture is then
corrected over the affected triangles, so paint and texture continue to agree.
"""

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
from atlas_uv import (  # noqa: E402
    build_welded_surface_graph,
    read_accessor,
    read_glb,
)
from glb_write import write_color1, write_glb  # noqa: E402

ROOT = SCRIPTS.parent
MODEL_PATH = ROOT / "public/brain.glb"
ID_MAP_PATH = ROOT / "public/maps/brain_region_ids_4096.png"

# The smallest genuine patch in the painted master is Broca's area at 290
# vertices, and every region's second lobe exceeds 400. Anything at or below
# this is noise, not anatomy.
MAX_SPECK_VERTICES = 48


def surface_components(labels, adjacency):
    """(component id per vertex, label per component, size per component)."""
    component = np.full(len(labels), -1, dtype=np.int64)
    values, sizes = [], []
    for start in range(len(labels)):
        if component[start] >= 0:
            continue
        label = labels[start]
        queue = deque([start])
        component[start] = len(values)
        size = 0
        while queue:
            vertex = queue.popleft()
            size += 1
            for peer in adjacency[vertex]:
                if component[peer] < 0 and labels[peer] == label:
                    component[peer] = len(values)
                    queue.append(peer)
        values.append(label)
        sizes.append(size)
    return component, np.array(values), np.array(sizes)


def dominant_neighbour(component, members, labels, adjacency):
    """The label that most surrounds a patch, ignoring the patch itself."""
    tally = {}
    for vertex in members:
        for peer in adjacency[vertex]:
            if component[peer] == component[vertex]:
                continue
            tally[labels[peer]] = tally.get(labels[peer], 0) + 1
    if not tally:
        return None, 0.0
    winner = max(tally, key=tally.get)
    return int(winner), tally[winner] / sum(tally.values())


def main():
    dry_run = "--apply" not in sys.argv
    document, binary = read_glb(str(MODEL_PATH))
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    positions = read_accessor(
        document, binary, attributes["POSITION"]
    ).astype(np.float64)
    colour1 = read_accessor(document, binary, attributes["COLOR_1"])
    uv3 = read_accessor(document, binary, attributes["TEXCOORD_3"]).astype(
        np.float64
    )
    triangles = read_accessor(document, binary, primitive["indices"]).reshape(
        -1, 3
    )
    labels = colour1[:, 0].astype(np.int64)

    vertex_to_welded, _, adjacency = build_welded_surface_graph(
        positions, triangles
    )
    neighbours = [np.fromiter(peers, dtype=np.int64) for peers in adjacency]
    welded = np.zeros(len(adjacency), dtype=np.int64)
    welded[vertex_to_welded] = labels

    names = {
        region["id"]: region["name"]
        for region in json.loads(
            (ROOT / "src/data/brainRegions.json").read_text()
        )["regions"]
    }
    updated = welded.copy()
    removed = []
    # Absorbing a patch can strand a vertex that was only attached through it,
    # so the sweep repeats until the surface stops changing.
    while True:
        component, values, sizes = surface_components(updated, neighbours)
        members_of = {}
        for vertex, index in enumerate(component):
            members_of.setdefault(int(index), []).append(vertex)

        pass_removed = []
        for index, size in enumerate(sizes):
            if size > MAX_SPECK_VERTICES:
                continue
            members = members_of[index]
            target, share = dominant_neighbour(
                component, members, updated, neighbours
            )
            if target is None or target == values[index]:
                continue
            updated[members] = target
            pass_removed.append(
                {
                    "region": int(values[index]),
                    "name": names[int(values[index])],
                    "vertices": int(size),
                    "absorbedBy": names[target],
                    "surroundedShare": round(share, 3),
                }
            )
        if not pass_removed:
            break
        removed += pass_removed

    vertex_labels = updated[vertex_to_welded]
    changed = vertex_labels != labels
    report = {
        "specksRemoved": len(removed),
        "verticesReassigned": int(np.count_nonzero(changed)),
        "byRegion": {},
        "detail": removed,
        "applied": not dry_run,
    }
    for entry in removed:
        bucket = report["byRegion"].setdefault(entry["name"], 0)
        report["byRegion"][entry["name"]] = bucket + entry["vertices"]

    if not dry_run and changed.any():
        id_map = np.array(Image.open(ID_MAP_PATH))
        new_map = repaint_touched(
            id_map, uv3, triangles, vertex_labels, labels, changed
        )
        report["textureTexelsChanged"] = int(
            np.count_nonzero(new_map != id_map)
        )
        Image.fromarray(new_map).save(ID_MAP_PATH)
        write_glb(
            MODEL_PATH,
            document,
            write_color1(document, binary, vertex_labels),
        )

    print(json.dumps(report, indent=2))


def repaint_touched(id_map, uv, triangles, labels, previous, changed):
    """Rewrite the texture only where a speck used to be.

    A texel is rewritten only if it currently shows one of the labels the speck
    carried, so the correction cannot disturb any boundary the artist drew.
    """
    height, width = id_map.shape
    output = id_map.copy()
    stale = set(int(value) for value in np.unique(previous[changed]))
    editable = np.isin(id_map, sorted(stale))

    for index in np.flatnonzero(changed[triangles].any(axis=1)):
        corners = triangles[index]
        label = int(np.bincount(labels[corners]).argmax())
        pu = uv[corners, 0] * (width - 1)
        pv = uv[corners, 1] * (height - 1)
        x0, x1 = max(int(np.floor(pu.min())), 0), min(
            int(np.ceil(pu.max())) + 1, width
        )
        y0, y1 = max(int(np.floor(pv.min())), 0), min(
            int(np.ceil(pv.max())) + 1, height
        )
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
        inside = (
            (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1) & editable[y0:y1, x0:x1]
        )
        if inside.any():
            output[y0:y1, x0:x1][inside] = label
    return output


if __name__ == "__main__":
    main()
