import { useState } from "react";
import { Skin3D } from "../components/Skin3D";
import { instLabel, useApp } from "../store";
import { selectedInstance } from "../App";

export function PlayPage({ active = true }: { active?: boolean }) {
  const account = useApp((s) => s.account);
  const instances = useApp((s) => s.instances);
  const settings = useApp((s) => s.settings);
  const news = useApp((s) => s.news);
  const log = useApp((s) => s.log);
  const step = useApp((s) => s.step);
  const progress = useApp((s) => s.progress);
  const busy = useApp((s) => s.busy);
  const skinUrl = useApp((s) => s.skinUrl);
  const capeUrl = useApp((s) => s.capeUrl);
  const refresh = useApp((s) => s.refresh);
  const pushLog = useApp((s) => s.pushLog);
  const inst = selectedInstance();
  const [offlineName, setOfflineName] = useState("");
  const [showOffline, setShowOffline] = useState(false);

  async function login() {
    useApp.setState({ busy: true });
    try {
      pushLog("Вход Microsoft: microsoft.com/link + код…");
      await window.lumen.account.login();
      pushLog("Вход выполнен.");
      await refresh();
    } catch (e) {
      pushLog(errText(e));
    } finally {
      useApp.setState({ busy: false });
    }
  }

  async function offline() {
    try {
      await window.lumen.account.offline(offlineName);
      setShowOffline(false);
      await refresh();
      pushLog(`Локальный ник: ${offlineName}`);
    } catch (e) {
      pushLog(errText(e));
    }
  }

  async function play() {
    if (!inst) {
      pushLog("Нет выбранного инстанса.");
      return;
    }
    useApp.setState({ busy: true, progress: 0.05 });
    try {
      pushLog(`Запуск «${inst.name}»…`);
      await window.lumen.game.play(inst.id);
      pushLog("Minecraft запущен. Right Shift — Lumen (Fabric 26.2).");
      useApp.setState({ progress: 1 });
      await refresh();
    } catch (e) {
      pushLog(errText(e));
      useApp.setState({ progress: 0 });
    } finally {
      useApp.setState({ busy: false });
    }
  }

  return (
    <div className="h-full min-h-full flex flex-col bg-mc-bg">
      <div className="shrink-0 px-6 py-5 bg-mc-panel border-b border-mc-line">
        <div className="text-2xl font-bold tracking-wide">MINECRAFT  JAVA  EDITION</div>
        <div className="text-sm text-mc-muted mt-1 truncate">{news || " "}</div>
      </div>

      <div className="shrink-0 px-6 py-4 flex gap-6 items-start border-b border-mc-line/50">
        <div className="shrink-0 rounded-sm overflow-hidden border border-mc-line shadow-lg bg-[#151618]">
          <Skin3D active={active} skinUrl={skinUrl} capeUrl={capeUrl} width={160} height={230} walk />
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="text-xl font-semibold truncate">{account?.name ?? "Не выполнен вход"}</div>
          <div className="text-sm text-mc-muted mt-1">
            {account?.type === "offline"
              ? "Локальный аккаунт · только одиночная / LAN"
              : account
                ? "Microsoft-аккаунт"
                : "Нужна лицензия Java Edition"}
            {" · "}
            {inst ? instLabel(inst) : "нет профиля"}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void login()}
              className="h-9 px-4 bg-mc-green hover:bg-mc-greenH rounded-sm text-sm disabled:opacity-50"
            >
              {account ? "Сменить Microsoft" : "Войти через Microsoft"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowOffline((v) => !v)}
              className="h-9 px-3 bg-mc-gray hover:bg-mc-grayH rounded-sm text-sm"
            >
              Локальный ник
            </button>
            {account && (
              <button
                type="button"
                onClick={() => void window.lumen.account.logout().then(refresh)}
                className="h-9 px-3 bg-mc-gray hover:bg-mc-grayH rounded-sm text-sm"
              >
                Выйти
              </button>
            )}
          </div>
          {showOffline && (
            <div className="flex gap-2 mt-2">
              <input
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Ник"
                className="h-9 px-3 bg-mc-panel2 border border-mc-line outline-none w-48"
              />
              <button type="button" onClick={() => void offline()} className="h-9 px-3 bg-mc-green rounded-sm text-sm">
                Создать
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 py-3">
        <div className="h-full min-h-[120px] bg-mc-panel border border-mc-line p-3 overflow-auto font-mono text-xs text-mc-muted whitespace-pre-wrap">
          {log.length
            ? log.join("\n")
            : "Готов. Войдите Microsoft → ИГРАТЬ.\nLumen: Right Shift · Essential: сеть/друзья · плащ PinkPantheress в превью."}
        </div>
      </div>

      <div className="shrink-0 bg-mc-panel border-t border-mc-line px-6 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-mc-muted">Профиль</span>
          <select
            className="h-10 px-3 bg-mc-panel2 border border-mc-line min-w-[240px] max-w-full"
            value={inst?.id ?? ""}
            onChange={(e) => void window.lumen.settings.set({ selectedInstance: e.target.value }).then(refresh)}
          >
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({instLabel(i)})
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <button
            type="button"
            disabled={busy || !settings || !inst}
            onClick={() => void play()}
            className="play-btn h-14 w-52 text-xl font-bold disabled:opacity-50"
          >
            {busy ? "…" : "ИГРАТЬ"}
          </button>
        </div>
        <div className="mt-3 h-2 bg-mc-panel2 rounded-sm overflow-hidden">
          <div className="h-full bg-mc-green transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="text-xs text-mc-muted mt-1 truncate">{step}</div>
      </div>
    </div>
  );
}

function errText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, "");
}
