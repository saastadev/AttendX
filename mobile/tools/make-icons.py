"""Builds the Android launcher icons and splash screens from the web app's icon.

Run from mobile/:  python3 tools/make-icons.py
Source: ../attendx-v2/public/icons/icon-512.png (navy square, check mark, name).
The launcher uses the check mark alone (the name is unreadable at icon size).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SRC = Path("../attendx-v2/public/icons/icon-512.png")
RES = Path("android/app/src/main/res")

src = Image.open(SRC).convert("RGB")
W, H = src.size
bg = src.getpixel((4, 4))

# The mark is the bright part of the top ~62% of the icon, above the wordmark.
top = src.crop((0, 0, W, int(H * 0.62)))
mask = top.point(lambda v: 255 if v > 70 else 0).convert("L")
r, g, b = top.split()
lum = Image.merge("RGB", (r, g, b)).convert("L").point(lambda v: 255 if v > 60 else 0)
box = lum.getbbox()
pad = 6
mark = src.crop((box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad))
# Transparent version: alpha from distance to the background colour.
def cutout(img):
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            pr, pg, pb, _ = px[x, y]
            d = max(abs(pr - bg[0]), abs(pg - bg[1]), abs(pb - bg[2]))
            a = max(0, min(255, int((d - 12) * 4)))
            px[x, y] = (pr, pg, pb, a)
    return img
mark_rgba = cutout(mark)

def square_mark(size, fraction):
    """The mark scaled to `fraction` of a transparent square canvas."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    m = int(size * fraction)
    scale = m / max(mark_rgba.size)
    scaled = mark_rgba.resize(
        (max(1, int(mark_rgba.width * scale)), max(1, int(mark_rgba.height * scale))),
        Image.LANCZOS,
    )
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas

def on_bg(img, shape):
    size = img.width
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    plate = Image.new("RGBA", (size, size), bg + (255,))
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    if shape == "round":
        d.ellipse((0, 0, size - 1, size - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    base.paste(plate, (0, 0), m)
    base.alpha_composite(img)
    return base

DENSITY = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, f in DENSITY.items():
    d = RES / f"mipmap-{name}"
    # Adaptive foreground: 108dp canvas, mark inside the 66dp safe zone.
    square_mark(int(108 * f), 0.56).save(d / "ic_launcher_foreground.png")
    legacy = square_mark(int(48 * f), 0.74)
    on_bg(legacy, "square").save(d / "ic_launcher.png")
    on_bg(legacy, "round").save(d / "ic_launcher_round.png")

# Splash screens (Android 11 and older; 12+ shows the launcher icon on the colour).
for folder in sorted(RES.glob("drawable*")):
    splash = folder / "splash.png"
    if not splash.exists():
        continue
    w, h = Image.open(splash).size
    img = Image.new("RGBA", (w, h), bg + (255,))
    s = int(min(w, h) * 0.34)
    img.alpha_composite(square_mark(s, 1.0), ((w - s) // 2, (h - s) // 2))
    img.convert("RGB").save(splash)

hexbg = "#%02X%02X%02X" % bg
(RES / "values" / "ic_launcher_background.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    f'    <color name="ic_launcher_background">{hexbg}</color>\n</resources>\n'
)
print("background", hexbg, "mark box", box)
