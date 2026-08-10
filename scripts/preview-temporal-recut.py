"""Render the proposed temporal recut beside the current paint, without applying it."""

import importlib.util
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
OUT = ROOT / "docs/handoff/markup"

# Superior temporal gyrus, Wernicke's area and primary auditory cortex share a
# family of hues in the published palette, which is right on screen and useless
# when the question is where the border runs.
CONTRAST = {"11": "#ff7f0e", "12": "#1f77b4", "13": "#d62728"}
VIEWS = {"left_lateral": 90.0, "right_lateral": -90.0}


def load(name):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), SCRIPTS / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main():
    repaint = load("repaint-temporal-regions")
    placement = load("render-region-placement")
    state = repaint.recut()
    OUT.mkdir(parents=True, exist_ok=True)

    for view, theta in VIEWS.items():
        panels = []
        for stage, labels in (
            ("current", state["labels"]),
            ("proposed", state["updated"]),
        ):
            path = OUT / f"{view}_{stage}_temporal.png"
            placement.render(
                theta,
                repaint.TERRITORY,
                str(path),
                overrides=CONTRAST,
                phi_degrees=90.0,
                labels=labels,
            )
            panels.append(np.array(Image.open(path).convert("RGB")))
        pair = np.concatenate(
            [panels[0], np.full((panels[0].shape[0], 12, 3), 120, np.uint8),
             panels[1]],
            axis=1,
        )
        Image.fromarray(pair).save(OUT / f"{view}_temporal_recut.png")
        print(f"{view}: {OUT / f'{view}_temporal_recut.png'}")


if __name__ == "__main__":
    main()
