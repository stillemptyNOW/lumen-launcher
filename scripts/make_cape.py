"""Build Minecraft 64x32 PinkPantheress cape texture from a portrait image."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
SRC_CANDIDATES = [
    Path(r"C:\Users\7ims (admin)\.grok\sessions\C%3A%5CUsers%5C7ims%20%28admin%29%5CDesktop%5C%D0%98%D0%98%20%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82%D1%8B%5CGrok\01a0003d-6bdd-7c63-9d60-72d74a849ef8\images\1.jpg"),
    ROOT / "resources" / "capes" / "pinkpantheress_photo.png",
    ROOT / "resources" / "capes" / "pinkpantheress_photo.jpg",
]
OUT = ROOT / "resources" / "capes"


def main() -> None:
    src = next((p for p in SRC_CANDIDATES if p.is_file()), None)
    if not src:
        raise SystemExit("No source portrait found")

    OUT.mkdir(parents=True, exist_ok=True)
    photo = Image.open(src).convert("RGBA")
    w, h = photo.size
    side = min(w, h)
    left = (w - side) // 2
    top = max(0, (h - side) // 2 - side // 10)
    face = photo.crop((left, top, left + side, top + side))
    face = ImageEnhance.Color(face).enhance(1.15)
    face = ImageEnhance.Contrast(face).enhance(1.08)

    # Minecraft cape atlas 64x32
    cape = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    base = Image.new("RGBA", (10, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(10):
            t = y / 15
            r = int(255 * (1 - t * 0.25))
            g = int(120 + 80 * (1 - t))
            b = int(170 + 40 * t)
            base.putpixel((x, y), (r, g, b, 255))

    portrait = face.resize((10, 16), Image.Resampling.LANCZOS)
    front = Image.blend(base, portrait, 0.85)
    for x in range(10):
        if x not in (0, 9):
            continue
        for y in range(16):
            px = front.getpixel((x, y))
            front.putpixel((x, y), (max(0, px[0] - 40), max(0, px[1] - 40), max(0, px[2] - 40), 255))

    back = portrait.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    back = Image.blend(base, back, 0.7)
    top_strip = Image.new("RGBA", (10, 1), (255, 140, 190, 255))

    cape.paste(front, (1, 1))
    cape.paste(back, (12, 1))
    cape.paste(top_strip, (1, 0))
    cape.paste(top_strip, (12, 0))
    for y in range(1, 17):
        cape.putpixel((0, y), (255, 105, 180, 255))
        cape.putpixel((11, y), (255, 105, 180, 255))
        cape.putpixel((22, y), (255, 105, 180, 255))
    for x in range(1, 11):
        cape.putpixel((x, 17), (255, 80, 160, 255))
        cape.putpixel((x + 11, 17), (255, 80, 160, 255))

    cape_path = OUT / "pinkpantheress.png"
    cape.save(cape_path, "PNG")

    preview = face.resize((160, 200), Image.Resampling.LANCZOS)
    prev = Image.new("RGBA", (168, 208), (255, 105, 180, 255))
    prev.paste(preview, (4, 4))
    prev.save(OUT / "pinkpantheress_preview.png", "PNG")

    photo_resized = photo.copy()
    photo_resized.thumbnail((512, 720), Image.Resampling.LANCZOS)
    photo_resized.save(OUT / "pinkpantheress_photo.png", "PNG")

    print("cape", cape_path, cape_path.stat().st_size)
    print("front sample", cape.getpixel((5, 8)))


if __name__ == "__main__":
    main()
