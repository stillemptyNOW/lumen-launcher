"""HD PinkPantheress cape for Minecraft (512x512 = 8x of 64x64 UV layout)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "resources" / "capes" / "pinkpantheress_src.jpg"
OUT = ROOT / "resources" / "capes"
MOD_ASSETS = (
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
SCALE = 8  # 64*8 = 512
W, H = 64 * SCALE, 64 * SCALE


def paste_cover(dst: Image.Image, src: Image.Image, box: tuple[int, int, int, int]) -> None:
    """Fit src into box covering fully (center crop)."""
    x0, y0, x1, y1 = box
    tw, th = x1 - x0, y1 - y0
    sw, sh = src.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale) + 1, int(sh * scale) + 1
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = max(0, (nh - th) // 2 - nh // 12)
    crop = resized.crop((left, top, left + tw, top + th))
    crop = ImageEnhance.Color(crop).enhance(1.12)
    crop = ImageEnhance.Contrast(crop).enhance(1.05)
    crop = crop.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))
    dst.paste(crop, (x0, y0))


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"missing source: {SRC}")
    photo = Image.open(SRC).convert("RGBA")
    # soft pink underlay
    cape = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # Vanilla cape UV (on 64 atlas): front roughly (0,0)-(10,16), back (10? actually model texOffs 0,0 box 10x16x1)
    # Classic layout used by skinview3d / MC:
    #   front: (1,1)-(11,17) on 64x32 → scale to 64x64 model which uses 0,0 and 10x16
    # We'll paint full panels at scaled coords matching texOffs(0,0) 10x16x1:
    # cube faces for 10x16x1 box:
    #   front 10x16 at u=1,v=1 (with 1px padding typical) OR at 0,0
    # PlayerCapeModel: texOffs(0,0), box -5,0,-1 size 10,16,1
    # Cube UV layout (Minecraft):
    #   top:    (depth, 0) size width x depth
    #   bottom: (depth+width, 0)
    #   right:  (0, depth) size depth x height
    #   front:  (depth, depth) size width x height
    #   left:   (depth+width, depth)
    #   back:   (depth+width+depth, depth)
    # width=10, height=16, depth=1
    d, w, h = 1 * SCALE, 10 * SCALE, 16 * SCALE
    # front at (d, d) = (8, 8) size 80x128
    front_box = (d, d, d + w, d + h)
    back_box = (d + w + d, d, d + w + d + w, d + h)
    # top strip
    top_box = (d, 0, d + w, d)

    pink = Image.new("RGBA", (w, h), (255, 120, 180, 255))
    for y in range(h):
        t = y / max(h - 1, 1)
        for x in range(w):
            pink.putpixel((x, y), (255, int(110 + 40 * (1 - t)), int(160 + 30 * t), 255))

    paste_cover(cape, photo, front_box)
    # back: mirrored portrait
    back_photo = photo.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    paste_cover(cape, back_photo, back_box)
    # blend slight pink vignette on edges of front
    front = cape.crop(front_box)
    for x in range(front.width):
        for y in range(front.height):
            edge = min(x, front.width - 1 - x, y, front.height - 1 - y)
            if edge < 4:
                px = front.getpixel((x, y))
                a = 1 - edge / 4
                front.putpixel(
                    (x, y),
                    (
                        int(px[0] * (1 - 0.25 * a) + 255 * 0.25 * a),
                        int(px[1] * (1 - 0.25 * a) + 120 * 0.25 * a),
                        int(px[2] * (1 - 0.25 * a) + 180 * 0.25 * a),
                        255,
                    ),
                )
    cape.paste(front, front_box[:2])

    # top
    top = Image.new("RGBA", (w, d), (255, 140, 190, 255))
    cape.paste(top, top_box[:2])

    # side faces (depth=1) solid pink
    for u0 in (0, d + w):
        side = Image.new("RGBA", (d, h), (255, 100, 170, 255))
        cape.paste(side, (u0, d))

    OUT.mkdir(parents=True, exist_ok=True)
    MOD_ASSETS.mkdir(parents=True, exist_ok=True)

    hd_path = OUT / "pinkpantheress_hd.png"
    cape.save(hd_path, "PNG", optimize=True)

    # vanilla-compatible 64x64 (for fallback)
    small = cape.resize((64, 64), Image.Resampling.LANCZOS)
    small_path = OUT / "pinkpantheress.png"
    small.save(small_path, "PNG")

    # mod resource (HD)
    mod_path = MOD_ASSETS / "pinkpantheress_cape.png"
    cape.save(mod_path, "PNG", optimize=True)

    # skinview3d prefers classic 64x32 cape layout
    classic = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
    # front 10x16 at 1,1 — use high quality downscale from HD front
    f = cape.crop(front_box).resize((10, 16), Image.Resampling.LANCZOS)
    b = cape.crop(back_box).resize((10, 16), Image.Resampling.LANCZOS)
    classic.paste(f, (1, 1))
    classic.paste(b, (12, 1))
    classic.save(OUT / "pinkpantheress_skinview.png", "PNG")

    # full photo for UI
    photo_ui = photo.copy()
    photo_ui.thumbnail((480, 860), Image.Resampling.LANCZOS)
    photo_ui.save(OUT / "pinkpantheress_photo.png", "PNG")

    print("HD", hd_path, hd_path.stat().st_size)
    print("mod", mod_path, mod_path.stat().st_size)
    print("classic", (OUT / "pinkpantheress_skinview.png").stat().st_size)


if __name__ == "__main__":
    main()
