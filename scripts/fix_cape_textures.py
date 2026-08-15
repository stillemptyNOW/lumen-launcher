"""Fix cape textures: atlas for PlayerSkin/Essential, full photo for in-world only."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance

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
    photo = ImageEnhance.Color(photo).enhance(1.1)
    photo = ImageEnhance.Contrast(photo).enhance(1.06)
    photo = ImageEnhance.Sharpness(photo).enhance(1.2)

    h = 1024
    w = max(320, int(photo.width * h / photo.height))
    full = photo.resize((w, h), Image.Resampling.LANCZOS)

    full.save(OUT / "pinkpantheress_full.png", "PNG", optimize=True)
    full.save(MOD / "pinkpantheress_photo.png", "PNG", optimize=True)
    (MOD / "pinkpantheress_photo.png.mcmeta").write_text(MCMETA, encoding="utf-8")

    # Proper MC cape atlas 512x512 (8x of 64) — UV for 10x16x1 at texOffs(0,0)
    s = 8
    atlas = Image.new("RGBA", (64 * s, 64 * s), (0, 0, 0, 0))
    pw, ph = full.size
    side_w = min(pw, int(ph * 10 / 16))
    side_h = int(side_w * 16 / 10)
    left = (pw - side_w) // 2
    top = max(0, (ph - side_h) // 2 - side_h // 8)
    face = full.crop((left, top, left + side_w, top + side_h))
    front = face.resize((10 * s, 16 * s), Image.Resampling.LANCZOS)
    back = front.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    d, ww, hh = 1 * s, 10 * s, 16 * s
    atlas.paste(front, (d, d))
    atlas.paste(back, (d + ww + d, d))
    atlas.paste(Image.new("RGBA", (ww, d), (255, 130, 180, 255)), (d, 0))
    atlas.paste(Image.new("RGBA", (d, hh), (255, 110, 170, 255)), (0, d))
    atlas.paste(Image.new("RGBA", (d, hh), (255, 110, 170, 255)), (d + ww, d))

    atlas.save(MOD / "pinkpantheress_cape.png", "PNG", optimize=True)
    (MOD / "pinkpantheress_cape.png.mcmeta").write_text(MCMETA, encoding="utf-8")
    atlas.save(OUT / "pinkpantheress_hd.png", "PNG", optimize=True)

    # skinview classic 16x
    sv = 16
    classic = Image.new("RGBA", (64 * sv, 32 * sv), (0, 0, 0, 0))
    f2 = face.resize((10 * sv, 16 * sv), Image.Resampling.LANCZOS)
    b2 = f2.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    classic.paste(f2, (1 * sv, 1 * sv))
    classic.paste(b2, (12 * sv, 1 * sv))
    classic.save(OUT / "pinkpantheress_skinview.png", "PNG", optimize=True)

    print("full", full.size)
    print("atlas", atlas.size)
    print("classic", classic.size)
    print("mod", [p.name for p in MOD.iterdir()])


if __name__ == "__main__":
    main()
