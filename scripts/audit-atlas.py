"""Audit the painted atlas against the authoritative handoff.

The painted master is the source of truth: COLOR_1 carries the artist's region
and division paint, and brain_region_ids_4096.png is the visual authority the
shader samples on TEXCOORD_3. Nothing here is derived or inferred; this checks
that the model, the texture, the identity data and the taxonomy all agree, and
that the surface the player sees can never show a region it does not touch.
"""

import json
from collections import deque
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas_uv import (  # noqa: E402
    build_welded_surface_graph,
    read_accessor,
    read_glb,
)

ROOT = Path(__file__).resolve().parent.parent
ATLAS_PATH = ROOT / "src/data/brainRegions.json"
GEOMETRY_PATH = ROOT / "src/data/regionGeometry.json"
GLB_PATH = ROOT / "public/brain.glb"
ID_MASK_PATH = ROOT / "public/maps/brain_region_ids_4096.png"
IDENTITY_PATH = ROOT / "public/maps/brain_vertex_regions.bin"
TRIANGLE_CANDIDATE_SLOTS = 4
# The smallest genuine patch in the painted master is Broca's area at 291
# vertices; anything this small is paint noise, not anatomy.
STRANDED_PATCH_VERTICES = 48
# uv3 is the id texture's own unwrap.
ID_UV_ATTRIBUTE = "TEXCOORD_3"


def barycentric_sample_weights(steps=4):
    """Interior sample points of a triangle, mirroring rasterised fragments."""
    weights = []
    for i in range(1, steps):
        for j in range(1, steps - i):
            weights.append((i / steps, j / steps, 1 - i / steps - j / steps))
    return np.array(weights, dtype=np.float64)


def read_model():
    document, binary = read_glb(str(GLB_PATH))
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    return {
        "positions": read_accessor(
            document, binary, attributes["POSITION"]
        ).astype(np.float64),
        "uv": read_accessor(
            document, binary, attributes[ID_UV_ATTRIBUTE]
        ).astype(np.float64),
        "colour1": read_accessor(document, binary, attributes["COLOR_1"]),
        "triangles": read_accessor(
            document, binary, primitive["indices"]
        ).reshape(-1, 3),
        "attributeNames": sorted(attributes),
    }


def read_identity(vertex_count, triangle_count):
    raw = IDENTITY_PATH.read_bytes()
    declared_vertices = int.from_bytes(raw[:4], "little")
    labels = np.frombuffer(raw[4 : 4 + declared_vertices], dtype=np.uint8)
    offset = 4 + declared_vertices
    declared_triangles = int.from_bytes(raw[offset : offset + 4], "little")
    candidates = np.frombuffer(
        raw[offset + 4 :], dtype=np.uint8
    ).reshape(-1, TRIANGLE_CANDIDATE_SLOTS)
    return {
        "labels": labels,
        "candidates": candidates,
        "declaredVertexCount": declared_vertices,
        "declaredTriangleCount": declared_triangles,
        "vertexCountMatches": declared_vertices == vertex_count,
        "triangleCountMatches": declared_triangles == triangle_count
        and len(candidates) == triangle_count,
    }


def audit_paint(model, by_id):
    """COLOR_1 must name only declared regions, in their declared divisions."""
    region_ids = model["colour1"][:, 0].astype(np.int32)
    division_ids = model["colour1"][:, 1].astype(np.int32)
    declared = set(by_id)
    painted = {int(value) for value in np.unique(region_ids)}

    mismatched = 0
    for region_id in painted & declared:
        members = region_ids == region_id
        expected = by_id[region_id]["divisionId"]
        mismatched += int(np.count_nonzero(division_ids[members] != expected))

    unpainted = sorted(declared - painted)
    return {
        "paintedRegions": sorted(painted),
        "undeclaredRegions": sorted(painted - declared),
        "unpaintedRegions": unpainted,
        "divisionMismatches": mismatched,
        "unpaintedVertices": int(np.count_nonzero(region_ids == 0)),
    }


def audit_lateralization(model, atlas):
    """Regions 6 and 13 are painted on the anatomical left only (+x)."""
    region_ids = model["colour1"][:, 0].astype(np.int32)
    x = model["positions"][:, 0]
    report = {}
    for region_id in atlas["gameplayNotes"]["lateralized"]:
        members = region_ids == region_id
        report[str(region_id)] = {
            "vertices": int(np.count_nonzero(members)),
            "wrongHemisphereVertices": int(np.count_nonzero(x[members] <= 0)),
            "meanX": round(float(x[members].mean()), 4),
        }
    return report


def audit_patches(model):
    """How many separate pieces of cortex each region occupies.

    A region is anatomy, so it is one patch, or two where it appears in both
    hemispheres. A handful of vertices stranded inside a neighbour is paint
    noise, and the renderer will happily show it as a speck of colour miles
    from the region it names, or as a pinhole inside it.
    """
    labels = model["colour1"][:, 0].astype(np.int64)
    vertex_to_welded, _, adjacency = build_welded_surface_graph(
        model["positions"], model["triangles"]
    )
    welded = np.zeros(len(adjacency), dtype=np.int64)
    welded[vertex_to_welded] = labels

    report = {}
    seen = np.zeros(len(adjacency), dtype=bool)
    for start in range(len(adjacency)):
        if seen[start]:
            continue
        label = welded[start]
        queue, size = deque([start]), 0
        seen[start] = True
        while queue:
            vertex = queue.popleft()
            size += 1
            for peer in adjacency[vertex]:
                if not seen[peer] and welded[peer] == label:
                    seen[peer] = True
                    queue.append(peer)
        report.setdefault(str(int(label)), []).append(size)
    for sizes in report.values():
        sizes.sort(reverse=True)
    return report


def audit_id_texture(model, id_mask, by_id):
    """The texture must speak the same vocabulary as the taxonomy."""
    values = {int(value) for value in np.unique(id_mask)}
    on_surface = values - {0}
    return {
        "size": list(id_mask.shape[::-1]),
        "regions": sorted(on_surface),
        "undeclaredValues": sorted(on_surface - set(by_id)),
        "missingRegions": sorted(set(by_id) - on_surface),
        "gutterFraction": round(
            float(np.count_nonzero(id_mask == 0) / id_mask.size), 4
        ),
    }


def audit_fragment_resolution(model, identity, id_mask):
    """What the surface can actually display, fragment by fragment.

    The atlas packs charts without a gutter, so a texture lookup within half a
    texel of a chart border can read unrelated cortex. The renderer rejects any
    id its own triangle does not touch, so this reports the raw texture defect
    and, separately, what survives to the screen.
    """
    height, width = id_mask.shape
    triangles = model["triangles"]
    uv = model["uv"]
    labels = identity["labels"].astype(np.int32)
    candidates = identity["candidates"].astype(np.int32)

    allowed = np.zeros((len(triangles), 256), dtype=bool)
    rows = np.repeat(np.arange(len(triangles)), TRIANGLE_CANDIDATE_SLOTS)
    allowed[rows, candidates.reshape(-1)] = True
    allowed[:, 0] = False

    weights = barycentric_sample_weights()
    totals = {
        "samples": 0,
        "unlabeled": 0,
        "textureForeign": 0,
        "effectiveForeign": 0,
        "insideRegionDisagreements": 0,
    }
    corner_uv = uv[triangles]
    corner_labels = labels[triangles]
    # Where a triangle's three corners name one region there is no border to
    # argue about, so anything else the texture says there is a defect the
    # shader will faithfully draw: a pinhole inside the region, or a speck of it
    # stranded outside.
    unanimous = (corner_labels[:, 0] == corner_labels[:, 1]) & (
        corner_labels[:, 1] == corner_labels[:, 2]
    )
    for weight in weights:
        point = (
            corner_uv[:, 0] * weight[0]
            + corner_uv[:, 1] * weight[1]
            + corner_uv[:, 2] * weight[2]
        )
        # Sampling matches the renderer: NEAREST, and flipY=false means image
        # row 0 is v=0, so the row index is not inverted.
        px = np.clip((point[:, 0] * width).astype(np.int64), 0, width - 1)
        py = np.clip((point[:, 1] * height).astype(np.int64), 0, height - 1)
        sampled = id_mask[py, px].astype(np.int32)

        permitted = allowed[np.arange(len(triangles)), sampled]
        # The shader falls back to the nearest corner label it may show.
        nearest = corner_labels[np.arange(len(triangles)), weight.argmax()]
        effective = np.where(permitted & (sampled > 0), sampled, nearest)

        totals["samples"] += int(len(triangles))
        totals["unlabeled"] += int(np.count_nonzero(sampled == 0))
        totals["textureForeign"] += int(
            np.count_nonzero(
                ~allowed[np.arange(len(triangles)), sampled] & (sampled > 0)
            )
        )
        totals["effectiveForeign"] += int(
            np.count_nonzero(
                ~allowed[np.arange(len(triangles)), effective]
            )
        )
        totals["insideRegionDisagreements"] += int(
            np.count_nonzero(unanimous & (sampled != corner_labels[:, 0]))
        )
    return totals


def main():
    atlas = json.loads(ATLAS_PATH.read_text())
    geometry = json.loads(GEOMETRY_PATH.read_text())
    by_id = {region["id"]: region for region in atlas["regions"]}
    model = read_model()
    id_mask = np.array(Image.open(ID_MASK_PATH).convert("L"))
    identity = read_identity(len(model["positions"]), len(model["triangles"]))

    report = {
        "model": {
            "vertexCount": int(len(model["positions"])),
            "triangleCount": int(len(model["triangles"])),
            "attributes": model["attributeNames"],
            "idUvAttribute": ID_UV_ATTRIBUTE,
        },
        "paint": audit_paint(model, by_id),
        "patches": audit_patches(model),
        "lateralization": audit_lateralization(model, atlas),
        "idTexture": audit_id_texture(model, id_mask, by_id),
        "identity": {
            "declaredVertexCount": identity["declaredVertexCount"],
            "declaredTriangleCount": identity["declaredTriangleCount"],
            "vertexCountMatches": identity["vertexCountMatches"],
            "triangleCountMatches": identity["triangleCountMatches"],
            "maxCandidatesPerTriangle": int(
                np.count_nonzero(identity["candidates"], axis=1).max()
            ),
        },
        "fragments": audit_fragment_resolution(model, identity, id_mask),
        "geometry": {
            "regions": len(geometry["regions"]),
            "views": sorted(geometry["labelsPerView"]),
        },
    }

    errors = []
    paint = report["paint"]
    if paint["undeclaredRegions"]:
        errors.append(f"COLOR_1 paints undeclared {paint['undeclaredRegions']}")
    if paint["unpaintedRegions"]:
        errors.append(f"declared but unpainted {paint['unpaintedRegions']}")
    if paint["unpaintedVertices"]:
        errors.append(f"{paint['unpaintedVertices']} vertices carry no region")
    if paint["divisionMismatches"]:
        errors.append(
            f"{paint['divisionMismatches']} vertices disagree on division"
        )
    for region_id, sizes in report["patches"].items():
        stranded = [size for size in sizes if size <= STRANDED_PATCH_VERTICES]
        if stranded:
            errors.append(
                f"region {region_id} leaves {len(stranded)} stranded "
                f"patches of {stranded} vertices"
            )
    for region_id, entry in report["lateralization"].items():
        if entry["wrongHemisphereVertices"]:
            errors.append(
                f"region {region_id} has {entry['wrongHemisphereVertices']} "
                "vertices off its hemisphere"
            )
    texture = report["idTexture"]
    if texture["undeclaredValues"]:
        errors.append(f"id texture uses undeclared {texture['undeclaredValues']}")
    if texture["missingRegions"]:
        errors.append(f"id texture omits {texture['missingRegions']}")
    if not identity["vertexCountMatches"] or not identity["triangleCountMatches"]:
        errors.append("identity data does not match the mesh")
    if report["identity"]["maxCandidatesPerTriangle"] > TRIANGLE_CANDIDATE_SLOTS:
        errors.append("a triangle needs more candidate slots than the shader has")
    if report["fragments"]["insideRegionDisagreements"]:
        errors.append(
            f"{report['fragments']['insideRegionDisagreements']} fragments "
            "inside a region show a different one; run reconcile-id-texture"
        )
    if report["fragments"]["effectiveForeign"]:
        errors.append(
            f"{report['fragments']['effectiveForeign']} fragments would display "
            "a region their triangle does not touch"
        )

    report["errors"] = errors
    print(json.dumps(report, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
