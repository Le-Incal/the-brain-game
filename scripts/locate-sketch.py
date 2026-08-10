"""Put the hand-drawn sketch onto a render of the model and read what it covers.

The sketch was drawn over the app at its default orbit angle, so the same angle
is rendered here and the two silhouettes are aligned by their bounding boxes.
That is enough to answer the only question that matters: which regions the
drawn outlines actually enclose on this model.
"""

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
OUT = ROOT / "docs/handoff/markup"
SKETCH = Path(
    "/Users/kylemertensmeyer/.cursor/projects/"
    "Users-kylemertensmeyer-the-brain-game/assets/"
    "Screenshot_2026-08-10_at_1.09.24_AM-e160c493-caf0-4910-8450-19e5a88907a6.png"
)
# BrainOrbitControls defaults: theta = pi/2, phi = 0.44 * pi.
DEFAULT_THETA = 90.0
DEFAULT_PHI = 79.2


def load(name):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), SCRIPTS / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def bbox(mask):
    ys, xs = np.nonzero(mask)
    return xs.min(), xs.max(), ys.min(), ys.max()


def main():
    placement = load("render-region-placement")
    annotation_image = load("annotation_image")

    render_path = OUT / "default_view_regions.png"
    placement.render(
        DEFAULT_THETA, [], str(render_path), phi_degrees=DEFAULT_PHI
    )
    render = np.array(Image.open(render_path).convert("RGB"))
    buffer = np.load(render_path.with_suffix(".npy"))

    sketch = annotation_image.read_annotation(SKETCH)
    drawn = sketch["annotation"]
    source = sketch["silhouette"]
    target = buffer > 0

    sx0, sx1, sy0, sy1 = bbox(source)
    tx0, tx1, ty0, ty1 = bbox(target)
    ys, xs = np.nonzero(drawn)
    mapped_x = np.round(
        (xs - sx0) / (sx1 - sx0) * (tx1 - tx0) + tx0
    ).astype(int)
    mapped_y = np.round(
        (ys - sy0) / (sy1 - sy0) * (ty1 - ty0) + ty0
    ).astype(int)
    inside = (
        (mapped_x >= 0)
        & (mapped_x < buffer.shape[1])
        & (mapped_y >= 0)
        & (mapped_y < buffer.shape[0])
    )
    mapped_x, mapped_y = mapped_x[inside], mapped_y[inside]

    line = np.zeros(buffer.shape, dtype=bool)
    line[mapped_y, mapped_x] = True
    # Resampling to the render's grid punches holes in the strokes, and a loop
    # with a hole floods. Thicken before filling.
    sealed = line.copy()
    for _ in range(3):
        grown = sealed.copy()
        for shift in (1, -1):
            grown |= np.roll(sealed, shift, axis=0)
            grown |= np.roll(sealed, shift, axis=1)
        sealed = grown
    # The two outlines are closed loops, so their interiors are what the sketch
    # is actually naming.
    enclosed = annotation_image.fill_interior(sealed) & ~sealed

    atlas = json.loads((ROOT / "src/data/brainRegions.json").read_text())
    names = {r["id"]: r["name"] for r in atlas["regions"]}
    covered = buffer[enclosed & target]
    total = max(len(covered), 1)
    tally = sorted(
        (
            (int(np.count_nonzero(covered == rid)), int(rid))
            for rid in np.unique(covered)
            if rid > 0
        ),
        reverse=True,
    )
    print(f"sketch encloses {len(covered)} surface pixels")
    for count, rid in tally[:8]:
        print(f"  {count / total:6.1%}  {rid:>2}  {names[rid]}")

    overlay = render.copy()
    grow = line.copy()
    for shift in (1, -1):
        grow |= np.roll(line, shift, axis=0) | np.roll(line, shift, axis=1)
    overlay[grow] = (30, 90, 220)
    Image.fromarray(overlay).save(OUT / "sketch_over_model.png")
    print(OUT / "sketch_over_model.png")


if __name__ == "__main__":
    main()
