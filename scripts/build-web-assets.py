"""Slim copies of the brain for the website (Kyle, 2026-10-20: "the internet is
slow where I am, and the brain doesn't load on the landing page").

The masters stay where the artwork scripts read them: public/brain.glb and
public/maps/. The site loads what this writes to public/web/:

- web/brain.glb: the master without its three embedded images. Our shader
  replaces the model's material, so the images were downloaded and decoded
  for nothing. Every accessor keeps its bytes exactly.
- web/maps/brain_{ao,cavity,curvature,etching}.png: one grey channel. The
  shader reads only the red channel of each, so the red channel is kept, pixel
  for pixel.

Run with `npm run web-assets` after any change to the masters.
"""

import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MASTER_GLB = ROOT / "public/brain.glb"
MASTER_MAPS = ROOT / "public/maps"
WEB = ROOT / "public/web"
MAPS = ["ao", "cavity", "curvature", "etching"]


def read_glb(path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67 and version == 2, "not a glTF 2.0 binary"
    offset = 12
    document = binary = None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8 : offset + 8 + length]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length
    return document, binary


def write_glb(path, document, binary):
    text = json.dumps(document, separators=(",", ":")).encode("utf8")
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(text), 0x4E4F534A) + text
    out += struct.pack("<II", len(binary), 0x004E4942) + binary
    path.write_bytes(out)


def view_bytes(document, binary, index):
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return binary[start : start + view["byteLength"]]


def slim_model():
    document, binary = read_glb(MASTER_GLB)
    unused = {image["bufferView"] for image in document.get("images", []) if "bufferView" in image}
    kept = [index for index in range(len(document["bufferViews"])) if index not in unused]
    remap = {old: new for new, old in enumerate(kept)}

    views, data = [], bytearray()
    for old in kept:
        view = dict(document["bufferViews"][old])
        chunk = view_bytes(document, binary, old)
        data += b"\0" * (-len(data) % 4)
        view["byteOffset"] = len(data)
        view["buffer"] = 0
        data += chunk
        views.append(view)

    slim = {key: value for key, value in document.items() if key not in ("images", "textures", "samplers")}
    slim["bufferViews"] = views
    slim["buffers"] = [{"byteLength": len(data) + (-len(data) % 4)}]
    slim["accessors"] = [dict(accessor, bufferView=remap[accessor["bufferView"]]) if "bufferView" in accessor else dict(accessor) for accessor in document["accessors"]]
    for material in slim.get("materials", []):
        material.pop("normalTexture", None)
        material.pop("occlusionTexture", None)
        material.pop("emissiveTexture", None)
        pbr = material.get("pbrMetallicRoughness")
        if pbr:
            pbr.pop("baseColorTexture", None)
            pbr.pop("metallicRoughnessTexture", None)

    out = WEB / "brain.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_glb(out, slim, bytes(data))

    # Every accessor's bytes, exactly as in the master.
    check, check_binary = read_glb(out)
    for master_accessor, slim_accessor in zip(document["accessors"], check["accessors"]):
        assert view_bytes(document, binary, master_accessor["bufferView"]) == view_bytes(check, check_binary, slim_accessor["bufferView"])
    print(f"web/brain.glb: {MASTER_GLB.stat().st_size / 1e6:.1f} MB -> {out.stat().st_size / 1e6:.1f} MB")


def slim_maps():
    total_before = total_after = 0
    for name in MAPS:
        master_path = MASTER_MAPS / f"brain_{name}.png"
        out = WEB / "maps" / f"brain_{name}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        master = np.asarray(Image.open(master_path))
        red = master[..., 0] if master.ndim == 3 else master
        Image.fromarray(np.ascontiguousarray(red), "L").save(out, optimize=True)
        # The one channel the shader reads, pixel for pixel.
        assert np.array_equal(np.asarray(Image.open(out)), red), f"{name}: red channel changed"
        total_before += master_path.stat().st_size
        total_after += out.stat().st_size
        print(f"web/maps/brain_{name}.png: {master_path.stat().st_size / 1e6:.1f} MB -> {out.stat().st_size / 1e6:.1f} MB")
    print(f"maps: {total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB")


if __name__ == "__main__":
    slim_model()
    slim_maps()
