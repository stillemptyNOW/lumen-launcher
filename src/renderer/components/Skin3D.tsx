import { useEffect, useRef, useState } from "react";
import { SkinViewer, IdleAnimation, WalkingAnimation } from "skinview3d";

type Props = {
  skinUrl?: string | null;
  capeUrl?: string | null;
  width?: number;
  height?: number;
  className?: string;
  /** Создавать WebGL только когда вкладка видима — иначе серый экран. */
  active?: boolean;
  /** Лёгкая ходьба, чтобы плащ развевался. */
  walk?: boolean;
};

/**
 * 3D-модель игрока (skinview3d) + встроенный плащ.
 * skinUrl / capeUrl: data: / https — data: предпочтительнее (нет CORS).
 */
export function Skin3D({
  skinUrl,
  capeUrl,
  width = 160,
  height = 220,
  className = "",
  active = true,
  walk = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "fail">("loading");

  useEffect(() => {
    if (!active) {
      const v = viewerRef.current;
      viewerRef.current = null;
      if (v) {
        try {
          v.dispose();
        } catch {
          /* ignore */
        }
      }
      setStatus("loading");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setStatus("loading");

    let viewer: SkinViewer | null = null;
    try {
      viewer = new SkinViewer({
        canvas,
        width,
        height,
        skin: skinUrl || undefined,
        cape: capeUrl || undefined,
      });
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.5;
      try {
        viewer.fov = 48;
      } catch {
        /* optional */
      }
      try {
        viewer.controls.enableZoom = false;
        viewer.controls.enablePan = false;
      } catch {
        /* optional */
      }
      try {
        if (walk) {
          // WalkingAnimation шевелит плащ
          viewer.animation = new WalkingAnimation();
          (viewer.animation as WalkingAnimation).speed = 0.55;
        } else {
          viewer.animation = new IdleAnimation();
        }
      } catch {
        try {
          viewer.animation = new IdleAnimation();
        } catch {
          /* optional */
        }
      }
      try {
        viewer.playerObject.rotation.y = Math.PI * 0.18;
      } catch {
        /* ignore */
      }

      // догрузка плаща, если конструктор не принял
      if (capeUrl) {
        void viewer.loadCape(capeUrl).catch((e) => console.warn("cape load", e));
      }

      viewerRef.current = viewer;
      if (!cancelled) setStatus("ok");
    } catch (e) {
      console.error("Skin3D", e);
      if (!cancelled) setStatus("fail");
      return;
    }

    return () => {
      cancelled = true;
      viewerRef.current = null;
      const v = viewer;
      if (v) {
        try {
          v.dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, [skinUrl, capeUrl, width, height, active, walk]);

  useEffect(() => {
    const v = viewerRef.current;
    if (v && active) {
      try {
        v.width = width;
        v.height = height;
      } catch {
        /* ignore */
      }
    }
  }, [width, height, active]);

  if (!active) {
    return <div className={`bg-[#151618] ${className}`} style={{ width, height }} aria-hidden />;
  }

  if (status === "fail") {
    return (
      <div
        className={`grid place-items-center bg-[#151618] text-mc-muted text-xs ${className}`}
        style={{ width, height }}
      >
        3D недоступен
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block bg-[#151618]"
        style={{ width, height }}
      />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-mc-muted text-xs pointer-events-none">…</div>
      )}
    </div>
  );
}
