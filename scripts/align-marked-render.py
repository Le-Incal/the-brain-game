"""Recover where a marked-up screenshot sits on the render it was drawn over.

The reference render is written with its projection, so a line drawn on it maps
onto the surface exactly - but only once the screenshot's crop and scale are
known. Both images come from the same pixels, so a normalised cross-correlation
over a small scale search recovers that mapping to within a pixel or two.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "docs/handoff/markup/DRAW_HERE_left_lateral.png"
BACKGROUND = 244
DOWNSAMPLE = 4


def annotation_mask(rgb):
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    return (blue > 140) & (blue - red > 45) & (blue - green > 30)


def prepared(image, drawn=None):
    """Ink intensity with the drawn marks and any UI chrome removed."""
    grey = np.array(image.convert("L")).astype(np.float64)
    if drawn is not None:
        grey = np.where(drawn, BACKGROUND, grey)
    # Screenshots can carry a dark editor edge; it is not part of the render.
    grey = np.where(grey < 40, BACKGROUND, grey)
    return BACKGROUND - grey


def correlate(reference, candidate):
    """Best translation of candidate within reference, and its score."""
    shape = tuple(
        int(2 ** np.ceil(np.log2(a + b)))
        for a, b in zip(reference.shape, candidate.shape)
    )
    numerator = np.fft.irfft2(
        np.fft.rfft2(reference, shape)
        * np.conj(np.fft.rfft2(candidate, shape)),
        shape,
    )
    energy = np.sqrt((reference**2).sum() * (candidate**2).sum())
    peak = np.unravel_index(numerator.argmax(), numerator.shape)
    # Circular correlation wraps, so a peak past the halfway point is a
    # negative shift.
    shift = tuple(
        int(index) - int(size) if index > size // 2 else int(index)
        for index, size in zip(peak, numerator.shape)
    )
    return float(numerator[peak] / max(energy, 1e-9)), shift


def align(marked_path, reference_path=REFERENCE, scales=None):
    marked = Image.open(marked_path).convert("RGB")
    drawn = annotation_mask(np.array(marked).astype(int))
    reference = Image.open(reference_path).convert("RGB")

    small_reference = prepared(
        reference.resize(
            (reference.width // DOWNSAMPLE, reference.height // DOWNSAMPLE),
            Image.LANCZOS,
        )
    )
    scales = scales if scales is not None else np.linspace(0.45, 0.85, 41)
    best = None
    for scale in scales:
        width = int(round(marked.width / scale / DOWNSAMPLE))
        height = int(round(marked.height / scale / DOWNSAMPLE))
        if width < 8 or height < 8 or width > small_reference.shape[1] * 2:
            continue
        resized = marked.resize((width, height), Image.LANCZOS)
        mask = Image.fromarray(drawn.astype(np.uint8) * 255).resize(
            (width, height), Image.NEAREST
        )
        score, (dy, dx) = correlate(
            small_reference, prepared(resized, np.array(mask) > 127)
        )
        if best is None or score > best["score"]:
            best = {
                "score": score,
                "scale": float(scale),
                "offset": (int(dx) * DOWNSAMPLE, int(dy) * DOWNSAMPLE),
            }
    return best, marked, drawn


def marked_to_reference(points, fit):
    """Marked-image pixels to reference-image pixels."""
    scale, (dx, dy) = fit["scale"], fit["offset"]
    return np.stack(
        [points[:, 0] / scale + dx, points[:, 1] / scale + dy], axis=1
    )


if __name__ == "__main__":
    import sys

    fit, marked, drawn = align(sys.argv[1])
    print(json.dumps(fit, indent=2))
    ys, xs = np.nonzero(drawn)
    mapped = marked_to_reference(
        np.stack([xs, ys], axis=1).astype(np.float64), fit
    )
    overlay = np.array(Image.open(REFERENCE).convert("RGB"))
    px = np.clip(np.round(mapped[:, 0]).astype(int), 0, overlay.shape[1] - 1)
    py = np.clip(np.round(mapped[:, 1]).astype(int), 0, overlay.shape[0] - 1)
    overlay[py, px] = (20, 90, 230)
    out = ROOT / "docs/handoff/markup/marked_aligned.png"
    Image.fromarray(overlay).save(out)
    print(out)
