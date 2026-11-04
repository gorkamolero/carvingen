"""Compose the two RGBA renders from blender/render_ref.py into the two-camera reference frame for the video model.

MOCAP_CREATURE=assets/dragon python tools/compose_ref.py runs/dragon/ref       ref_front.png + ref_side.png -> ref.png
The frame is the layout's: grey studio wall, lighter floor band, front view left, side view right, a dark divider.
"""
import pathlib, sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from mocap import layout  # noqa: E402

d = pathlib.Path(sys.argv[1])
f = np.array(Image.open(d / "ref_front.png").convert("RGBA"))
s = np.array(Image.open(d / "ref_side.png").convert("RGBA"))
Image.fromarray(layout.compose(f, s)).save(d / "ref.png")
print("wrote", d / "ref.png", f"{layout.W} x {layout.H}")
