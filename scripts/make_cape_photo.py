"""Full-photo cape (not pixel UV atlas) + high-res skinview atlas + blur mcmeta."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "resources" / "capes" / "pinkpantheress_src.jpg"
OUT = ROOT / "resources" / "capes"
MOD = (
    Path(__file__).resolve().parents[2]
    / "minecraft-26.2-launcher"
    / "mod"
    / "src"
    / "main"
    / "resources"
    / "assets"
    / "lumen"
    / "textures"
    / "entity"
)
MCMETA = """{
  "texture": {
    "blur": true,
    "clamp": true
  }
}
"""


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    MOD.mkdir(parents=True, exist_ok=True)

    photo = Image.open(SRC).convert("RGBA")
    w, h = photo.size
    target_h = 1024
    target_w = max(320, int(w * (target_h / h)))
    hd = photo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    hd = ImageEnhance.Color(hd).enhance(1.1)
    hd = ImageEnhance.Contrast(hd).enhance(1.05)
    hd = ImageEnhance.Sharpness(hd).enhance(1.15)
    hd = hd.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))

    # soft pink border so cape edges don't look cut off
    bordered = Image.new("RGBA", (hd.width + 12, hd.height + 12), (255, 130, 185, 255))
    bordered.paste(hd, (6, 6))
    hd = bordered.resize((target_w, target_h), Image.Resampling.LANCZOS)

    full = OUT / "pinkpantheress_full.png"
    hd.save(full, "PNG", optimize=True)
    hd.save(OUT / "pinkpantheress_hd.png", "PNG", optimize=True)
    hd.save(MOD / "pinkpantheress_cape.png", "PNG", optimize=True)
    (MOD / "pinkpantheress_cape.png.mcmeta").write_text(MCMETA, encoding="utf-8")
    (OUT / "pinkpantheress_cape.png.mcmeta").write_text(MCMETA, encoding="utf-8")

    # launcher skinview: 16× classic atlas (still atlas, but high-res → looks photo-like)
    scale = 16
    classic = Image.new("RGBA", (64 * scale, 32 * scale), (0, 0, 0, 0))
    aspect = 10 / 16
    side = min(hd.width, int(hd.height * aspect))
    left = (hd.width - side) // 2
    top = max(0, (hd.height - int(side / aspect)) // 2 - side // 10)
    face = hd.crop((left, top, left + side, top + int(side / aspect)))
    front = face.resize((10 * scale, 16 * scale), Image.Resampling.LANCZOS)
    back = front.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    classic.paste(front, (1 * scale, 1 * scale))
    classic.paste(back, (12 * scale, 1 * scale))
    classic.save(OUT / "pinkpantheress_skinview.png", "PNG", optimize=True)

    print("full", full, full.stat().st_size, hd.size)
    print("skinview", classic.size)
    print("mod", (MOD / "pinkpantheress_cape.png").stat().st_size)


if __name__ == "__main__":
    main()
