"""Read a hand-annotated screenshot of the viewer.

Separates three things: the blue line the artist drew, the specimen silhouette
underneath it, and a normalised greyscale fingerprint of the engraving. The
fingerprint is what lets an arbitrary screenshot be matched back to the orbit
angle it was taken at, which is the only way a drawn outline can be mapped onto
the surface it was drawn on.
"""

import numpy as np
from PIL import Image

FINGERPRINT_GRID = 96
BACKGROUND_TONE = 235


def fill_interior(mask):
    """Everything not reachable from the border, so holes close but the
    silhouette's concavities survive."""
    height, width = mask.shape
    free = ~mask
    outside = np.zeros_like(mask)
    stack = [(0, 0, width - 1), (height - 1, 0, width - 1)]
    stack += [(y, 0, 0) for y in range(height)]
    stack += [(y, width - 1, width - 1) for y in range(height)]
    while stack:
        y, x_start, x_end = stack.pop()
        if y < 0 or y >= height:
            continue
        row = free[y]
        seen = outside[y]
        x = x_start
        while x <= x_end:
            if not row[x] or seen[x]:
                x += 1
                continue
            left = x
            while left > 0 and row[left - 1] and not seen[left - 1]:
                left -= 1
            right = x
            while right < width - 1 and row[right + 1] and not seen[right + 1]:
                right += 1
            seen[left : right + 1] = True
            stack.append((y - 1, left, right))
            stack.append((y + 1, left, right))
            x = right + 1
    return ~outside


def read_annotation(path):
    rgb = np.array(Image.open(path).convert("RGB")).astype(int)
    grey = np.array(Image.open(path).convert("L")).astype(int)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    annotation = (blue > 120) & (blue - red > 50) & (blue - green > 40)
    silhouette = fill_interior((grey < 190) | annotation)
    return {"grey": grey, "annotation": annotation, "silhouette": silhouette}


def fingerprint(grey, silhouette, grid=FINGERPRINT_GRID):
    """Crop to the specimen and resample under a single scale on both axes.

    Scaling each axis independently would normalise away the outline's
    proportions, and proportion is part of what separates one orbit angle from
    another.
    """
    ys, xs = np.nonzero(silhouette)
    if not len(ys):
        return np.full((grid, grid), float(BACKGROUND_TONE))
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    tone = np.where(silhouette, grey, BACKGROUND_TONE)[
        top : bottom + 1, left : right + 1
    ]
    height, width = tone.shape
    scale = (grid - 2) / max(height, width)
    size = (
        max(int(round(width * scale)), 1),
        max(int(round(height * scale)), 1),
    )
    resized = np.array(
        Image.fromarray(tone.astype(np.uint8)).resize(size, Image.BILINEAR)
    ).astype(float)
    canvas = np.full((grid, grid), float(BACKGROUND_TONE))
    y0 = (grid - resized.shape[0]) // 2
    x0 = (grid - resized.shape[1]) // 2
    canvas[y0 : y0 + resized.shape[0], x0 : x0 + resized.shape[1]] = resized
    return canvas
