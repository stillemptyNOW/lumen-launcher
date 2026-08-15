import { Skin3D } from "../components/Skin3D";
import { useApp } from "../store";

export function SkinsPage({ active = true }: { active?: boolean }) {
  const account = useApp((s) => s.account);
  const skinUrl = useApp((s) => s.skinUrl);
  const capeUrl = useApp((s) => s.capeUrl);

  return (
    <div className="h-full min-h-full p-6 bg-mc-bg overflow-auto">
      <h1 className="text-2xl font-bold mb-2">Скины и плащ</h1>
      <p className="text-sm text-mc-muted mb-4 max-w-xl">
        3D-превью скина + HD-плащ <span className="text-pink-300 font-semibold">PinkPantheress</span>.
        Плащ виден и в лаунчере, и в игре (мод Lumen). Сеть — Essential на Fabric 26.2.
      </p>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="inline-block bg-mc-panel border border-mc-line p-4">
          <Skin3D active={active} skinUrl={skinUrl} capeUrl={capeUrl} width={300} height={420} walk />
          <div className="text-center mt-3 font-semibold">{account?.name ?? "—"}</div>
          <div className="text-center text-xs text-pink-300/90 mt-1">Плащ · PinkPantheress</div>
        </div>

        <div className="bg-mc-panel border border-mc-line p-4 max-w-sm space-y-3">
          <div className="text-lg font-semibold text-pink-300">Встроенный плащ</div>
          <p className="text-sm text-mc-muted leading-relaxed">
            HD-текстура 512×512 с оригинальным фото — в игре через Lumen (не пиксельная 10×16).
            В превью лаунчера — 3D-модель с анимацией плаща.
          </p>
          {capeUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={capeUrl}
                alt="cape atlas"
                className="w-24 h-12 border border-mc-line bg-black"
                style={{ imageRendering: "pixelated" }}
              />
              <span className="text-xs text-mc-muted">текстура плаща</span>
            </div>
          ) : (
            <div className="text-xs text-red-400">Плащ не загрузился — переустановите лаунчер.</div>
          )}
          <div className="text-sm text-mc-muted border-t border-mc-line pt-3">
            <div className="text-white font-medium mb-1">Essential (мультиплеер)</div>
            При запуске профиля <b>Fabric 26.2 + Lumen</b> лаунчер ставит Essential: хост мира для друзей,
            чат и приглашения. В игре — кнопка Essential в меню.
          </div>
        </div>
      </div>
    </div>
  );
}
