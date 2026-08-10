"""Shared deterministic GLB UV rasterization and atlas-ID generation helpers."""

from collections import deque
from collections import Counter
import heapq
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


COMPONENT_DTYPES = {
    5120: np.dtype("<i1"),
    5121: np.dtype("<u1"),
    5122: np.dtype("<i2"),
    5123: np.dtype("<u2"),
    5125: np.dtype("<u4"),
    5126: np.dtype("<f4"),
}
TYPE_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
}


def read_glb(path):
    data = Path(path).read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length].decode().rstrip("\0 "))
    binary_offset = 20 + json_length
    binary_length, chunk_type = struct.unpack_from("<II", data, binary_offset)
    if chunk_type != 0x004E4942:
        raise ValueError("Second GLB chunk is not BIN")
    binary = data[binary_offset + 8 : binary_offset + 8 + binary_length]
    return document, binary


def read_accessor(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    if "sparse" in accessor:
        raise ValueError("Sparse GLB accessors are not supported")
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = COMPONENT_DTYPES[accessor["componentType"]]
    components = TYPE_COMPONENTS[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    packed_stride = dtype.itemsize * components
    stride = view.get("byteStride", packed_stride)
    values = np.ndarray(
        shape=(accessor["count"], components),
        dtype=dtype,
        buffer=binary,
        offset=offset,
        strides=(stride, dtype.itemsize),
    )
    return values.copy()


def rasterize_uv_coverage(document, binary, size, supersample=4):
    width, height = size
    raster_width = width * supersample
    raster_height = height * supersample
    coverage_image = Image.new("1", (raster_width, raster_height), 0)
    draw = ImageDraw.Draw(coverage_image)

    for mesh in document["meshes"]:
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Atlas coverage requires triangle primitives")
            uv = read_accessor(
                document, binary, primitive["attributes"]["TEXCOORD_0"]
            )
            if "indices" in primitive:
                indices = read_accessor(
                    document, binary, primitive["indices"]
                ).reshape(-1)
            else:
                indices = np.arange(len(uv), dtype=np.uint32)
            if len(indices) % 3:
                raise ValueError("Triangle index count is not divisible by three")

            triangles = indices.reshape(-1, 3)
            for triangle in triangles:
                points = [
                    (
                        min(
                            raster_width - 1,
                            max(0, float(uv[index, 0]) * raster_width),
                        ),
                        min(
                            raster_height - 1,
                            max(0, float(uv[index, 1]) * raster_height),
                        ),
                    )
                    for index in triangle
                ]
                draw.polygon(points, fill=1)

    high_resolution = np.asarray(coverage_image, dtype=bool)
    return high_resolution.reshape(
        height, supersample, width, supersample
    ).any(axis=(1, 3))


def canonical_seed_ids(color_mask, regions, max_distance=10.0):
    """Map lightly antialiased/compressed source colours to canonical IDs.

    The two closest canonical swatches are just over 21 sRGB units apart, so a
    radius of 10 accepts rendering noise without making those categories
    overlap. Dark UV gutters and pixels outside that radius remain unseeded.
    """
    palette = np.asarray([region["rgb"] for region in regions], dtype=np.int32)
    region_ids = np.asarray([region["id"] for region in regions], dtype=np.uint8)
    pixels = color_mask.astype(np.int32)
    distances = np.sum(
        (pixels[:, :, None, :] - palette[None, None, :, :]) ** 2,
        axis=3,
        dtype=np.int32,
    )
    nearest_index = np.argmin(distances, axis=2)
    nearest_distance = np.take_along_axis(
        distances, nearest_index[:, :, None], axis=2
    )[:, :, 0]
    seed_ids = region_ids[nearest_index]
    accepted = (
        (nearest_distance <= max_distance * max_distance)
        & (np.max(color_mask, axis=2) >= 32)
    )
    return np.where(accepted, seed_ids, 0).astype(np.uint8)


def read_surface_mesh(document, binary):
    """Read the single indexed atlas surface used by the production brain."""
    primitives = [
        primitive
        for mesh in document["meshes"]
        for primitive in mesh["primitives"]
    ]
    if len(primitives) != 1:
        raise ValueError(
            f"Surface atlas generation expects one primitive, found {len(primitives)}"
        )
    primitive = primitives[0]
    if primitive.get("mode", 4) != 4 or "indices" not in primitive:
        raise ValueError("Surface atlas generation requires indexed triangles")
    attributes = primitive["attributes"]
    positions = read_accessor(document, binary, attributes["POSITION"]).astype(
        np.float64
    )
    uv = read_accessor(document, binary, attributes["TEXCOORD_0"]).astype(
        np.float64
    )
    indices = read_accessor(document, binary, primitive["indices"]).reshape(
        -1, 3
    )
    return positions, uv, indices


def build_welded_surface_graph(positions, triangles, precision=6):
    """Build mesh adjacency while reconnecting vertices duplicated at UV seams."""
    rounded = np.round(positions, precision)
    _, vertex_to_welded = np.unique(
        rounded, axis=0, return_inverse=True
    )
    welded_count = int(vertex_to_welded.max()) + 1
    sums = np.zeros((welded_count, 3), dtype=np.float64)
    counts = np.zeros(welded_count, dtype=np.int32)
    np.add.at(sums, vertex_to_welded, positions)
    np.add.at(counts, vertex_to_welded, 1)
    welded_positions = sums / counts[:, None]

    adjacency = [set() for _ in range(welded_count)]
    welded_triangles = vertex_to_welded[triangles]
    for a, b, c in welded_triangles:
        for left, right in ((a, b), (b, c), (c, a)):
            left = int(left)
            right = int(right)
            if left != right:
                adjacency[left].add(right)
                adjacency[right].add(left)
    return vertex_to_welded, welded_positions, adjacency


def sample_vertex_seed_ids(uv, seed_ids, triangles=None, radius=0):
    """Sample categorical seeds without crossing tightly packed UV charts.

    Sampling a square UV neighbourhood is unsafe: charts sit close together in
    the PNG, so a neighbouring texel can belong to unrelated cortex and import
    a label that later surfaces as a colour fleck. When triangles are supplied,
    extra samples are instead taken just inside each incident triangle. Those
    points are inside the vertex's own chart by construction, which recovers
    vertices whose exact UV lands on a black decorative fissure.
    """
    height, width = seed_ids.shape

    def lookup(points):
        xs = np.clip((points[:, 0] * width).astype(np.int64), 0, width - 1)
        ys = np.clip((points[:, 1] * height).astype(np.int64), 0, height - 1)
        return seed_ids[ys, xs]

    votes = np.zeros((len(uv), 256), dtype=np.uint16)

    def cast(targets, values):
        chosen = values > 0
        np.add.at(votes, (targets[chosen], values[chosen]), 1)

    if radius:
        xs = np.clip((uv[:, 0] * width).astype(np.int64), 0, width - 1)
        ys = np.clip((uv[:, 1] * height).astype(np.int64), 0, height - 1)
        sampled = np.zeros(len(uv), dtype=np.uint8)
        for index, (x, y) in enumerate(zip(xs, ys)):
            block = seed_ids[
                max(0, y - radius) : min(height, y + radius + 1),
                max(0, x - radius) : min(width, x + radius + 1),
            ]
            block = block[block > 0]
            if block.size:
                sampled[index] = Counter(block.tolist()).most_common(1)[0][0]
        return sampled

    all_vertices = np.arange(len(uv), dtype=np.int64)
    cast(all_vertices, lookup(uv))

    if triangles is not None:
        # Two sample depths per corner: the shallow one keeps the seed faithful
        # to the source colour right at a region boundary, the deeper one
        # recovers corners buried in a black fissure stroke.
        for own_weight in (0.94, 0.8):
            other = (1.0 - own_weight) * 0.5
            for corner in range(3):
                weights = np.full(3, other)
                weights[corner] = own_weight
                points = (
                    uv[triangles[:, 0]] * weights[0]
                    + uv[triangles[:, 1]] * weights[1]
                    + uv[triangles[:, 2]] * weights[2]
                )
                cast(triangles[:, corner].astype(np.int64), lookup(points))

    sampled = votes.argmax(axis=1).astype(np.uint8)
    sampled[votes.max(axis=1) == 0] = 0
    return sampled


def _remove_small_label_components(labels, adjacency, regions):
    """Drop isolated surface speckles without erasing bilateral regions."""
    cleaned = labels.copy()
    by_id = {int(region["id"]): region for region in regions}
    visited = np.zeros(len(labels), dtype=bool)
    for start in np.flatnonzero(labels):
        start = int(start)
        if visited[start]:
            continue
        region_id = int(labels[start])
        queue = deque([start])
        visited[start] = True
        component = []
        while queue:
            node = queue.popleft()
            component.append(node)
            for neighbour in adjacency[node]:
                if (
                    not visited[neighbour]
                    and int(labels[neighbour]) == region_id
                ):
                    visited[neighbour] = True
                    queue.append(neighbour)
        declared = int(by_id.get(region_id, {}).get("vertices", 0))
        minimum = max(8, int(round(declared * 0.004)))
        if len(component) < minimum:
            cleaned[component] = 0

    # Remove single-node and thin spur noise where the surrounding labelled
    # surface strongly agrees on a different category.
    for _ in range(2):
        previous = cleaned.copy()
        for node in np.flatnonzero(previous):
            neighbours = adjacency[int(node)]
            if len(neighbours) < 3:
                continue
            neighbour_labels = [
                int(previous[neighbour])
                for neighbour in neighbours
                if previous[neighbour] > 0
            ]
            if not neighbour_labels:
                continue
            own = int(previous[node])
            own_count = neighbour_labels.count(own)
            majority_id, majority_count = Counter(neighbour_labels).most_common(1)[0]
            if own_count <= 1 and majority_id != own and majority_count >= 3:
                cleaned[node] = 0
    return cleaned


def _propagate_surface_labels(labels, positions, adjacency):
    """Fill unlabeled vertices by weighted geodesic distance."""
    propagated = labels.copy()
    distances = np.full(len(propagated), np.inf, dtype=np.float64)
    queue = []
    for node in np.flatnonzero(propagated):
        node = int(node)
        distances[node] = 0.0
        heapq.heappush(queue, (0.0, int(propagated[node]), node))

    while queue:
        distance, region_id, node = heapq.heappop(queue)
        if distance > distances[node] or region_id != int(propagated[node]):
            continue
        for neighbour in adjacency[node]:
            edge_length = float(
                np.linalg.norm(positions[node] - positions[neighbour])
            )
            candidate = distance + edge_length
            if candidate + 1e-12 < distances[neighbour]:
                distances[neighbour] = candidate
                propagated[neighbour] = region_id
                heapq.heappush(queue, (candidate, region_id, neighbour))
            elif (
                abs(candidate - distances[neighbour]) <= 1e-12
                and region_id < int(propagated[neighbour])
            ):
                propagated[neighbour] = region_id
                heapq.heappush(queue, (candidate, region_id, neighbour))
    return propagated


def _smooth_surface_boundaries(labels, adjacency, iterations=3):
    """Apply graph-majority smoothing to categorical region boundaries."""
    smoothed = labels.copy()
    for _ in range(iterations):
        previous = smoothed.copy()
        for node, neighbours in enumerate(adjacency):
            if len(neighbours) < 3:
                continue
            neighbour_labels = [int(previous[value]) for value in neighbours]
            majority_id, majority_count = Counter(neighbour_labels).most_common(1)[0]
            own_id = int(previous[node])
            required = max(3, int(np.ceil(len(neighbours) * 0.67)))
            if (
                majority_id != own_id
                and majority_count >= required
            ):
                smoothed[node] = majority_id
    return smoothed


def _erode_to_surface_cores(labels, adjacency):
    """Remove boundary layers and narrow bridges before region regrowth."""
    cores = np.zeros_like(labels)
    for node, neighbours in enumerate(adjacency):
        if len(neighbours) < 3:
            continue
        region_id = int(labels[node])
        same_region = sum(
            int(labels[neighbour]) == region_id for neighbour in neighbours
        )
        required = max(3, int(np.ceil(len(neighbours) * 0.72)))
        if same_region >= required:
            cores[node] = region_id
    return cores


def _remove_surface_spikes(labels, adjacency, iterations=4):
    """Delete terminal one-vertex protrusions from every region boundary."""
    cleaned = labels.copy()
    for _ in range(iterations):
        previous = cleaned.copy()
        changes = 0
        for node, neighbours in enumerate(adjacency):
            if len(neighbours) < 3:
                continue
            own_id = int(previous[node])
            neighbour_labels = sorted(int(previous[value]) for value in neighbours)
            same = neighbour_labels.count(own_id)
            if same > 1:
                continue
            alternatives = Counter(
                value for value in neighbour_labels if value != own_id
            )
            if not alternatives:
                continue
            best_count = max(alternatives.values())
            if best_count < 2:
                continue
            replacement = min(
                region_id
                for region_id, count in alternatives.items()
                if count == best_count
            )
            cleaned[node] = replacement
            changes += 1
        if not changes:
            break
    return cleaned


def _constrain_regions_to_seed_support(
    labels, votes, positions, adjacency, regions, margin_fraction=0.04
):
    """Clip any region that propagated far outside its seeded anatomy.

    Geodesic filling can follow a hidden path around the mesh and deposit a
    small patch of, say, prefrontal cortex on posterior cortex. The source
    rendering never seeds a region there, so a seed-derived bounding box with a
    tolerance margin is a reliable, region-agnostic containment test.
    """
    constrained = labels.copy()
    extent = float(
        np.linalg.norm(positions.max(axis=0) - positions.min(axis=0))
    )
    margin = extent * margin_fraction
    dominant = votes.argmax(axis=1)
    seeded = votes.max(axis=1) > 0
    for region in regions:
        region_id = int(region["id"])
        seed_nodes = np.flatnonzero(seeded & (dominant == region_id))
        if not seed_nodes.size:
            continue
        seed_positions = positions[seed_nodes]
        lower = seed_positions.min(axis=0) - margin
        upper = seed_positions.max(axis=0) + margin
        outside = (
            (constrained == region_id)
            & (
                (positions < lower).any(axis=1)
                | (positions > upper).any(axis=1)
            )
        )
        if np.any(outside):
            constrained = _replace_forbidden_region_vertices(
                constrained, outside, positions, adjacency, region_id
            )
    return constrained


def _replace_forbidden_region_vertices(
    labels, forbidden, positions, adjacency, region_id
):
    """Reassign spatial outliers from the nearest valid neighbouring region."""
    result = labels.copy()
    distances = np.full(len(labels), np.inf, dtype=np.float64)
    queue = []
    for node in np.flatnonzero(forbidden):
        node = int(node)
        for neighbour in adjacency[node]:
            neighbour_id = int(labels[neighbour])
            if forbidden[neighbour] or neighbour_id == region_id:
                continue
            distance = float(
                np.linalg.norm(positions[node] - positions[neighbour])
            )
            candidate = (distance, neighbour_id, node)
            if candidate[:2] < (distances[node], int(result[node])):
                distances[node] = distance
                result[node] = neighbour_id
                heapq.heappush(queue, candidate)

    while queue:
        distance, replacement_id, node = heapq.heappop(queue)
        if (
            distance > distances[node]
            or replacement_id != int(result[node])
        ):
            continue
        for neighbour in adjacency[node]:
            if not forbidden[neighbour]:
                continue
            candidate_distance = distance + float(
                np.linalg.norm(positions[node] - positions[neighbour])
            )
            if candidate_distance + 1e-12 < distances[neighbour]:
                distances[neighbour] = candidate_distance
                result[neighbour] = replacement_id
                heapq.heappush(
                    queue,
                    (candidate_distance, replacement_id, neighbour),
                )
    if np.any(forbidden & (result == region_id)):
        raise ValueError("Could not reassign every spatial region outlier")
    return result


def _remove_detached_region_islands(labels, adjacency, regions):
    """Keep only legitimate hemisphere components for each categorical region."""
    cleaned = labels.copy()
    metadata = {int(region["id"]): region for region in regions}
    removed = 0
    for region_id in sorted(metadata):
        region_nodes = np.flatnonzero(labels == region_id)
        if not region_nodes.size:
            continue
        remaining = set(int(node) for node in region_nodes)
        components = []
        while remaining:
            start = remaining.pop()
            queue = [start]
            component = [start]
            while queue:
                node = queue.pop()
                for neighbour in adjacency[node]:
                    if neighbour in remaining and labels[neighbour] == region_id:
                        remaining.remove(neighbour)
                        queue.append(neighbour)
                        component.append(neighbour)
            components.append(component)
        components.sort(key=len, reverse=True)
        hemisphere = metadata[region_id].get("hemisphere")
        allowed_components = 2 if hemisphere == "bilateral" else 1
        for component in components[allowed_components:]:
            cleaned[component] = 0
            removed += len(component)
    return cleaned, removed


def label_surface_from_seeds(
    positions, uv, triangles, seed_ids, regions
):
    """Infer one categorical label per welded surface vertex.

    The propagation is geodesic over the GLB surface. It therefore crosses UV
    seams only where vertices share the same 3D position and can never jump
    through unrelated atlas islands merely because they are nearby in the PNG.
    """
    vertex_to_welded, welded_positions, adjacency = (
        build_welded_surface_graph(positions, triangles)
    )
    vertex_seeds = sample_vertex_seed_ids(uv, seed_ids, triangles=triangles)
    votes = np.zeros((len(welded_positions), 256), dtype=np.uint16)
    seeded_vertices = np.flatnonzero(vertex_seeds)
    np.add.at(
        votes,
        (vertex_to_welded[seeded_vertices], vertex_seeds[seeded_vertices]),
        1,
    )
    welded_labels = votes.argmax(axis=1).astype(np.uint8)
    welded_labels[votes.max(axis=1) == 0] = 0
    welded_labels = _remove_small_label_components(
        welded_labels, adjacency, regions
    )
    if not np.any(welded_labels):
        raise ValueError("The region mask produced no usable surface seeds")

    welded_labels = _propagate_surface_labels(
        welded_labels, welded_positions, adjacency
    )
    welded_labels = _smooth_surface_boundaries(
        welded_labels, adjacency, iterations=3
    )

    # Reconstruct the atlas from stable interior cores. Thin tendrils that
    # connect a remote colour speck to its main region disappear during this
    # erosion, allowing component cleanup to remove the detached core before
    # geodesic regrowth creates a new clean boundary.
    region_cores = _erode_to_surface_cores(welded_labels, adjacency)
    for region in regions:
        region_id = int(region["id"])
        if not np.any(region_cores == region_id):
            region_cores[welded_labels == region_id] = region_id
    region_cores, _ = _remove_detached_region_islands(
        region_cores, adjacency, regions
    )
    welded_labels = _propagate_surface_labels(
        region_cores, welded_positions, adjacency
    )
    welded_labels = _smooth_surface_boundaries(
        welded_labels, adjacency, iterations=2
    )

    for cleanup_pass in range(6):
        welded_labels, removed = _remove_detached_region_islands(
            welded_labels, adjacency, regions
        )
        if not removed:
            break
        welded_labels = _propagate_surface_labels(
            welded_labels, welded_positions, adjacency
        )
    else:
        _, remaining = _remove_detached_region_islands(
            welded_labels, adjacency, regions
        )
        if remaining:
            raise ValueError("Detached region islands did not converge")
    welded_labels = _remove_surface_spikes(welded_labels, adjacency)
    welded_labels, removed = _remove_detached_region_islands(
        welded_labels, adjacency, regions
    )
    if removed:
        welded_labels = _propagate_surface_labels(
            welded_labels, welded_positions, adjacency
        )
        welded_labels = _remove_surface_spikes(welded_labels, adjacency)

    welded_labels = _constrain_regions_to_seed_support(
        welded_labels, votes, welded_positions, adjacency, regions
    )
    welded_labels = _remove_surface_spikes(welded_labels, adjacency)

    if np.any(welded_labels == 0):
        raise ValueError("Some disconnected surface vertices have no region seed")
    return welded_labels[vertex_to_welded], vertex_to_welded


def rasterize_surface_labels(uv, triangles, vertex_labels, size):
    """Rasterize categorical vertex labels with boundary-safe triangle cells."""
    width, height = size
    image = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(image)

    def point(index):
        return (
            min(width - 1, max(0, float(uv[index, 0]) * width)),
            min(height - 1, max(0, float(uv[index, 1]) * height)),
        )

    for triangle in triangles:
        indices = [int(index) for index in triangle]
        points = [point(index) for index in indices]
        labels = [int(vertex_labels[index]) for index in indices]
        if labels[0] == labels[1] == labels[2]:
            draw.polygon(points, fill=labels[0])
            continue

        midpoint01 = (
            (points[0][0] + points[1][0]) * 0.5,
            (points[0][1] + points[1][1]) * 0.5,
        )
        midpoint12 = (
            (points[1][0] + points[2][0]) * 0.5,
            (points[1][1] + points[2][1]) * 0.5,
        )
        midpoint20 = (
            (points[2][0] + points[0][0]) * 0.5,
            (points[2][1] + points[0][1]) * 0.5,
        )
        center = (
            sum(value[0] for value in points) / 3.0,
            sum(value[1] for value in points) / 3.0,
        )
        draw.polygon(
            [points[0], midpoint01, center, midpoint20],
            fill=labels[0],
        )
        draw.polygon(
            [points[1], midpoint12, center, midpoint01],
            fill=labels[1],
        )
        draw.polygon(
            [points[2], midpoint20, center, midpoint12],
            fill=labels[2],
        )
    return np.asarray(image, dtype=np.uint8)


def build_region_reach_masks(
    uv,
    triangles,
    vertex_labels,
    vertex_to_welded,
    adjacency,
    region_ids,
    size,
    hops=2,
):
    """Map where each region is allowed to claim texels during smoothing.

    Two atlas charts can sit side by side in the PNG while describing opposite
    ends of the cortex, so UV proximity is not evidence of anatomical
    adjacency. Each region is therefore restricted to the triangles within a
    few geodesic hops of the surface it actually owns.
    """
    width, height = size
    welded_count = len(adjacency)
    reach = {}
    for region_id in region_ids:
        region_id = int(region_id)
        owned = np.zeros(welded_count, dtype=bool)
        owned[vertex_to_welded[vertex_labels == region_id]] = True
        if not owned.any():
            reach[region_id] = np.zeros((height, width), dtype=bool)
            continue
        frontier = np.flatnonzero(owned)
        for _ in range(hops):
            neighbours = set()
            for node in frontier:
                neighbours.update(adjacency[int(node)])
            frontier = [
                node for node in neighbours if not owned[node]
            ]
            if not frontier:
                break
            owned[frontier] = True

        allowed_vertices = owned[vertex_to_welded]
        image = Image.new("1", (width, height), 0)
        draw = ImageDraw.Draw(image)
        for triangle in triangles[allowed_vertices[triangles].any(axis=1)]:
            draw.polygon(
                [
                    (
                        min(width - 1, max(0, float(uv[index, 0]) * width)),
                        min(height - 1, max(0, float(uv[index, 1]) * height)),
                    )
                    for index in triangle
                ],
                fill=1,
            )
        reach[region_id] = np.asarray(image, dtype=bool)
    return reach


def _coverage_constrained_dilation(mask, coverage, iterations):
    """Grow a mask only through covered texels, never across a UV gutter."""
    grown = mask & coverage
    for _ in range(iterations):
        neighbours = np.zeros_like(grown)
        neighbours[:-1, :] |= grown[1:, :]
        neighbours[1:, :] |= grown[:-1, :]
        neighbours[:, :-1] |= grown[:, 1:]
        neighbours[:, 1:] |= grown[:, :-1]
        grown = (grown | neighbours) & coverage
    return grown


def smooth_categorical_boundaries(
    labels,
    coverage,
    region_ids,
    radius=12.0,
    component_scale=4,
    max_boundary_shift=6,
    region_reach=None,
):
    """Round triangle-cell sawteeth while preserving categorical coverage.

    Each region is blurred as an independent binary field. A texel changes
    owner only when another region holds a strict local majority *and* that
    region can reach the texel by walking across covered texels. Charts packed
    close together in UV space are separated by narrow gutters, and a blur
    alone will hop them and drop stray colour on unrelated cortex.
    """
    if labels.shape != coverage.shape:
        raise ValueError("Label and coverage dimensions differ")
    smoothed = labels.copy()
    height, width = labels.shape
    if height % component_scale or width % component_scale:
        raise ValueError("Atlas dimensions must be divisible by component scale")

    coarse_coverage = coverage.reshape(
        height // component_scale,
        component_scale,
        width // component_scale,
        component_scale,
    ).any(axis=(1, 3))
    coarse_height, coarse_width = coarse_coverage.shape
    coarse_components = np.zeros(
        coarse_coverage.shape, dtype=np.uint16
    )
    component_bounds = {}
    component_id = 0
    for start in np.flatnonzero(coarse_coverage):
        y, x = divmod(int(start), coarse_width)
        if coarse_components[y, x]:
            continue
        component_id += 1
        coarse_components[y, x] = component_id
        queue = deque([int(start)])
        min_x = max_x = x
        min_y = max_y = y
        while queue:
            index = queue.popleft()
            cy, cx = divmod(index, coarse_width)
            min_x = min(min_x, cx)
            max_x = max(max_x, cx)
            min_y = min(min_y, cy)
            max_y = max(max_y, cy)
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if (
                    0 <= ny < coarse_height
                    and 0 <= nx < coarse_width
                    and coarse_coverage[ny, nx]
                    and coarse_components[ny, nx] == 0
                ):
                    coarse_components[ny, nx] = component_id
                    queue.append(ny * coarse_width + nx)
        component_bounds[component_id] = (min_x, min_y, max_x, max_y)

    component_map = np.repeat(
        np.repeat(coarse_components, component_scale, axis=0),
        component_scale,
        axis=1,
    )
    component_map[~coverage] = 0
    # Recover high-resolution edge texels missed by coarse nearest expansion.
    unassigned = coverage & (component_map == 0)
    for _ in range(component_scale * 2):
        if not np.any(unassigned):
            break
        previous = component_map.copy()
        shifted_maps = [
            np.roll(previous, 1, axis=0),
            np.roll(previous, -1, axis=0),
            np.roll(previous, 1, axis=1),
            np.roll(previous, -1, axis=1),
        ]
        shifted_maps[0][0, :] = 0
        shifted_maps[1][-1, :] = 0
        shifted_maps[2][:, 0] = 0
        shifted_maps[3][:, -1] = 0
        for shifted in shifted_maps:
            fill = unassigned & (shifted > 0)
            component_map[fill] = shifted[fill]
            unassigned[fill] = False
    if np.any(unassigned):
        raise ValueError("Could not assign every covered texel to a UV component")

    valid_region_ids = set(int(value) for value in region_ids)
    margin = int(np.ceil(radius * 3))
    for current_component, bounds in component_bounds.items():
        min_x, min_y, max_x, max_y = bounds
        x0 = max(0, min_x * component_scale - margin)
        y0 = max(0, min_y * component_scale - margin)
        x1 = min(width, (max_x + 1) * component_scale + margin)
        y1 = min(height, (max_y + 1) * component_scale + margin)
        local_components = component_map[y0:y1, x0:x1]
        local_mask = local_components == current_component
        if not np.any(local_mask):
            continue
        local_labels = labels[y0:y1, x0:x1]
        local_ids = sorted(
            int(value)
            for value in np.unique(local_labels[local_mask])
            if int(value) in valid_region_ids
        )
        best_scores = np.full(local_labels.shape, -1.0, dtype=np.float32)
        best_ids = local_labels.copy()
        for region_id in local_ids:
            binary = np.where(
                local_mask & (local_labels == region_id), 255, 0
            ).astype(np.uint8)
            field = np.asarray(
                Image.fromarray(binary).filter(
                    ImageFilter.GaussianBlur(radius=radius)
                ),
                dtype=np.float32,
            )
            field += (local_labels == region_id).astype(np.float32) * 0.01
            reachable = _coverage_constrained_dilation(
                binary > 0, local_mask, max_boundary_shift
            )
            if region_reach is not None and region_id in region_reach:
                reachable &= region_reach[region_id][y0:y1, x0:x1]
            wins = reachable & (field > best_scores)
            best_ids[wins] = region_id
            best_scores[wins] = field[wins]
        # A contour pixel changes owner only when the replacement occupies a
        # strict majority of the Gaussian neighbourhood. This clips narrow
        # sawteeth but prevents a merely nearby colour from expanding outward.
        local_result = local_labels.copy()
        majority = local_mask & (best_scores > 127.5)
        local_result[majority] = best_ids[majority]
        target = smoothed[y0:y1, x0:x1]
        target[local_mask] = local_result[local_mask]
    smoothed[~coverage] = 0
    return smoothed


def triangle_region_candidates(
    vertex_labels, vertex_to_welded, triangles, max_labels=4
):
    """The label set each triangle may legitimately display.

    A texel lookup within half a texel of a chart border can read unrelated
    cortex, because this atlas packs charts without a gutter. The renderer
    validates every lookup against its own triangle's one-hop label set, so a
    stray colour cannot appear on geometry that does not touch that region.
    """
    welded_count = int(vertex_to_welded.max()) + 1
    welded_labels = np.zeros(welded_count, dtype=np.uint8)
    welded_labels[vertex_to_welded] = vertex_labels
    adjacency = [set() for _ in range(welded_count)]
    for a, b, c in vertex_to_welded[triangles]:
        for left, right in ((int(a), int(b)), (int(b), int(c)), (int(c), int(a))):
            if left != right:
                adjacency[left].add(right)
                adjacency[right].add(left)

    neighbourhood = [
        {int(welded_labels[node])}
        | {int(welded_labels[other]) for other in adjacency[node]}
        for node in range(welded_count)
    ]
    welded_triangles = vertex_to_welded[triangles]
    candidates = np.zeros((len(triangles), max_labels), dtype=np.uint8)
    for index, (a, b, c) in enumerate(welded_triangles):
        labels = sorted(
            (neighbourhood[int(a)] | neighbourhood[int(b)] | neighbourhood[int(c)])
            - {0}
        )
        if len(labels) > max_labels:
            raise ValueError(
                f"Triangle {index} touches {len(labels)} regions, "
                f"more than the {max_labels} the renderer can carry"
            )
        candidates[index, : len(labels)] = labels
    return candidates


def fill_label_pinholes(labels, coverage, radius=2, dominance=0.78, passes=2):
    """Flood tiny stragglers inside a region with the surrounding label.

    Triangle-cell rasterization can leave an isolated texel holding a
    neighbour's label. Alone it is invisible in the source rendering but reads
    as a speck once a single region is highlighted.
    """
    filled = labels.copy()
    present = [int(value) for value in np.unique(filled) if value]
    window = ImageFilter.BoxBlur(radius)
    threshold = dominance * 255.0
    for _ in range(passes):
        best_scores = np.zeros(filled.shape, dtype=np.float32)
        best_ids = filled.copy()
        for region_id in present:
            binary = np.where(filled == region_id, 255, 0).astype(np.uint8)
            field = np.asarray(
                Image.fromarray(binary).filter(window), dtype=np.float32
            )
            wins = field > best_scores
            best_ids[wins] = region_id
            best_scores[wins] = field[wins]
        stragglers = (
            coverage
            & (filled > 0)
            & (best_ids != filled)
            & (best_scores > threshold)
        )
        if not np.any(stragglers):
            break
        filled[stragglers] = best_ids[stragglers]
    return filled


def pad_labels_into_gutter(labels, coverage, pixels=12):
    """Bleed region labels outward so edge texel lookups never read empty space.

    A fragment's UV rounds to the nearest texel, so lookups along a chart border
    land just outside the rasterized footprint. Without this padding those
    lookups return no region and the surface renders pinholes along every
    triangle edge.
    """
    padded = np.where(coverage, labels, 0).astype(np.uint8)
    # Straight neighbours are consulted before diagonals so the nearest chart
    # claims a narrow gutter rather than one that merely touches it at a corner.
    directions = (
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (-1, 1),
        (1, -1),
        (1, 1),
    )
    for _ in range(pixels):
        if not np.any(padded == 0):
            break
        # Snapshot each step so a label advances exactly one texel per pass and
        # the padding band stays within the documented width.
        source = padded.copy()
        for dy, dx in directions:
            candidate = np.roll(source, (dy, dx), axis=(0, 1))
            if dy > 0:
                candidate[:dy, :] = 0
            elif dy < 0:
                candidate[dy:, :] = 0
            if dx > 0:
                candidate[:, :dx] = 0
            elif dx < 0:
                candidate[:, dx:] = 0
            fill = (padded == 0) & (candidate > 0)
            padded[fill] = candidate[fill]
    return padded


def surface_label_diagnostics(
    vertex_labels, vertex_to_welded, triangles, regions
):
    """Summarize final 3D connectivity and residual one-vertex spikes."""
    welded_count = int(vertex_to_welded.max()) + 1
    welded_labels = np.zeros(welded_count, dtype=np.uint8)
    welded_labels[vertex_to_welded] = vertex_labels
    adjacency = [set() for _ in range(welded_count)]
    for triangle in vertex_to_welded[triangles]:
        a, b, c = (int(value) for value in triangle)
        for left, right in ((a, b), (b, c), (c, a)):
            if left != right:
                adjacency[left].add(right)
                adjacency[right].add(left)

    report = {}
    for region in regions:
        region_id = int(region["id"])
        remaining = set(
            int(node) for node in np.flatnonzero(welded_labels == region_id)
        )
        component_sizes = []
        while remaining:
            start = remaining.pop()
            queue = [start]
            size = 1
            while queue:
                node = queue.pop()
                for neighbour in adjacency[node]:
                    if neighbour in remaining and welded_labels[neighbour] == region_id:
                        remaining.remove(neighbour)
                        queue.append(neighbour)
                        size += 1
            component_sizes.append(size)
        boundary_spikes = 0
        for node in np.flatnonzero(welded_labels == region_id):
            neighbours = adjacency[int(node)]
            if len(neighbours) < 3:
                continue
            same = sum(
                welded_labels[neighbour] == region_id
                for neighbour in neighbours
            )
            if same <= 1:
                boundary_spikes += 1
        report[str(region_id)] = {
            "components": len(component_sizes),
            "componentSizes": sorted(component_sizes, reverse=True),
            "boundarySpikeVertices": boundary_spikes,
        }
    return report


def count_coverage_components(coverage):
    height, width = coverage.shape
    visited = np.zeros_like(coverage)
    components = 0
    for start in np.flatnonzero(coverage):
        y, x = divmod(int(start), width)
        if visited[y, x]:
            continue
        components += 1
        visited[y, x] = True
        queue = deque([int(start)])
        while queue:
            index = queue.popleft()
            cy, cx = divmod(index, width)
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if (
                    0 <= ny < height
                    and 0 <= nx < width
                    and coverage[ny, nx]
                    and not visited[ny, nx]
                ):
                    visited[ny, nx] = True
                    queue.append(ny * width + nx)
    return components


def propagate_ids_within_coverage(seed_ids, coverage):
    """Legacy UV-island-local fill retained for small utility callers.

    Production atlas generation uses ``label_surface_from_seeds``. This helper
    deliberately performs no erosion and never propagates through UV gutters.
    """
    if seed_ids.shape != coverage.shape:
        raise ValueError("Seed and coverage dimensions differ")
    labels = np.where(coverage, seed_ids, 0).astype(np.uint8)
    height, width = labels.shape
    queue = deque(int(index) for index in np.flatnonzero(labels))
    while queue:
        index = queue.popleft()
        y, x = divmod(index, width)
        for ny, nx in (
            (y - 1, x),
            (y + 1, x),
            (y, x - 1),
            (y, x + 1),
        ):
            if (
                0 <= ny < height
                and 0 <= nx < width
                and coverage[ny, nx]
                and labels[ny, nx] == 0
            ):
                labels[ny, nx] = labels[y, x]
                queue.append(ny * width + nx)
    return labels
