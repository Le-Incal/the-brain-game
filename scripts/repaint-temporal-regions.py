"""Split the painted Wernicke's Area into gyrus and Wernicke's, along a drawn line.

The master painted one patch behind primary auditory cortex and called all of it
Wernicke's Area. The artist marked up a render of the model with two loops: the
anterior one is Superior Temporal Gyrus, the posterior one is Wernicke's. Since
the markup was drawn over a render whose projection is recorded, the dividing
line maps back onto the surface exactly.

Nothing else moves. Only vertices the master already labelled Wernicke's can
change, and only into Superior Temporal Gyrus, so every other boundary the
artist drew survives untouched.
"""

import importlib.util
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
REFERENCE = ROOT / "docs/handoff/markup/DRAW_HERE_left_lateral.png"
MARKUP = Path(
    "/Users/kylemertensmeyer/.cursor/projects/"
    "Users-kylemertensmeyer-the-brain-game/assets/"
    "Screenshot_2026-08-10_at_2.56.28_AM-548f91c5-4d25-417d-a56d-234bf3afffe5.png"
)

GYRUS = 12
WERNICKE = 13
TERRITORY = (GYRUS, WERNICKE)
SMOOTHING_PASSES = 3
MIN_CELL_PIXELS = 2000


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), SCRIPTS / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def drawn_cells():
    """The two loop interiors, in reference-render pixels, anterior first."""
    align = load_script("align-marked-render")
    annotation = load_script("annotation_image")
    fit, _, drawn = align.align(str(MARKUP), scales=np.linspace(0.53, 0.60, 36))
    ys, xs = np.nonzero(drawn)
    mapped = align.marked_to_reference(
        np.stack([xs, ys], axis=1).astype(np.float64), fit
    )

    size = json.loads(REFERENCE.with_suffix(".json").read_text())["size"]
    line = np.zeros((size, size), dtype=bool)
    line[
        np.clip(np.round(mapped[:, 1]).astype(int), 0, size - 1),
        np.clip(np.round(mapped[:, 0]).astype(int), 0, size - 1),
    ] = True
    # Rescaling punches holes in the strokes, and a loop with a hole floods.
    for _ in range(3):
        grown = line.copy()
        for shift in (1, -1):
            grown |= np.roll(line, shift, axis=0) | np.roll(line, shift, axis=1)
        line = grown

    interior = annotation.fill_interior(line) & ~line
    cells = []
    seen = np.zeros_like(interior)
    for start in zip(*np.nonzero(interior)):
        if seen[start]:
            continue
        queue, points = deque([start]), []
        seen[start] = True
        while queue:
            y, x = queue.popleft()
            points.append((y, x))
            for peer in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if (
                    0 <= peer[0] < size
                    and 0 <= peer[1] < size
                    and interior[peer]
                    and not seen[peer]
                ):
                    seen[peer] = True
                    queue.append(peer)
        if len(points) >= MIN_CELL_PIXELS:
            cells.append(np.array(points))
    if len(cells) != 2:
        raise SystemExit(f"expected two drawn loops, found {len(cells)}")
    # Screen right is posterior in this view, and the artist labelled the
    # posterior loop Wernicke's.
    cells.sort(key=lambda points: points[:, 1].mean())
    return fit, line, cells, size


def posterior_side(cells, line, size):
    """True where a pixel belongs to the posterior loop rather than the anterior.

    The two loops abut, so the boundary between them is the drawn line the
    artist actually cared about. Pixels outside both loops take whichever side
    is nearer, which is what lets vertices sitting just beyond the outlines
    follow the same division.
    """
    side = np.full((size, size), -1, dtype=np.int8)
    queue = deque()
    for value, points in enumerate(cells):
        side[points[:, 0], points[:, 1]] = value
        queue.extend((int(y), int(x)) for y, x in points)
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < size and 0 <= nx < size and side[ny, nx] < 0:
                side[ny, nx] = side[y, x]
                queue.append((ny, nx))
    del line
    return side == 1


def project(positions, projection):
    local = positions - np.array(projection["centre"])
    size, extent = projection["size"], projection["extent"]
    px = (local @ np.array(projection["right"])) / extent * 0.5 + 0.5
    py = 0.5 - (local @ np.array(projection["up"])) / extent * 0.5
    return (
        np.clip((px * (size - 1)).astype(int), 0, size - 1),
        np.clip((py * (size - 1)).astype(int), 0, size - 1),
    )


def smooth_within(labels, movable, neighbours, passes=SMOOTHING_PASSES):
    """Majority filter over the surface, so the projected line becomes a
    fold-following boundary rather than a screen-space one."""
    current = labels.copy()
    indices = np.flatnonzero(movable)
    for _ in range(passes):
        nxt = current.copy()
        for vertex in indices:
            values = current[neighbours[vertex]]
            values = values[np.isin(values, TERRITORY)]
            if not len(values):
                continue
            counts = np.bincount(values)
            winner = int(counts.argmax())
            if counts[winner] >= len(values) * 0.6:
                nxt[vertex] = winner
        current = nxt
    return current


def largest_component(mask, neighbours):
    if not mask.any():
        return mask
    seen = np.zeros_like(mask)
    best = np.zeros_like(mask)
    for start in np.flatnonzero(mask):
        if seen[start]:
            continue
        stack, component = [start], []
        seen[start] = True
        while stack:
            vertex = stack.pop()
            component.append(vertex)
            for peer in neighbours[vertex]:
                if mask[peer] and not seen[peer]:
                    seen[peer] = True
                    stack.append(peer)
        if len(component) > int(best.sum()):
            best = np.zeros_like(mask)
            best[component] = True
    return best


def box_counts(mask, radius):
    integral = np.zeros((mask.shape[0] + 1, mask.shape[1] + 1), dtype=np.int32)
    integral[1:, 1:] = mask.astype(np.int32).cumsum(0).cumsum(1)
    height, width = mask.shape
    top = np.clip(np.arange(height) - radius, 0, height)
    bottom = np.clip(np.arange(height) + radius + 1, 0, height)
    left = np.clip(np.arange(width) - radius, 0, width)
    right = np.clip(np.arange(width) + radius + 1, 0, width)
    return (
        integral[np.ix_(bottom, right)]
        - integral[np.ix_(top, right)]
        - integral[np.ix_(bottom, left)]
        + integral[np.ix_(top, left)]
    )


def smooth_texture_labels(id_map, editable, radius=3, passes=2):
    """A majority filter inside the repainted patch, so the new border reads as
    drawn rather than as the triangle edges it was rasterised from."""
    output = id_map.copy()
    for _ in range(passes):
        stacked = np.stack(
            [
                box_counts((output == label) & editable, radius)
                for label in TERRITORY
            ]
        )
        winner = np.array(TERRITORY, dtype=id_map.dtype)[stacked.argmax(axis=0)]
        output = np.where(editable, winner, output)
    return output


def rasterize_patch(id_map, uv, triangles, labels, touched):
    """Rewrite the id texture inside the old Wernicke's patch and nowhere else."""
    height, width = id_map.shape
    editable = id_map == WERNICKE
    written = np.zeros_like(editable)
    output = id_map.copy()

    for index in np.flatnonzero(touched[triangles].any(axis=1)):
        corners = triangles[index]
        label = int(np.bincount(labels[corners]).argmax())
        pu = uv[corners, 0] * (width - 1)
        # flipY is false on this texture, so image row 0 is v=0.
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
        patch = (
            (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1) & editable[y0:y1, x0:x1]
        )
        if not patch.any():
            continue
        output[y0:y1, x0:x1][patch] = label
        written[y0:y1, x0:x1][patch] = True

    stale = editable & ~written
    if stale.any():
        queue = deque(zip(*np.nonzero(written)))
        seen = written.copy()
        while queue:
            y, x = queue.popleft()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if (
                    0 <= ny < height
                    and 0 <= nx < width
                    and editable[ny, nx]
                    and not seen[ny, nx]
                ):
                    seen[ny, nx] = True
                    output[ny, nx] = output[y, x]
                    queue.append((ny, nx))
    return smooth_texture_labels(output, editable), int(np.count_nonzero(stale))


def recut():
    """The proposed labels, without writing anything."""
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

    fit, line, cells, size = drawn_cells()
    posterior = posterior_side(cells, line, size)
    projection = json.loads(REFERENCE.with_suffix(".json").read_text())
    px, py = project(positions, projection)

    # Only the master's Wernicke's may move, and only into the gyrus.
    territory = labels == WERNICKE
    updated = labels.copy()
    updated[territory & ~posterior[py, px]] = GYRUS

    vertex_to_welded, _, adjacency = build_welded_surface_graph(
        positions, triangles
    )
    neighbours = [np.fromiter(peers, dtype=np.int64) for peers in adjacency]
    welded_labels = np.zeros(len(adjacency), dtype=np.int64)
    welded_labels[vertex_to_welded] = updated
    movable = np.zeros(len(adjacency), dtype=bool)
    movable[vertex_to_welded] = territory
    welded_labels = smooth_within(welded_labels, movable, neighbours)
    for region in TERRITORY:
        patch = (welded_labels == region) & movable
        if patch.any():
            welded_labels[patch & ~largest_component(patch, neighbours)] = (
                GYRUS if region == WERNICKE else WERNICKE
            )
    updated = welded_labels[vertex_to_welded]
    updated[~territory] = labels[~territory]
    return {
        "document": document,
        "binary": binary,
        "uv3": uv3,
        "triangles": triangles,
        "labels": labels,
        "updated": updated,
        "territory": territory,
        "fit": fit,
    }


def main():
    dry_run = "--apply" not in sys.argv
    state = recut()
    labels, updated = state["labels"], state["updated"]
    territory = state["territory"]

    report = {
        "markupFit": state["fit"],
        "before": {
            int(r): int(np.count_nonzero(labels == r)) for r in TERRITORY
        },
        "after": {
            int(r): int(np.count_nonzero(updated == r)) for r in TERRITORY
        },
        "changedVertices": int(np.count_nonzero(updated != labels)),
        "outsideTerritoryChanged": int(
            np.count_nonzero((updated != labels) & ~territory)
        ),
        "applied": not dry_run,
    }

    if not dry_run:
        id_map = np.array(Image.open(ID_MAP_PATH))
        new_map, stale = rasterize_patch(
            id_map, state["uv3"], state["triangles"], updated, territory
        )
        report["textureTexelsChanged"] = int(
            np.count_nonzero(new_map != id_map)
        )
        report["textureTexelsFilledByNearest"] = stale
        report["textureOutsidePatchChanged"] = int(
            np.count_nonzero((new_map != id_map) & (id_map != WERNICKE))
        )
        Image.fromarray(new_map).save(ID_MAP_PATH)
        write_glb(
            MODEL_PATH,
            state["document"],
            write_color1(state["document"], state["binary"], updated),
        )

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
