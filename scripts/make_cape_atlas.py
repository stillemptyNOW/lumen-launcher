"""HD Minecraft cape atlas with PinkPantheress photo — correct UV, no black bars."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

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


def face_crop(img: Image.Image, tw: int, th: int) -> Image.Image:
    """Center-crop portrait to cape panel aspect (10:16)."""
    img = img.convert("RGBA")
    w, h = img.size
    target_aspect = tw / th
    src_aspect = w / h
    if src_aspect > target_aspect:
        nw = int(h * target_aspect)
        left = (w - nw) // 2
        box = (left, 0, left + nw, h)
    else:
        nh = int(w / target_aspect)
        # slightly above center (face)
        top = max(0, (h - nh) // 2 - nh // 10)
        box = (0, top, w, top + nh)
    cropped = img.crop(box)
    return cropped.resize((tw, th), Image.Resampling.LANCZOS)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    MOD.mkdir(parents=True, exist_ok=True)

    photo = Image.open(SRC).convert("RGBA")
    photo = ImageEnhance.Color(photo).enhance(1.12)
    photo = ImageEnhance.Contrast(photo).enhance(1.08)
    photo = ImageEnhance.Sharpness(photo).enhance(1.25)
    photo = photo.filter(ImageFilter.UnsharpMask(radius=1.0, percent=90, threshold=2))

    # 16× vanilla 64 atlas → 1024×1024, cape face 160×256 of real photo
    s = 16
    W, H = 64 * s, 64 * s
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # PlayerCapeModel texOffs(0,0) box 10×16×1 on 64×64:
    # front (1,1)-(11,17), back (12,1)-(22,17), sides, top
    d, ww, hh = 1 * s, 10 * s, 16 * s  # 16, 160, 256

    front = face_crop(photo, ww, hh)
    # soft pink edge so sides never sample pure black
    edge = Image.new("RGBA", (ww, hh), (255, 140, 190, 255))
    front = Image.alpha_composite(edge, front)
    back = ImageOps.mirror(front)

    pink = (255, 120, 175, 255)
    atlas.paste(front, (d, d))  # front
    atlas.paste(back, (d + ww + d, d))  # back
    atlas.paste(Image.new("RGBA", (ww, d), pink), (d, 0))  # top
    atlas.paste(Image.new("RGBA", (d, hh), pink), (0, d))  # right strip
    atlas.paste(Image.new("RGBA", (d, hh), pink), (d + ww, d))  # left strip
    # bottom fringe under front/back
    atlas.paste(Image.new("RGBA", (ww, d), (255, 90, 160, 255)), (d, d + hh))
    atlas.paste(Image.new("RGBA", (ww, d), (255, 90, 160, 255)), (d + ww + d, d + hh))

    cape_path = MOD / "pinkpantheress_cape.png"
    atlas.save(cape_path, "PNG", optimize=True)
    (MOD / "pinkpantheress_cape.png.mcmeta").write_text(MCMETA, encoding="utf-8")
    atlas.save(OUT / "pinkpantheress_hd.png", "PNG", optimize=True)
    (OUT / "pinkpantheress_cape.png.mcmeta").write_text(MCMETA, encoding="utf-8")

    # also keep a full photo copy for reference (not used as cape UV)
    fh = 1024
    fw = max(320, int(photo.width * fh / photo.height))
    full = photo.resize((fw, fh), Image.Resampling.LANCZOS)
    full.save(OUT / "pinkpantheress_full.png", "PNG", optimize=True)
    # remove old broken full-photo-as-cape if present
    old_photo = MOD / "pinkpantheress_photo.png"
    if old_photo.is_file():
        old_photo.unlink()
    old_meta = MOD / "pinkpantheress_photo.png.mcmeta"
    if old_meta.is_file():
        old_meta.unlink()

    # skinview 16× classic 64×32
    sv = 16
    classic = Image.new("RGBA", (64 * sv, 32 * sv), (0, 0, 0, 0))
    f2 = front.resize((10 * sv, 16 * sv), Image.Resampling.LANCZOS)
    b2 = ImageOps.mirror(f2)
    classic.paste(f2, (1 * sv, 1 * sv))
    classic.paste(b2, (12 * sv, 1 * sv))
    classic.save(OUT / "pinkpantheress_skinview.png", "PNG", optimize=True)

    print("atlas", cape_path, cape_path.stat().st_size, atlas.size)
    print("front sample", front.getpixel((ww // 2, hh // 3)))


if __name__ == "__main__":
    main()
