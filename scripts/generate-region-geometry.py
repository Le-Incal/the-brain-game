"""Derive region geometry from the painted master model.

`src/data/brainRegions.json` is the artist's authored handoff and is never
edited. The renderer still needs two things it does not carry: where each region
sits in model space (annotation anchors) and which regions are actually worth
labelling from each canonical view. Both are measured here from COLOR_1, the
authoritative per-vertex paint, so they can never drift from the artwork.
"""

import json
from pathlib import Path

import numpy as np

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas_uv import read_glb, read_accessor  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "public/brain.glb"
REGIONS_PATH = ROOT / "src/data/brainRegions.json"
OUTPUT_PATH = ROOT / "src/data/regionGeometry.json"

# Camera directions matching getAtlasViewForDirection in brainScene.js:
# anatomical left = +x, superior = +y, anterior = +z.
CANONICAL_VIEWS = {
    "left_lateral": (1.0, 0.0, 0.0),
    "right_lateral": (-1.0, 0.0, 0.0),
    "anterior": (0.0, 0.0, 1.0),
    "posterior": (0.0, 0.0, -1.0),
    "superior": (0.0, 1.0, 0.0),
    "inferior": (0.0, -1.0, 0.0),
}
RASTER_SIZE = 512
# A label earns its place only when the region holds a readable share of the
# silhouette. Below this it is a sliver and the leader line has nowhere to land.
MIN_VISIBLE_FRACTION = 0.006
MAX_LABELS_PER_VIEW = 10


def read_painted_model():
    document, binary = read_glb(str(MODEL_PATH))
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    positions = read_accessor(document, binary, attributes["POSITION"]).astype(
        np.float64
    )
    colour1 = read_accessor(document, binary, attributes["COLOR_1"])
    triangles = read_accessor(document, binary, primitive["indices"]).reshape(
        -1, 3
    )
    region_ids = colour1[:, 0].astype(np.int32)
    division_ids = colour1[:, 1].astype(np.int32)
    return positions, triangles, region_ids, division_ids


def visible_region_pixels(positions, triangles, labels, direction, size):
    """Z-buffered label raster of the surface as seen from one direction."""
    view = np.array(direction, dtype=np.float64)
    view /= np.linalg.norm(view)
    up = np.array([0.0, 1.0, 0.0])
    if abs(view[1]) > 0.9:
        up = np.array([0.0, 0.0, 1.0])
    right = np.cross(up, view)
    right /= np.linalg.norm(right)
    up = np.cross(view, right)

    centre = positions.mean(axis=0)
    local = positions - centre
    extent = np.abs(local).max()
    screen_x = (local @ right) / extent * 0.5 + 0.5
    screen_y = 0.5 - (local @ up) / extent * 0.5
    depth = local @ view
    px = screen_x * (size - 1)
    py = screen_y * (size - 1)

    normals = np.cross(
        positions[triangles[:, 1]] - positions[triangles[:, 0]],
        positions[triangles[:, 2]] - positions[triangles[:, 0]],
    )
    facing = np.flatnonzero(normals @ view > 0)

    buffer = np.zeros((size, size), dtype=np.int32)
    zbuffer = np.full((size, size), -np.inf)
    for index in facing:
        a, b, c = triangles[index]
        xs = px[[a, b, c]]
        ys = py[[a, b, c]]
        x0 = max(int(np.floor(xs.min())), 0)
        x1 = min(int(np.ceil(xs.max())) + 1, size)
        y0 = max(int(np.floor(ys.min())), 0)
        y1 = min(int(np.ceil(ys.max())) + 1, size)
        if x1 <= x0 or y1 <= y0:
            continue
        grid_x, grid_y = np.meshgrid(
            np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5
        )
        edge_x1 = xs[1] - xs[0]
        edge_y1 = ys[1] - ys[0]
        edge_x2 = xs[2] - xs[0]
        edge_y2 = ys[2] - ys[0]
        determinant = edge_x1 * edge_y2 - edge_x2 * edge_y1
        if abs(determinant) < 1e-12:
            continue
        offset_x = grid_x - xs[0]
        offset_y = grid_y - ys[0]
        weight1 = (offset_x * edge_y2 - offset_y * edge_x2) / determinant
        weight2 = (offset_y * edge_x1 - offset_x * edge_y1) / determinant
        weight0 = 1.0 - weight1 - weight2
        inside = (weight0 >= 0) & (weight1 >= 0) & (weight2 >= 0)
        if not inside.any():
            continue
        pixel_depth = (
            weight0 * depth[a] + weight1 * depth[b] + weight2 * depth[c]
        )
        window = zbuffer[y0:y1, x0:x1]
        winners = inside & (pixel_depth > window)
        if not winners.any():
            continue
        # Majority label of the triangle keeps thin boundary triangles from
        # claiming a view they barely touch.
        counts = np.bincount(labels[[a, b, c]])
        buffer[y0:y1, x0:x1][winners] = int(counts.argmax())
        window[winners] = pixel_depth[winners]

    return buffer


def main():
    atlas = json.loads(REGIONS_PATH.read_text())
    positions, triangles, region_ids, division_ids = read_painted_model()
    declared = {region["id"] for region in atlas["regions"]}
    painted = {int(value) for value in np.unique(region_ids)}
    if painted - declared:
        raise ValueError(
            f"Model paints regions absent from brainRegions.json: "
            f"{sorted(painted - declared)}"
        )

    geometry = {}
    for region in atlas["regions"]:
        region_id = region["id"]
        members = region_ids == region_id
        count = int(np.count_nonzero(members))
        if not count:
            raise ValueError(f"Region {region_id} has no painted vertices")
        points = positions[members]
        centroid = points.mean(axis=0)
        # The centroid of a folded sheet can sit inside the tissue, so the
        # annotation anchors on the painted vertex nearest to it.
        anchor = points[
            np.argmin(((points - centroid) ** 2).sum(axis=1))
        ]
        divisions = division_ids[members]
        geometry[str(region_id)] = {
            "vertexCount": count,
            "centroid": [round(float(value), 4) for value in centroid],
            "anchor": [round(float(value), 4) for value in anchor],
            "divisionId": int(np.bincount(divisions).argmax()),
            "meanX": round(float(points[:, 0].mean()), 4),
        }

    labels_per_view = {}
    for view, direction in CANONICAL_VIEWS.items():
        raster = visible_region_pixels(
            positions, triangles, region_ids, direction, RASTER_SIZE
        )
        visible = np.count_nonzero(raster)
        counts = np.bincount(raster.reshape(-1), minlength=21)
        ranked = sorted(
            (
                (int(count), region_id)
                for region_id, count in enumerate(counts)
                if region_id and count / max(visible, 1) >= MIN_VISIBLE_FRACTION
            ),
            reverse=True,
        )
        labels_per_view[view] = [
            {
                "id": region_id,
                "name": next(
                    r["name"] for r in atlas["regions"] if r["id"] == region_id
                ),
                "visibleFraction": round(count / max(visible, 1), 4),
            }
            for count, region_id in ranked[:MAX_LABELS_PER_VIEW]
        ]

    payload = {
        "source": "public/brain.glb COLOR_1 (painted master v17)",
        "note": (
            "Generated by scripts/generate-region-geometry.py. "
            "brainRegions.json is the artist handoff and is never edited."
        ),
        "regions": geometry,
        "labelsPerView": labels_per_view,
    }
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        json.dumps(
            {
                "regions": len(geometry),
                "paintedRegions": sorted(painted),
                "labelsPerView": {
                    view: [entry["id"] for entry in entries]
                    for view, entries in labels_per_view.items()
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
