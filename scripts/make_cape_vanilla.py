"""Classic 64x32 cape + 64x64 pad for MC 26.2 PlayerCapeModel — photo on front/back only."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

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


def face(img: Image.Image, tw: int, th: int) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    aspect = tw / th
    if w / h > aspect:
        nw = int(h * aspect)
        left = (w - nw) // 2
        box = (left, 0, left + nw, h)
    else:
        nh = int(w / aspect)
        top = max(0, (h - nh) // 2 - nh // 12)
        box = (0, top, w, top + nh)
    return img.crop(box).resize((tw, th), Image.Resampling.LANCZOS)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    MOD.mkdir(parents=True, exist_ok=True)

    photo = Image.open(SRC).convert("RGBA")
    photo = ImageEnhance.Color(photo).enhance(1.1)
    photo = ImageEnhance.Contrast(photo).enhance(1.06)
    photo = ImageEnhance.Sharpness(photo).enhance(1.2)

    # === Classic 64×32 (Minecraft cape standard) ===
    c32 = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    f = face(photo, 10, 16)
    b = ImageOps.mirror(f)
    c32.paste(f, (1, 1))
    c32.paste(b, (12, 1))
    # top edge of cape
    for x in range(1, 11):
        c32.putpixel((x, 0), (255, 140, 190, 255))
        c32.putpixel((x + 11, 0), (255, 140, 190, 255))

    # === 64×64 for PlayerCapeModel (content in top half, classic layout) ===
    c64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    c64.paste(c32, (0, 0))

    # HD 4× for sharper look (256×128 classic / 256×256 model) — UV still 64-space so scale content
    scale = 4
    c64hd = Image.new("RGBA", (64 * scale, 64 * scale), (0, 0, 0, 0))
    fhd = face(photo, 10 * scale, 16 * scale)
    bhd = ImageOps.mirror(fhd)
    # texOffs(0,0) box 10x16x1 → front at (1,1), back at (12,1) in 64-space → *scale
    c64hd.paste(fhd, (1 * scale, 1 * scale))
    c64hd.paste(bhd, (12 * scale, 1 * scale))
    pink = Image.new("RGBA", (10 * scale, 1 * scale), (255, 140, 190, 255))
    c64hd.paste(pink, (1 * scale, 0))
    c64hd.paste(pink, (12 * scale, 0))
    # thin sides so no black sampling
    side = Image.new("RGBA", (1 * scale, 16 * scale), (255, 120, 180, 255))
    c64hd.paste(side, (0, 1 * scale))
    c64hd.paste(side, (11 * scale, 1 * scale))
    c64hd.paste(side, (22 * scale, 1 * scale))

    # Use HD 256x256 as game cape (model UV /64 still maps correctly when texture is Nx)
    # Actually for non-64 textures, Minecraft uses the texture as-is with UV normalized by model 64.
    # So 256x256 with 4x layout is correct.
    cape_game = c64hd  # 256x256

    cape_game.save(MOD / "pinkpantheress_cape.png", "PNG", optimize=True)
    # NO blur mcmeta — nearest is fine for atlas; blur can smear into black edges
    meta = MOD / "pinkpantheress_cape.png.mcmeta"
    if meta.is_file():
        meta.unlink()

    c32.save(OUT / "pinkpantheress_skinview.png", "PNG")
    cape_game.save(OUT / "pinkpantheress_hd.png", "PNG")
    c32.save(OUT / "pinkpantheress.png", "PNG")

    print("game cape", cape_game.size, (MOD / "pinkpantheress_cape.png").stat().st_size)
    print("front mid", fhd.getpixel((20, 40)))


if __name__ == "__main__":
    main()
