"""Write region identity back into the painted master.

Only the COLOR_1 region channel is ever rewritten, in place, so the rest of the
artist's file - geometry, unwraps, vertex colours - is byte-for-byte preserved.
"""

import json
import struct
from pathlib import Path

import numpy as np

from atlas_uv import COMPONENT_DTYPES, TYPE_COMPONENTS

ATLAS_PATH = Path(__file__).resolve().parent.parent / "src/data/brainRegions.json"


def division_ids(region_ids):
    """The division each region belongs to, straight from the taxonomy.

    COLOR_1 carries region and division side by side, so rewriting one without
    the other leaves the model claiming a region sits in the wrong lobe.
    """
    atlas = json.loads(ATLAS_PATH.read_text())
    lookup = np.zeros(256, dtype=np.int64)
    for region in atlas["regions"]:
        lookup[region["id"]] = region["divisionId"]
    return lookup[np.asarray(region_ids)]


def write_color1(document, binary, values):
    accessor = document["accessors"][
        document["meshes"][0]["primitives"][0]["attributes"]["COLOR_1"]
    ]
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = COMPONENT_DTYPES[accessor["componentType"]]
    components = TYPE_COMPONENTS[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", dtype.itemsize * components)
    buffer = bytearray(binary)
    target = np.ndarray(
        shape=(accessor["count"], components),
        dtype=dtype,
        buffer=buffer,
        offset=offset,
        strides=(stride, dtype.itemsize),
    )
    target[:, 0] = values.astype(dtype)
    target[:, 1] = division_ids(values).astype(dtype)
    return bytes(buffer)


def write_glb(path, document, binary):
    document_bytes = json.dumps(document, separators=(",", ":")).encode()
    document_bytes += b" " * (-len(document_bytes) % 4)
    binary = binary + b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(document_bytes) + 8 + len(binary)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<III", 0x46546C67, 2, total))
        handle.write(struct.pack("<II", len(document_bytes), 0x4E4F534A))
        handle.write(document_bytes)
        handle.write(struct.pack("<II", len(binary), 0x004E4942))
        handle.write(binary)
