"""Build the renderer's region identity data from the painted master.

The id texture is the visual authority, but its charts abut without a gutter, so
a lookup within half a texel of a chart border can read unrelated cortex and
show as an isolated colour fleck. Each triangle therefore carries the label set
of its own one-hop surface neighbourhood, taken straight from COLOR_1, and the
shader will not display a region outside that set.

This replaces the old derived atlas: labels are now read from the artist's
paint rather than inferred from mask imagery.
"""

import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas_uv import (  # noqa: E402
    build_welded_surface_graph,
    read_accessor,
    read_glb,
    triangle_region_candidates,
)

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "public/brain.glb"
OUTPUT_PATH = ROOT / "public/maps/brain_vertex_regions.bin"
REPORT_PATH = ROOT / "public/maps/brain_region_identity.json"


def main():
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
    vertex_labels = colour1[:, 0].astype(np.uint8)
    if vertex_labels.max() > 20 or vertex_labels.min() < 1:
        raise SystemExit(
            f"COLOR_1 region ids out of range: "
            f"{vertex_labels.min()}..{vertex_labels.max()}"
        )

    vertex_to_welded, _, _ = build_welded_surface_graph(positions, triangles)
    candidates = triangle_region_candidates(
        vertex_labels, vertex_to_welded, triangles
    )

    OUTPUT_PATH.write_bytes(
        len(vertex_labels).to_bytes(4, "little")
        + vertex_labels.tobytes()
        + len(triangles).to_bytes(4, "little")
        + candidates.tobytes()
    )

    per_triangle = np.count_nonzero(candidates, axis=1)
    report = {
        "source": "public/brain.glb COLOR_1 (painted master v17)",
        "vertexCount": int(len(vertex_labels)),
        "triangleCount": int(len(triangles)),
        "regions": sorted(int(value) for value in np.unique(vertex_labels)),
        "maxCandidatesPerTriangle": int(per_triangle.max()),
        "interiorTriangles": int(np.count_nonzero(per_triangle == 1)),
        "boundaryTriangles": int(np.count_nonzero(per_triangle > 1)),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
