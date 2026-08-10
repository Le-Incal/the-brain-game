"""Render a labelled view of the painted regions for visual review.

Used to show where a region actually sits on the surface, so a placement
question can be settled against the model rather than from memory.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas_uv import read_accessor, read_glb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SIZE = 1400


def render(
    theta_degrees,
    highlight,
    out_path,
    overrides=None,
    phi_degrees=79.2,
    labels=None,
):
    atlas = json.loads((ROOT / "src/data/brainRegions.json").read_text())
    palette = {
        r["id"]: np.array(
            [int(r["hex"][i : i + 2], 16) for i in (1, 3, 5)], dtype=float
        )
        for r in atlas["regions"]
    }
    # Neighbouring regions can share a hue in the published palette, which is
    # fine on screen but useless when the question is where the border runs.
    for region_id, hex_code in (overrides or {}).items():
        palette[int(region_id)] = np.array(
            [int(hex_code[i : i + 2], 16) for i in (1, 3, 5)], dtype=float
        )
    document, binary = read_glb(str(ROOT / "public/brain.glb"))
    primitive = document["meshes"][0]["primitives"][0]
    positions = read_accessor(
        document, binary, primitive["attributes"]["POSITION"]
    ).astype(np.float64)
    # A proposed recut can be previewed before it is written to the master.
    if labels is None:
        labels = read_accessor(
            document, binary, primitive["attributes"]["COLOR_1"]
        )[:, 0].astype(np.int32)
    labels = np.asarray(labels, dtype=np.int32)
    triangles = read_accessor(document, binary, primitive["indices"]).reshape(
        -1, 3
    )

    phi = np.radians(phi_degrees)
    theta = np.radians(theta_degrees)
    view = np.array(
        [np.sin(phi) * np.sin(theta), np.cos(phi), np.sin(phi) * np.cos(theta)]
    )
    view /= np.linalg.norm(view)
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(up, view)
    right /= np.linalg.norm(right)
    up = np.cross(view, right)

    centre = positions.mean(axis=0)
    local = positions - centre
    extent = np.abs(local).max()
    px = ((local @ right) / extent * 0.5 + 0.5) * (SIZE - 1)
    py = (0.5 - (local @ up) / extent * 0.5) * (SIZE - 1)
    depth = local @ view

    normals = np.cross(
        positions[triangles[:, 1]] - positions[triangles[:, 0]],
        positions[triangles[:, 2]] - positions[triangles[:, 0]],
    )
    facing = np.flatnonzero(normals @ view > 0)
    lengths = np.linalg.norm(normals, axis=1)
    unit_normals = normals / np.maximum(lengths, 1e-12)[:, None]
    light = view + up * 0.45 + right * 0.35
    light /= np.linalg.norm(light)
    lambert = np.clip(unit_normals @ light, 0.0, 1.0)

    buffer = np.zeros((SIZE, SIZE), dtype=np.int32)
    shading = np.zeros((SIZE, SIZE))
    zbuffer = np.full((SIZE, SIZE), -np.inf)
    for index in facing:
        a, b, c = triangles[index]
        xs, ys = px[[a, b, c]], py[[a, b, c]]
        x0, x1 = max(int(xs.min()), 0), min(int(xs.max()) + 1, SIZE)
        y0, y1 = max(int(ys.min()), 0), min(int(ys.max()) + 1, SIZE)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        e1x, e1y = xs[1] - xs[0], ys[1] - ys[0]
        e2x, e2y = xs[2] - xs[0], ys[2] - ys[0]
        det = e1x * e2y - e2x * e1y
        if abs(det) < 1e-12:
            continue
        ox, oy = gx - xs[0], gy - ys[0]
        w1 = (ox * e2y - oy * e2x) / det
        w2 = (oy * e1x - ox * e1y) / det
        w0 = 1 - w1 - w2
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        d = w0 * depth[a] + w1 * depth[b] + w2 * depth[c]
        window = zbuffer[y0:y1, x0:x1]
        win = inside & (d > window)
        if not win.any():
            continue
        buffer[y0:y1, x0:x1][win] = int(np.bincount(labels[[a, b, c]]).argmax())
        shading[y0:y1, x0:x1][win] = lambert[index]
        window[win] = d[win]

    canvas = np.full((SIZE, SIZE, 3), 244.0)
    surface = buffer > 0
    canvas[surface] = 214.0
    for region_id in np.unique(buffer):
        if region_id <= 0:
            continue
        mask = buffer == region_id
        if region_id in highlight:
            canvas[mask] = palette[region_id]
        else:
            canvas[mask] = 214.0 + (palette[region_id] - 214.0) * 0.14
    # Flat colour hides the folds, and the folds are the landmarks anyone needs
    # to place a boundary by eye, so the fill carries a shading term.
    shade = np.clip(0.55 + 0.45 * shading, 0.0, 1.25)[..., None]
    canvas[surface] = np.clip(canvas[surface] * shade[surface], 0, 255)
    Image.fromarray(canvas.astype(np.uint8)).save(out_path)
    # The projection is written alongside the image so a line drawn on this
    # render can be mapped back onto the surface exactly, with no camera to
    # guess at.
    Path(out_path).with_suffix(".json").write_text(
        json.dumps(
            {
                "projection": "orthographic",
                "size": SIZE,
                "thetaDegrees": theta_degrees,
                "phiDegrees": phi_degrees,
                "view": view.tolist(),
                "right": right.tolist(),
                "up": up.tolist(),
                "centre": centre.tolist(),
                "extent": float(extent),
                "model": "public/brain.glb",
            },
            indent=2,
        )
        + "\n"
    )
    counts = {int(r): int(np.count_nonzero(buffer == r)) for r in highlight}
    # The per-pixel region buffer lets a mark drawn on this image be read back
    # as the regions it actually covers.
    np.save(Path(out_path).with_suffix(".npy"), buffer)
    return counts


if __name__ == "__main__":
    theta = float(sys.argv[1])
    highlight = [int(v) for v in sys.argv[2].split(",")]
    out = sys.argv[3]
    overrides = json.loads(sys.argv[4]) if len(sys.argv) > 4 else None
    phi = float(sys.argv[5]) if len(sys.argv) > 5 else 79.2
    print(json.dumps(render(theta, highlight, out, overrides, phi), indent=2))
